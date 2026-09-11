export interface LegalAcceptanceVersions {
  termsVersion: string
  privacyPolicyVersion: string
}

export const LEGAL_DOCUMENTS = {
  terms: {
    version: '1.0.0',
    effectiveDate: '2026-09-11',
    effectiveDateLabel: '11 de setembro de 2026',
  },
  privacyPolicy: {
    version: '1.0.0',
    effectiveDate: '2026-09-11',
    effectiveDateLabel: '11 de setembro de 2026',
  },
} as const

export const CURRENT_LEGAL_ACCEPTANCE: LegalAcceptanceVersions = {
  termsVersion: LEGAL_DOCUMENTS.terms.version,
  privacyPolicyVersion: LEGAL_DOCUMENTS.privacyPolicy.version,
}

export function isCurrentLegalAcceptance(
  acceptance: LegalAcceptanceVersions | undefined,
): acceptance is LegalAcceptanceVersions {
  return (
    acceptance?.termsVersion === CURRENT_LEGAL_ACCEPTANCE.termsVersion &&
    acceptance.privacyPolicyVersion ===
      CURRENT_LEGAL_ACCEPTANCE.privacyPolicyVersion
  )
}
