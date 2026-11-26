import type { ProfessionalAppointmentSummary } from '../../types/service-request'

export function appointmentStatusLabel(status: ProfessionalAppointmentSummary['status']) {
  if (status === 'COMPLETED') return 'Concluído'
  return status === 'IN_PROGRESS' ? 'Em andamento' : 'Confirmado'
}
