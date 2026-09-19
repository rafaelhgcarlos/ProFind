import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MunicipalityCombobox } from './MunicipalityCombobox'

const mocks = vi.hoisted(() => ({
  listMunicipalitiesByState: vi.fn(),
}))

vi.mock('../../../services/ibge-localities.service', () => ({
  listMunicipalitiesByState: mocks.listMunicipalitiesByState,
}))

const municipalities = [
  { city: 'Campinas', stateCode: 'SP', ibgeCode: '3509502' },
  { city: 'São Paulo', stateCode: 'SP', ibgeCode: '3550308' },
]

describe('MunicipalityCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listMunicipalitiesByState.mockResolvedValue(municipalities)
  })

  it('fica desabilitado até a UF ser selecionada', () => {
    render(
      <MunicipalityCombobox
        id="city"
        label="Município"
        stateCode=""
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Município' })).toBeDisabled()
    expect(screen.getByPlaceholderText('Selecione primeiro a UF')).toBeInTheDocument()
    expect(mocks.listMunicipalitiesByState).not.toHaveBeenCalled()
  })

  it('pesquisa e seleciona município usando o teclado', async () => {
    let resolveMunicipalities: (value: typeof municipalities) => void = () => undefined
    mocks.listMunicipalitiesByState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMunicipalities = resolve
      }),
    )
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <MunicipalityCombobox
        id="city"
        label="Município"
        stateCode="SP"
        onSelect={onSelect}
      />,
    )

    const combobox = await screen.findByRole('combobox', { name: 'Município' })
    expect(await screen.findByText('Carregando municípios…')).toBeInTheDocument()
    await act(() => {
      resolveMunicipalities(municipalities)
    })
    await waitFor(() => expect(combobox).toBeEnabled())
    await user.type(combobox, 'camp')
    expect(await screen.findByRole('option', { name: 'Campinas' })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith(municipalities[0])
    expect(combobox).toHaveValue('Campinas')
  })

  it('mostra erro e permite tentar novamente', async () => {
    mocks.listMunicipalitiesByState
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(municipalities)
    const user = userEvent.setup()

    render(
      <MunicipalityCombobox
        id="city"
        label="Município"
        stateCode="SP"
        onSelect={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('Não foi possível carregar os municípios.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('combobox', { name: 'Município' })).toBeEnabled()
    expect(mocks.listMunicipalitiesByState).toHaveBeenCalledTimes(2)
  })

  it('apresenta estados vazio da consulta e da pesquisa', async () => {
    mocks.listMunicipalitiesByState.mockResolvedValueOnce([])
    const { rerender } = render(
      <MunicipalityCombobox
        id="city"
        label="Município"
        stateCode="AC"
        onSelect={vi.fn()}
      />,
    )
    expect(
      await screen.findByText('Nenhum município disponível para esta UF.'),
    ).toBeInTheDocument()

    mocks.listMunicipalitiesByState.mockResolvedValueOnce(municipalities)
    rerender(
      <MunicipalityCombobox
        id="city"
        label="Município"
        stateCode="SP"
        onSelect={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    const combobox = await screen.findByRole('combobox', { name: 'Município' })
    await user.type(combobox, 'cidade inexistente')
    expect(await screen.findByText('Nenhum município encontrado.')).toBeInTheDocument()
  })
})
