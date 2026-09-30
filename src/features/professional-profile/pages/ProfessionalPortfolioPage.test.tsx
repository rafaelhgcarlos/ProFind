import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfessionalProfile } from '../../../types/professional-profile'
import { ProfessionalPortfolioPage } from './ProfessionalPortfolioPage'

const mocks = vi.hoisted(() => ({
  loadProfessionalProfile: vi.fn(),
  saveProfessionalProfile: vi.fn(),
  listAvailableCatalog: vi.fn(),
  syncProfessionalProfile: vi.fn(),
  imageUpload: vi.fn(),
  imageRetry: vi.fn(),
  imageRemove: vi.fn(),
  imagePrepareRemoval: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../auth/use-auth', () => ({
  useAuth: () => ({ user: { uid: 'user-123' } }),
}))

vi.mock('../../onboarding/use-profile', () => ({
  useProfile: () => ({
    profile: { name: 'Marina Souza' },
    syncProfessionalProfile: mocks.syncProfessionalProfile,
  }),
}))

vi.mock('../../../services/catalog.service', () => ({
  listAvailableCatalog: mocks.listAvailableCatalog,
}))

vi.mock('../../../services/professional-profile.service', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('../../../services/professional-profile.service')
  >()
  return {
    ...original,
    loadProfessionalProfile: mocks.loadProfessionalProfile,
    saveProfessionalProfile: mocks.saveProfessionalProfile,
  }
})

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

vi.mock('../../../providers/image-provider.factory', () => ({
  getImageProvider: () => ({
    name: 'test',
    configured: true,
    upload: mocks.imageUpload,
    retry: mocks.imageRetry,
    prepareRemoval: mocks.imagePrepareRemoval,
    remove: mocks.imageRemove,
  }),
}))

const catalog = {
  categories: [
    { id: 'construction', name: 'Construção Civil', active: true, order: 10 },
  ],
  specialties: [
    {
      id: 'electrician',
      categoryId: 'construction',
      name: 'Eletricista',
      active: true,
      order: 10,
    },
  ],
}

function portfolioImage(index: number) {
  return {
    provider: 'IMAGEKIT' as const,
    ownerId: 'user-123',
    purpose: 'PROFESSIONAL_PORTFOLIO' as const,
    url: `https://images.example/portfolio-${index}.webp`,
    providerId: `portfolio-${index}`,
    createdAt: 100 + index,
    updatedAt: 100 + index,
    order: index - 1,
    altText: `Quadro elétrico residencial finalizado ${index}`,
  }
}

const profile: ProfessionalProfile = {
  userId: 'user-123',
  publicName: 'Marina Souza',
  headline: 'Eletricista residencial',
  bio: '',
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

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfessionalPortfolioPage />
    </MemoryRouter>,
  )
}

