import type { Firestore } from 'firebase/firestore'

import { getFirebaseAuth, getFirebaseFirestore } from '../lib/firebase'
import {
  createServiceReportRepository,
  type ResolveServiceReportInput,
  type OwnServiceReportsSnapshot,
  type ServiceReportRepositoryDependencies,
} from '../repositories/service-report.repository'
import {
  ServiceReportError,
  type AdminServiceReportFilters,
  type ServiceReportDecision,
  type ServiceReportReason,
} from '../types/service-report'
import type { ServicePeriod } from '../types/service-request'
import { getServiceRequestSchedulingWindow } from './service-period-policy'

const operationKeyPattern = /^[a-zA-Z0-9_-]{20,100}$/

interface ServiceReportServiceDependencies extends ServiceReportRepositoryDependencies {
  firestore: Firestore
  getActorId(): string | null
  isOnline?(): boolean
}

export interface OpenServiceReportServiceInput {
  operationKey: string
  requestId: string
  reason: ServiceReportReason
  description: string
}

export interface OwnServiceReportsSubscriptionInput {
  requestId: string
  onReports(snapshot: OwnServiceReportsSnapshot): void
  onError(error: ServiceReportError): void
}

export interface ReviewServiceReportServiceInput {
  reportId: string
  operationKey: string
  expectedRevision: number
  internalNote: string
  proposedServiceDate?: string
  proposedPeriod?: ServicePeriod
}

export interface ResolveServiceReportServiceInput {
  reportId: string
  operationKey: string
  expectedRevision: number
  decision: ServiceReportDecision
  justification: string
  internalNote?: string
}

function externalErrorCode(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
  ) {
    return error.code.replace('firestore/', '')
  }
  return null
}

