import {
  BRAZILIAN_STATE_CODES,
  type BrazilianStateCode,
} from '../types/professional-profile'

const ibgeStatePrefixes: Record<BrazilianStateCode, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
}

export function isIbgeMunicipalityCodeForState(
  stateCode: string,
  ibgeCode: string,
) {
  const normalizedStateCode = stateCode.trim().toUpperCase()
  const normalizedIbgeCode = ibgeCode.trim()
  if (
    !BRAZILIAN_STATE_CODES.includes(normalizedStateCode as BrazilianStateCode) ||
    !/^\d{7}$/.test(normalizedIbgeCode)
  ) {
    return false
  }
  return normalizedIbgeCode.startsWith(
    ibgeStatePrefixes[normalizedStateCode as BrazilianStateCode],
  )
}