describe('ProfessionalPortfolioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadProfessionalProfile.mockResolvedValue(profile)
    mocks.listAvailableCatalog.mockResolvedValue(catalog)
    mocks.imageUpload.mockImplementation(async ({ file }: { file: File }) => ({
      provider: 'IMAGEKIT',
      url: `https://images.example/${file.name}.webp`,
      providerId: `uploaded-${file.name}`,
    }))
    mocks.imageRetry.mockResolvedValue({
      provider: 'IMAGEKIT',
      url: 'https://images.example/retry.webp',
      providerId: 'uploaded-retry',
    })
    mocks.imageRemove.mockResolvedValue(undefined)
    mocks.imagePrepareRemoval.mockResolvedValue(undefined)
    mocks.saveProfessionalProfile.mockImplementation(
      async (_userId, input, status) => ({
        ...profile,
        ...input,
        status,
      }),
    )
  })

  it('apresenta estado vazio didático e usa somente PROFESSIONAL_PORTFOLIO', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Seu portfólio ainda está vazio' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Nenhuma imagem adicionada')).toBeInTheDocument()
    expect(screen.getByText(/JPEG, PNG ou WebP · até 5 MB/i)).toBeInTheDocument()

    await user.upload(
      screen.getByLabelText('Adicionar primeira foto'),
      new File(['image'], 'primeira.png', { type: 'image/png' }),
    )

    expect(mocks.imageUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user-123',
        purpose: 'PROFESSIONAL_PORTFOLIO',
      }),
    )
    expect(mocks.imageUpload).not.toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'PROFESSIONAL_AVATAR' }),
    )
    expect(mocks.imageUpload).not.toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'CLIENT_AVATAR' }),
    )
  })

  it('permite retry, texto alternativo e persiste somente referência HTTPS', async () => {
    mocks.imageUpload.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderPage()

    await user.upload(
      await screen.findByLabelText('Adicionar primeira foto'),
      new File(['image'], 'falha.png', { type: 'image/png' }),
    )
    expect(await screen.findByText(/não foi possível enviar a imagem/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    const altText = await screen.findByLabelText('Texto alternativo da imagem 1')
    fireEvent.change(altText, {
      target: { value: 'Instalação elétrica concluída com acabamento branco' },
    })
    await user.click(screen.getAllByRole('button', { name: 'Salvar portfólio' })[0])

    expect(mocks.imageRetry).toHaveBeenCalledOnce()
    const savedInput = mocks.saveProfessionalProfile.mock.calls.at(-1)?.[1]
    expect(savedInput.portfolioImages).toEqual([
      expect.objectContaining({
        ownerId: 'user-123',
        purpose: 'PROFESSIONAL_PORTFOLIO',
        url: 'https://images.example/retry.webp',
        altText: 'Instalação elétrica concluída com acabamento branco',
      }),
    ])
    expect(JSON.stringify(savedInput)).not.toMatch(/blob:|data:image|CLIENT_AVATAR|PROFESSIONAL_AVATAR/)
    expect(mocks.syncProfessionalProfile).toHaveBeenCalled()
  })

  it('mantém as imagens salvas quando um novo upload falha', async () => {
    mocks.loadProfessionalProfile.mockResolvedValue({
      ...profile,
      portfolioImages: [portfolioImage(1)],
    })
    mocks.imageUpload.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByRole('img', { name: portfolioImage(1).altText }),
    ).toHaveAttribute('src', portfolioImage(1).url)
    await user.upload(
      screen.getByLabelText('Adicionar imagens'),
      new File(['image'], 'segunda.png', { type: 'image/png' }),
    )

    expect(await screen.findByText(/não foi possível enviar a imagem/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: portfolioImage(1).altText })).toHaveAttribute(
      'src',
      portfolioImage(1).url,
    )
    expect(mocks.saveProfessionalProfile).not.toHaveBeenCalled()
  })

  it('substitui e remove imagens somente após salvar a nova seleção', async () => {
    const currentProfile = {
      ...profile,
      portfolioImages: [portfolioImage(1), portfolioImage(2)],
    }
    mocks.loadProfessionalProfile.mockResolvedValue(currentProfile)
    mocks.saveProfessionalProfile.mockImplementation(
      async (_userId, input, status) => ({
        ...currentProfile,
        ...input,
        status,
      }),
    )
    const user = userEvent.setup()
    renderPage()

    const replaceInputs = await screen.findAllByLabelText('Substituir')
    await user.upload(
      replaceInputs[0],
      new File(['replacement'], 'nova.png', { type: 'image/png' }),
    )
    expect(mocks.imageRemove).not.toHaveBeenCalled()

    await user.click(screen.getAllByRole('button', { name: 'Remover' })[1])
    await user.click(screen.getAllByRole('button', { name: 'Salvar portfólio' })[0])

    expect(mocks.saveProfessionalProfile).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        portfolioImages: [
          expect.objectContaining({
            providerId: 'uploaded-nova.png',
            purpose: 'PROFESSIONAL_PORTFOLIO',
          }),
        ],
      }),
      'PUBLISHED',
      catalog,
      currentProfile,
    )
    await waitFor(() => expect(mocks.imageRemove).toHaveBeenCalledTimes(2))
    expect(mocks.imageRemove).toHaveBeenCalledWith({
      ownerId: 'user-123',
      purpose: 'PROFESSIONAL_PORTFOLIO',
      providerId: 'portfolio-1',
    })
    expect(mocks.imageRemove).toHaveBeenCalledWith({
      ownerId: 'user-123',
      purpose: 'PROFESSIONAL_PORTFOLIO',
      providerId: 'portfolio-2',
    })
  })

  it('respeita o limite de três imagens e mantém a grade sem largura rígida', async () => {
    mocks.loadProfessionalProfile.mockResolvedValue({
      ...profile,
      portfolioImages: [portfolioImage(1), portfolioImage(2), portfolioImage(3)],
    })
    renderPage()

    expect(await screen.findByText('3 de 3 imagens')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/Texto alternativo da imagem/)).toHaveLength(3)
    expect(screen.queryByLabelText('Adicionar imagens')).not.toBeInTheDocument()
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveClass('block', 'w-full', 'max-w-full', 'object-cover')
    }
    const grid = screen.getAllByRole('article')[0].parentElement
    expect(grid?.className).toContain('grid-cols-[minmax(0,1fr)]')
  })
})
