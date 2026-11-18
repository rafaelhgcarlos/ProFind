import type { ServiceRequestSummary } from '../../types/service-request'

export function clientRequestStatus(request: ServiceRequestSummary) {
  if (request.status === 'OPEN') {
    return request.reopenReason ? 'Procurando substituto' : 'Procurando profissional'
  }
  if (request.status === 'ASSIGNED') return 'Confirmado'
  if (request.status === 'IN_PROGRESS') return 'Em atendimento'
  if (request.status === 'COMPLETED') return 'Conclusão informada'
  return 'Cancelado'
}

export function clientRequestStatusVariant(request: ServiceRequestSummary) {
  if (request.status === 'CANCELLED') return 'destructive' as const
  if (request.status === 'COMPLETED') return 'success' as const
  if (request.status === 'IN_PROGRESS') return 'warning' as const
  if (request.status === 'ASSIGNED') return 'default' as const
  return 'outline' as const
}

export function formatServiceDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day, 12))
}

export function requestGuidance(request: ServiceRequestSummary, now = new Date()) {
  if (request.status === 'OPEN' && request.acceptUntil.getTime() <= now.getTime()) {
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
