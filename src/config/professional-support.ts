export const DEFAULT_PROFESSIONAL_SUPPORT_WHATSAPP = '5512991706194'

export const PROFESSIONAL_SUPPORT_MESSAGE =
  'Olá, preciso de ajuda para realizar meu cadastro profissional no ProFind.'

function normalizedWhatsAppNumber(value: string | undefined) {
  if (value === undefined) return DEFAULT_PROFESSIONAL_SUPPORT_WHATSAPP
  const digits = value.replace(/\D/g, '')
  return /^\d{12,15}$/.test(digits) ? digits : null
}

export function professionalSupportUrl(
  configuredNumber = import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER,
) {
  const number = normalizedWhatsAppNumber(configuredNumber)
  if (!number) return null

  return `https://wa.me/${number}?text=${encodeURIComponent(PROFESSIONAL_SUPPORT_MESSAGE)}`
}
