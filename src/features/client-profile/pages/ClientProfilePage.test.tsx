import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '../../../components/ui/tooltip'
import {
  AuthenticationContext,
  type AuthenticationContextValue,
} from '../../auth/auth-context'
import {
  ProfileContext,
  type ProfileContextValue,
} from '../../onboarding/profile-context'
import { ThemeProvider } from '../../../providers/theme-provider'
import {
  loadClientProfileEditor,
  saveClientProfile,
} from '../../../services/client-profile.service'
import {
  removeImageReference,
  uploadImageReference,
  validateProfessionalImageFile,
} from '../../../services/professional-images.service'
import { ClientProfilePage } from './ClientProfilePage'

vi.mock('../../../services/client-profile.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/client-profile.service')>()
  return {
    ...actual,
    loadClientProfileEditor: vi.fn(),
    saveClientProfile: vi.fn(),
  }
})

vi.mock('../../../services/professional-images.service', () => ({
  removeImageReference: vi.fn(),
  uploadImageReference: vi.fn(),
  validateProfessionalImageFile: vi.fn(),
}))

vi.mock('../../../providers/image-provider.factory', () => ({
  getImageProvider: vi.fn(() => ({ name: 'mock', configured: true })),
}))

vi.mock('../../../components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} />
  ),
  AvatarFallback: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

const editor = {
  userId: 'client-123',
  name: 'Marina Souza',
  email: 'marina@example.com',
  phone: '',
  profileImage: null,
  exists: false,
}

const previousAvatar = {
  provider: 'IMAGEKIT' as const,
  ownerId: editor.userId,
  purpose: 'CLIENT_AVATAR' as const,
  url: 'https://images.example/previous-client.webp',
  providerId: 'client-avatar-previous',
  createdAt: 50,
  updatedAt: 50,
}

const uploadedAvatar = {
  provider: 'IMAGEKIT' as const,
  ownerId: editor.userId,
  purpose: 'CLIENT_AVATAR' as const,
  url: 'https://images.example/client.webp',
  providerId: 'client-avatar-1',
  createdAt: 100,
  updatedAt: 100,
}

