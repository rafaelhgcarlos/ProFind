import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfessionalProfile } from '../../../types/professional-profile'
import { ProfessionalReviewPage } from './ProfessionalReviewPage'

const mocks = vi.hoisted(() => ({
  loadProfessionalProfile: vi.fn(),
  findByProfessionalId: vi.fn(),
  listHistory: vi.fn(),
}))

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../auth/use-auth', () => ({
  useAuth: () => ({ user: { uid: 'user-123' } }),
}))

vi.mock('../../onboarding/use-profile', () => ({
  useProfile: () => ({ profile: { name: 'Marina Souza' } }),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../../services/professional-profile.service', () => ({
  loadProfessionalProfile: mocks.loadProfessionalProfile,
}))

vi.mock('../../../services/professional-review.service', () => ({
  professionalReviewService: {
    findByProfessionalId: mocks.findByProfessionalId,
    listHistory: mocks.listHistory,
  },
}))

const profile: ProfessionalProfile = {
  userId: 'user-123',
  publicName: 'Marina Souza',
  headline: 'Eletricista residencial',
  bio: 'Instalações e reparos.',
  categoryIds: ['construction'],
  specialtyIds: ['electrician'],
  experienceYears: 8,
  baseLocation: { city: 'Campinas', stateCode: 'SP', ibgeCode: '3509502' },
  serviceMode: 'CITY_ONLY',
  serviceRadiusKm: null,
  selectedCities: [],
  availability: 'AVAILABLE',
  phone: '11999998888',
  contactVisibility: 'PRIVATE',
  privateLocation: { postalCode: '13083852' },
  profileImage: null,
  portfolioImages: [],
  status: 'PUBLISHED',
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    professionalId: 'user-123',
    reviewStatus: 'UNDER_REVIEW',
    active: false,
    profileVersion: 1,
    submittedVersion: 1,
    approvedVersion: null,
    revision: 1,
    lastEventId: 'review-1',
    professionalFeedback: null,
    approvedCategoryIds: [],
    approvedSpecialtyIds: [],
    approvedBaseCityIbgeCode: '',
    approvedSelectedCityIbgeCodes: [],
    eligibleCityIbgeCodes: [],
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfessionalReviewPage />
    </MemoryRouter>,
  )
}

describe('ProfessionalReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadProfessionalProfile.mockResolvedValue(profile)
    mocks.findByProfessionalId.mockResolvedValue(review())
    mocks.listHistory.mockResolvedValue([])
  })

  it('shows requested changes, allowed feedback and the immutable history', async () => {
    mocks.findByProfessionalId.mockResolvedValue(
      review({
        reviewStatus: 'CHANGES_REQUESTED',
        submittedVersion: null,
        professionalFeedback: 'Atualize a descrição da região atendida.',
      }),
    )
    mocks.listHistory.mockResolvedValue([
      {
        eventId: 'review-2',
        entityType: 'PROFESSIONAL',
        entityId: 'user-123',
        professionalId: 'user-123',
        actorId: 'admin-1',
        actorRole: 'ADMIN',
        action: 'CHANGES_REQUESTED',
        reasonCode: 'ADMIN_DECISION',
        fromStatus: 'UNDER_REVIEW',
        toStatus: 'CHANGES_REQUESTED',
        profileVersion: 1,
        reviewedVersion: 1,
        reason: 'Atualize a descrição da região atendida.',
        createdAt: new Date('2026-10-28T12:00:00Z'),
      },
    ])

    renderPage()

    expect(await screen.findAllByText('Ajustes solicitados')).toHaveLength(2)
    expect(
      screen.getAllByText('Atualize a descrição da região atendida.'),
    ).toHaveLength(2)
    expect(
      screen.getByRole('link', { name: 'Corrigir e reenviar' }),
    ).toHaveAttribute('href', '/profissional/perfil')
    expect(screen.getByText('Ajustes solicitados', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Revise os pontos indicados e envie novamente.')).toBeInTheDocument()
    expect(screen.queryByText(/Versão 1/)).not.toBeInTheDocument()
  })

  it('does not present approval as operational access while activation is pending', async () => {
    mocks.findByProfessionalId.mockResolvedValue(
      review({
        reviewStatus: 'APPROVED',
        approvedVersion: 1,
        submittedVersion: 1,
        active: false,
      }),
    )

    renderPage()

    expect(
      await screen.findByText('Cadastro aprovado — demonstração'),
    ).toBeInTheDocument()
    expect(screen.getByText('Seu cadastro foi aprovado e aguarda ativação.')).toBeInTheDocument()
    expect(
      screen.getByText('Você ainda não pode receber oportunidades'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Para receber oportunidades, seu cadastro precisa estar aprovado e ativo.',
      ),
    ).toBeInTheDocument()

    const details = screen.getByText('Detalhes da análise').closest('details')
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText('Versão do cadastro:')).toBeInTheDocument()
  })

  it('clearly confirms when an approved profile is active', async () => {
    mocks.findByProfessionalId.mockResolvedValue(
      review({
        reviewStatus: 'APPROVED',
        approvedVersion: 1,
        submittedVersion: 1,
        active: true,
      }),
    )

    renderPage()

    expect(
      await screen.findAllByText(
        'Seu cadastro está aprovado e habilitado para receber oportunidades.',
      ),
    ).toHaveLength(2)
    expect(
      screen.getByText('Você já pode receber oportunidades'),
    ).toBeInTheDocument()
  })

  it.each([
    ['DRAFT', 'Rascunho'],
    ['UNDER_REVIEW', 'Em análise'],
    ['REJECTED', 'Cadastro rejeitado'],
    ['SUSPENDED', 'Cadastro suspenso'],
  ])('shows clear guidance for the %s state', async (reviewStatus, label) => {
    mocks.findByProfessionalId.mockResolvedValue(
      review({
        reviewStatus,
        submittedVersion: reviewStatus === 'UNDER_REVIEW' ? 1 : null,
        professionalFeedback:
          reviewStatus === 'REJECTED' || reviewStatus === 'SUSPENDED'
            ? 'Procure o suporte para orientações.'
            : null,
      }),
    )

    renderPage()

    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(
      screen.getByText('Você ainda não pode receber oportunidades'),
    ).toBeInTheDocument()
    if (reviewStatus === 'REJECTED' || reviewStatus === 'SUSPENDED') {
      expect(
        screen.getByRole('link', { name: /falar com o suporte pelo whatsapp/i }),
      ).toBeInTheDocument()
    }
  })

  it('keeps a legacy profile unapproved and offers retry after a load failure', async () => {
    mocks.findByProfessionalId.mockResolvedValue(null)
    const legacyView = renderPage()

    expect(
      await screen.findByText('Cadastro ainda não enviado para análise'),
    ).toBeInTheDocument()
    expect(screen.getByText(/abra seu perfil, revise os dados/i)).toBeInTheDocument()
    legacyView.unmount()

    mocks.findByProfessionalId.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('offline')).toBeInTheDocument()
    mocks.findByProfessionalId.mockResolvedValue(review())
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Em análise')).toBeInTheDocument()
  })
})
