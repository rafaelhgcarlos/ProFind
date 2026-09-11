import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '../../../components/ui/tooltip'
import { ThemeProvider } from '../../../providers/theme-provider'
import { RegistrationDraftProvider } from '../registration-draft-provider'
import { CURRENT_LEGAL_ACCEPTANCE } from '../../legal/legal-documents'
import { RegistrationPage } from './RegistrationPage'

const registrationMocks = vi.hoisted(() => ({
  registerAccount: vi.fn(),
  getRegistrationErrorMessage: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : 'Falha no cadastro.',
  ),
}))

vi.mock('../../../services/registration.service', () => registrationMocks)

function renderPage() {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <RegistrationDraftProvider>
          <MemoryRouter>
            <RegistrationPage />
          </MemoryRouter>
        </RegistrationDraftProvider>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

async function fillValidForm() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nome completo'), 'Marina Souza')
  await user.type(screen.getByLabelText('E-mail'), 'marina@example.com')
  await user.type(screen.getByLabelText('Senha'), 'senha-segura')
  await user.type(screen.getByLabelText('Confirmar senha'), 'senha-segura')
  await user.click(
    screen.getByRole('checkbox', {
      name: /li e aceito os termos de uso e a política de privacidade/i,
    }),
  )
  return user
}

describe('RegistrationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registrationMocks.registerAccount.mockResolvedValue({
      userId: 'user-123',
      email: 'marina@example.com',
    })
  })

  it('associa mensagens acessíveis a todos os campos inválidos', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Criar minha conta' }))

    expect(screen.getByLabelText('Nome completo')).toHaveFocus()
    expect(screen.getByLabelText('Nome completo')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Informe seu nome.')).toHaveAttribute(
      'id',
      'registration-name-error',
    )
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Crie uma senha.')).toBeInTheDocument()
    expect(screen.getByText('Confirme sua senha.')).toBeInTheDocument()
    expect(
      screen.getByText(/aceite os termos de uso e a política de privacidade/i),
    ).toBeInTheDocument()
    expect(registrationMocks.registerAccount).not.toHaveBeenCalled()
  })

  it('impede reenvio durante o loading e confirma o sucesso', async () => {
    let resolveRegistration: ((value: { userId: string; email: string }) => void) | undefined
    registrationMocks.registerAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegistration = resolve
        }),
    )
    renderPage()
    const user = await fillValidForm()

    await user.click(screen.getByRole('button', { name: 'Criar minha conta' }))

    const loadingButton = screen.getByRole('button', { name: 'Criando sua conta…' })
    expect(loadingButton).toBeDisabled()
    expect(screen.getByLabelText('E-mail')).toBeDisabled()
    fireEvent.click(loadingButton)
    expect(registrationMocks.registerAccount).toHaveBeenCalledOnce()
    expect(registrationMocks.registerAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        legalAcceptance: CURRENT_LEGAL_ACCEPTANCE,
      }),
    )

    resolveRegistration?.({ userId: 'user-123', email: 'marina@example.com' })

    expect(
      await screen.findByRole('heading', { name: 'Conta criada com sucesso' }),
    ).toBeInTheDocument()
  })

  it('preserva os dados e orienta após erro de e-mail duplicado', async () => {
    registrationMocks.registerAccount.mockRejectedValue(
      new Error(
        'Este e-mail já está cadastrado. Entre na sua conta ou use a recuperação de senha para voltar a acessar.',
      ),
    )
    renderPage()
    const user = await fillValidForm()

    await user.click(screen.getByRole('button', { name: 'Criar minha conta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /e-mail já está cadastrado.*entre na sua conta.*recuperação de senha/i,
    )
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Marina Souza')
    expect(screen.getByLabelText('E-mail')).toHaveValue('marina@example.com')
    expect(screen.getByLabelText('Senha')).toHaveValue('senha-segura')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Criar minha conta' })).toBeEnabled()
    })
  })
})
