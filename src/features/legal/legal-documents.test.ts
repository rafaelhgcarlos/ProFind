import { describe, expect, it } from 'vitest'

import {
  CURRENT_LEGAL_ACCEPTANCE,
  isCurrentLegalAcceptance,
  LEGAL_DOCUMENTS,
} from './legal-documents'

describe('legal documents', () => {
  it('expõe as versões vigentes usadas no cadastro', () => {
    expect(CURRENT_LEGAL_ACCEPTANCE).toEqual({
      termsVersion: LEGAL_DOCUMENTS.terms.version,
      privacyPolicyVersion: LEGAL_DOCUMENTS.privacyPolicy.version,
    })
    expect(LEGAL_DOCUMENTS.terms.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(LEGAL_DOCUMENTS.privacyPolicy.effectiveDate).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })

  it('rejeita aceite de uma versão desatualizada', () => {
    expect(
      isCurrentLegalAcceptance({
        termsVersion: '0.9.0',
        privacyPolicyVersion: LEGAL_DOCUMENTS.privacyPolicy.version,
      }),
    ).toBe(false)
  })
})
