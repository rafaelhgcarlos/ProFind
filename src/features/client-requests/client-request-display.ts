import type { ServiceRequestSummary } from '../../types/service-request'

export function hasExpiredAcceptance(request: ServiceRequestSummary, now: Date) {
  return request.status === 'OPEN' && request.acceptUntil.getTime() <= now.getTime()
}

export function clientRequestStatus(request: ServiceRequestSummary, now = new Date()) {
  if (hasExpiredAcceptance(request, now)) return 'Prazo encerrado'
  if (request.status === 'OPEN') {
    return request.reopenReason ? 'Procurando substituto' : 'Procurando profissional'
  }
  if (request.status === 'ASSIGNED') return 'Confirmado'
  if (request.status === 'IN_PROGRESS') return 'Em atendimento'
  if (request.status === 'COMPLETED') return 'Conclusão informada'
  return 'Cancelado'
}

export function clientRequestStatusVariant(request: ServiceRequestSummary, now = new Date()) {
  if (hasExpiredAcceptance(request, now)) return 'warning' as const
  if (request.status === 'CANCELLED') return 'destructive' as const
  if (request.status === 'COMPLETED') return 'success' as const
  if (request.status === 'IN_PROGRESS') return 'warning' as const
  if (request.status === 'ASSIGNED') return 'default' as const
  return 'outline' as const
}

export function requestGuidance(request: ServiceRequestSummary, now = new Date()) {
  if (hasExpiredAcceptance(request, now)) {
    return request.reopenReason
      ? 'O prazo desta busca por substituto encerrou. Acompanhe as atualizações ou procure o suporte.'
      : 'O prazo para aceite encerrou. Este pedido ainda não tem atendimento confirmado.'
  }
  if (request.status === 'OPEN') {
    return request.reopenReason
      ? 'A busca por um substituto está aberta. O atendimento depende de um novo aceite.'
      : 'A busca está aberta. O atendimento só fica confirmado após o aceite de um profissional.'
  }
  return null
}