function renderPage(overrides: Partial<ProfileContextValue> = {}) {
  const auth: AuthenticationContextValue = {
    status: 'authenticated',
    user: { uid: editor.userId, email: editor.email } as User,
    sessionError: null,
    login: vi.fn(),
    logout: vi.fn(),
    requestPasswordReset: vi.fn(),
    retrySession: vi.fn(),
  }
  const context: ProfileContextValue = {
    status: 'ready',
    profile: {
      userId: editor.userId,
      name: editor.name,
      email: editor.email,
      roles: ['client'],
      activeMode: 'client',
      professionalProfileStatus: 'not-started',
    },
    profileError: null,
    clientProfile: null,
    clientProfileReadiness: {
      isComplete: false,
      missingFields: ['clientProfile'],
    },
    completeOnboarding: vi.fn(),
    switchMode: vi.fn(),
    resolveLandingRoute: vi.fn().mockResolvedValue('/cliente/perfil'),
    syncClientProfile: vi.fn(),
    syncProfessionalProfileStatus: vi.fn(),
    retryProfile: vi.fn(),
    ...overrides,
  }

  const view = render(
    <ThemeProvider>
      <TooltipProvider>
        <AuthenticationContext.Provider value={auth}>
          <ProfileContext.Provider value={context}>
            <MemoryRouter initialEntries={['/cliente/perfil']}>
              <ClientProfilePage />
            </MemoryRouter>
          </ProfileContext.Provider>
        </AuthenticationContext.Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  return { context, ...view }
}

describe('ClientProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(uploadImageReference).mockReset()
    vi.mocked(validateProfessionalImageFile).mockReset()
    vi.mocked(loadClientProfileEditor).mockResolvedValue(editor)
    vi.mocked(saveClientProfile).mockImplementation(async (current, input) => ({
      ...current,
      ...input,
      name: input.name.trim(),
      phone: input.phone.replace(/\D/g, ''),
      exists: true,
    }))
    vi.mocked(removeImageReference).mockResolvedValue(undefined)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:client-avatar'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('carrega o estado de criação e mantém o e-mail autenticado somente leitura', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(/carregando perfil/i)
    const email = await screen.findByLabelText('E-mail de acesso')
    expect(email).toHaveValue(editor.email)
    expect(email).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Salvar perfil' })).toBeDisabled()
  })

  it('cria o perfil, normaliza o telefone e sincroniza o cabeçalho sem recarregar', async () => {
    const user = userEvent.setup()
    const { context } = renderPage()
    await user.clear(await screen.findByLabelText('Nome completo'))
    await user.type(screen.getByLabelText('Nome completo'), 'Marina Santos')
    await user.type(screen.getByLabelText(/telefone/i), '11999998888')
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }))

    await waitFor(() => expect(saveClientProfile).toHaveBeenCalled())
    expect(context.syncClientProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Marina Santos',
        phone: '11999998888',
        exists: true,
      }),
    )
    expect(screen.getByText(/cabeçalho já foi atualizado/i)).toBeInTheDocument()
  })

  it('mantém os dados digitados quando a gravação falha', async () => {
    const user = userEvent.setup()
    vi.mocked(saveClientProfile).mockRejectedValueOnce(
      new Error('Verifique sua conexão e tente novamente.'),
    )
    renderPage()
    const name = await screen.findByLabelText('Nome completo')
    await user.clear(name)
    await user.type(name, 'Nome preservado')
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão/i)
    expect(name).toHaveValue('Nome preservado')
  })

  it('valida nome e telefone antes de gravar', async () => {
    const user = userEvent.setup()
    renderPage()
    const name = await screen.findByLabelText('Nome completo')
    await user.clear(name)
    await user.type(name, 'A')
    await user.type(screen.getByLabelText(/telefone/i), '123')
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }))

    expect(screen.getByText(/nome com 2 a 120/i)).toBeInTheDocument()
    expect(screen.getByText(/ddd e telefone/i)).toBeInTheDocument()
    expect(saveClientProfile).not.toHaveBeenCalled()
  })

  it('exibe preview, erro isolado e retry do upload CLIENT_AVATAR', async () => {
    const user = userEvent.setup()
    vi.mocked(uploadImageReference)
      .mockRejectedValueOnce(new Error('Falha temporária no envio.'))
      .mockResolvedValueOnce(uploadedAvatar)
    renderPage()
    const input = await screen.findByLabelText('Selecionar foto de perfil')
    await user.upload(
      input,
      new File(['image'], 'avatar.webp', { type: 'image/webp' }),
    )

    expect(validateProfessionalImageFile).toHaveBeenCalledWith(
      expect.any(File),
      'CLIENT_AVATAR',
    )
    expect(await screen.findByText(/falha temporária/i)).toBeInTheDocument()
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(File))
    await user.click(screen.getByRole('button', { name: /tentar envio novamente/i }))
    await waitFor(() => expect(uploadImageReference).toHaveBeenCalledTimes(2))
    expect(screen.getByAltText('Prévia da foto de perfil')).toHaveAttribute(
      'src',
      uploadedAvatar.url,
    )
    expect(screen.getByAltText('Prévia da foto de perfil')).not.toHaveAttribute(
      'src',
      'blob:client-avatar',
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:client-avatar')
    expect(uploadImageReference).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: editor.userId,
        purpose: 'CLIENT_AVATAR',
      }),
      { retry: true },
    )
  })

  it('persiste a ImageReference, atualiza o estado-base e mantém a URL do provider após salvar', async () => {
    const user = userEvent.setup()
    vi.mocked(uploadImageReference).mockResolvedValue(uploadedAvatar)
    const { context } = renderPage()
    await user.upload(
      await screen.findByLabelText('Selecionar foto de perfil'),
      new File(['image'], 'avatar.webp', { type: 'image/webp' }),
    )
    await waitFor(() =>
      expect(screen.getByAltText('Prévia da foto de perfil')).toHaveAttribute(
        'src',
        uploadedAvatar.url,
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }))

    await waitFor(() =>
      expect(saveClientProfile).toHaveBeenCalledWith(
        editor,
        expect.objectContaining({ profileImage: uploadedAvatar }),
      ),
    )
    expect(context.syncClientProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileImage: uploadedAvatar, exists: true }),
    )
    expect(screen.getByAltText('Prévia da foto de perfil')).toHaveAttribute(
      'src',
      uploadedAvatar.url,
    )
    expect(screen.getByRole('button', { name: 'Salvar perfil' })).toBeDisabled()
  })

  it('recarrega a referência persistida depois de remount', async () => {
    vi.mocked(loadClientProfileEditor).mockResolvedValue({
      ...editor,
      profileImage: uploadedAvatar,
      exists: true,
    })
    const firstRender = renderPage()
    expect(await screen.findByAltText('Prévia da foto de perfil')).toHaveAttribute(
      'src',
      uploadedAvatar.url,
    )
    firstRender.unmount()
    renderPage()
    expect(await screen.findByAltText('Prévia da foto de perfil')).toHaveAttribute(
      'src',
      uploadedAvatar.url,
    )
    expect(loadClientProfileEditor).toHaveBeenCalledTimes(2)
  })

  it('preserva a referência anterior até a substituição ser persistida', async () => {
    const user = userEvent.setup()
    const existingEditor = {
      ...editor,
      profileImage: previousAvatar,
      exists: true,
    }
    vi.mocked(loadClientProfileEditor).mockResolvedValue(existingEditor)
    vi.mocked(uploadImageReference).mockResolvedValue(uploadedAvatar)
    renderPage()
    await user.upload(
      await screen.findByLabelText('Selecionar foto de perfil'),
      new File(['new'], 'new-avatar.webp', { type: 'image/webp' }),
    )
    await waitFor(() =>
      expect(screen.getByAltText('Prévia da foto de perfil')).toHaveAttribute(
        'src',
        uploadedAvatar.url,
      ),
    )
    expect(removeImageReference).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }))
    await waitFor(() => expect(removeImageReference).toHaveBeenCalledWith(
      expect.anything(),
      previousAvatar,
      editor.userId,
      'CLIENT_AVATAR',
    ))
    expect(
      vi.mocked(saveClientProfile).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(removeImageReference).mock.invocationCallOrder[0])
  })

  it('mantém a nova referência quando a limpeza da imagem anterior falha parcialmente', async () => {
    const user = userEvent.setup()
    vi.mocked(loadClientProfileEditor).mockResolvedValue({
      ...editor,
      profileImage: previousAvatar,
      exists: true,
    })
    vi.mocked(uploadImageReference).mockResolvedValue(uploadedAvatar)
    vi.mocked(removeImageReference).mockRejectedValueOnce(
      new Error('Falha ao remover a imagem anterior.'),
    )
    const { context } = renderPage()
    await user.upload(
      await screen.findByLabelText('Selecionar foto de perfil'),
      new File(['new'], 'new-avatar.webp', { type: 'image/webp' }),
    )
    await waitFor(() =>
      expect(screen.getByAltText('Prévia da foto de perfil')).toHaveAttribute(
        'src',
        uploadedAvatar.url,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }))

    expect(await screen.findByText(/perfil foi salvo, mas a foto anterior/i)).toBeInTheDocument()
    expect(screen.getByAltText('Prévia da foto de perfil')).toHaveAttribute(
      'src',
      uploadedAvatar.url,
    )
    expect(context.syncClientProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileImage: uploadedAvatar }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Tentar remover novamente' }),
    )
    await waitFor(() => expect(removeImageReference).toHaveBeenCalledTimes(2))
    expect(
      screen.queryByText(/perfil foi salvo, mas a foto anterior/i),
    ).not.toBeInTheDocument()
    expect(screen.getByAltText('Prévia da foto de perfil')).toHaveAttribute(
      'src',
      uploadedAvatar.url,
    )
  })
})