function normalizeError(error: unknown) {
  if (error instanceof ServiceReportError) return error
  const code = externalErrorCode(error)
  if (code === 'permission-denied') {
    return new ServiceReportError(
      'permission-denied',
      'VocÃª nÃ£o tem permissÃ£o para realizar esta operaÃ§Ã£o.',
      { cause: error },
    )
  }
  if (code === 'failed-precondition') {
    return new ServiceReportError(
      'unavailable',
      'A consulta requer um Ã­ndice que ainda nÃ£o estÃ¡ disponÃ­vel.',
      { cause: error },
    )
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new ServiceReportError(
      'unavailable',
      'O serviÃ§o de relatos estÃ¡ temporariamente indisponÃ­vel.',
      { cause: error },
    )
  }
  return new ServiceReportError(
    'unknown',
    'NÃ£o foi possÃ­vel concluir a operaÃ§Ã£o do relato.',
    { cause: error },
  )
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function validOperationKey(value: string) {
  if (!operationKeyPattern.test(value)) {
    throw new ServiceReportError('validation', 'Identificador da operaÃ§Ã£o invÃ¡lido.')
  }
  return value
}

function boundedText(value: string, label: string, min: number, max: number) {
  const normalized = normalizeText(value)
  if (normalized.length < min || normalized.length > max) {
    throw new ServiceReportError(
      'validation',
      `${label} deve ter entre ${min} e ${max} caracteres.`,
    )
  }
  return normalized
}

export function createServiceReportService(
  dependencies: ServiceReportServiceDependencies,
) {
  const repository = createServiceReportRepository(dependencies)
  const inFlight = new Map<string, Promise<unknown>>()

  function actorId() {
    const id = dependencies.getActorId()
    if (!id) throw new ServiceReportError('unauthenticated', 'Entre na sua conta para continuar.')
    return id
  }

  function assertOnline() {
    const online = dependencies.isOnline?.()
      ?? (typeof navigator === 'undefined' || navigator.onLine !== false)
    if (!online) {
      throw new ServiceReportError(
        'offline',
        'Conecte-se Ã  internet para confirmar esta operaÃ§Ã£o.',
      )
    }
  }

  async function safely<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (error) {
      throw normalizeError(error)
    }
  }

  function once<T>(key: string, operation: () => Promise<T>) {
    const pending = inFlight.get(key)
    if (pending) return pending as Promise<T>
    const promise = safely(operation)
    inFlight.set(key, promise)
    void promise.finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key)
    }).catch(() => undefined)
    return promise
  }

  return {
    openReport(input: OpenServiceReportServiceInput) {
      assertOnline()
      const clientId = actorId()
      const operationKey = validOperationKey(input.operationKey)
      const requestId = input.requestId.trim()
      if (!requestId) throw new ServiceReportError('validation', 'Pedido invÃ¡lido.')
      if (!['NO_SHOW', 'SERVICE_PROBLEM', 'OTHER'].includes(input.reason)) {
        throw new ServiceReportError('validation', 'Selecione um motivo vÃ¡lido.')
      }
      const description = boundedText(input.description, 'A descriÃ§Ã£o', 10, 500)
      return once(`open:${operationKey}`, () => repository.openReport({
        operationKey,
        requestId,
        clientId,
        reason: input.reason,
        description,
      }))
    },

    listOwnReports(requestId: string) {
      const clientId = actorId()
      return safely(() => repository.listOwnReports(requestId.trim(), clientId))
    },

    subscribeOwnReports(input: OwnServiceReportsSubscriptionInput) {
      const clientId = actorId()
      return repository.subscribeOwnReports(input.requestId.trim(), clientId, {
        onReports: input.onReports,
        onError: (error) => input.onError(normalizeError(error)),
      })
    },

    acknowledgeProposal(reportId: string) {
      assertOnline()
      const clientId = actorId()
      return once(`ack:${reportId}`, () =>
        repository.acknowledgeProposal(reportId.trim(), clientId))
    },

    listReports(input?: AdminServiceReportFilters) {
      actorId()
      return safely(() => repository.listReports(input))
    },

    getAdminDetail(reportId: string) {
      actorId()
      return safely(() => repository.getAdminDetail(reportId.trim()))
    },

    reviewReport(input: ReviewServiceReportServiceInput) {
      assertOnline()
      const adminId = actorId()
      const operationKey = validOperationKey(input.operationKey)
      const internalNote = boundedText(input.internalNote, 'A nota interna', 10, 1000)
      const hasDate = Boolean(input.proposedServiceDate)
      const hasPeriod = Boolean(input.proposedPeriod)
      if (hasDate !== hasPeriod) {
        throw new ServiceReportError(
          'validation',
          'Informe data e perÃ­odo juntos para propor reagendamento.',
        )
      }
      const proposal = hasDate && input.proposedPeriod
        ? (() => {
            try {
              const window = getServiceRequestSchedulingWindow(
                input.proposedServiceDate!,
                input.proposedPeriod,
                dependencies.now?.() ?? new Date(),
              )
              return {
                serviceDate: input.proposedServiceDate!,
                period: input.proposedPeriod,
                periodStartAt: window.startsAt,
                acceptUntil: window.acceptUntil,
              }
            } catch (error) {
              throw new ServiceReportError(
                'validation',
                error instanceof Error ? error.message : 'Reagendamento invÃ¡lido.',
              )
            }
          })()
        : null
      return once(`review:${operationKey}`, () => repository.reviewReport({
        reportId: input.reportId.trim(),
        adminId,
        operationKey,
        expectedRevision: input.expectedRevision,
        internalNote,
        proposal,
      }))
    },

    resolveReport(input: ResolveServiceReportServiceInput) {
      assertOnline()
      const adminId = actorId()
      const operationKey = validOperationKey(input.operationKey)
      const justification = boundedText(input.justification, 'A justificativa', 10, 1000)
      const internalNote = input.internalNote?.trim()
        ? boundedText(input.internalNote, 'A nota interna', 10, 1000)
        : undefined
      const normalized: ResolveServiceReportInput = {
        ...input,
        reportId: input.reportId.trim(),
        adminId,
        operationKey,
        justification,
        internalNote,
      }
      return once(`resolve:${operationKey}`, () => repository.resolveReport(normalized))
    },
  }
}

let defaultService: ReturnType<typeof createServiceReportService> | undefined

function getDefaultService() {
  defaultService ??= createServiceReportService({
    firestore: getFirebaseFirestore(),
    getActorId: () => getFirebaseAuth().currentUser?.uid ?? null,
  })
  return defaultService
}

export const serviceReportService = {
  openReport(input: OpenServiceReportServiceInput) {
    return getDefaultService().openReport(input)
  },
  listOwnReports(requestId: string) {
    return getDefaultService().listOwnReports(requestId)
  },
  subscribeOwnReports(input: OwnServiceReportsSubscriptionInput) {
    return getDefaultService().subscribeOwnReports(input)
  },
  acknowledgeProposal(reportId: string) {
    return getDefaultService().acknowledgeProposal(reportId)
  },
  listReports(input?: AdminServiceReportFilters) {
    return getDefaultService().listReports(input)
  },
  getAdminDetail(reportId: string) {
    return getDefaultService().getAdminDetail(reportId)
  },
  reviewReport(input: ReviewServiceReportServiceInput) {
    return getDefaultService().reviewReport(input)
  },
  resolveReport(input: ResolveServiceReportServiceInput) {
    return getDefaultService().resolveReport(input)
  },
}
