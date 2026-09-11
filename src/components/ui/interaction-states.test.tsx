import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'
import { Checkbox } from './checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu'
import { RadioGroup, RadioGroupItem } from './radio-group'
import { Select, SelectTrigger, SelectValue } from './select'
import { Switch } from './switch'
import { Tabs, TabsList, TabsTrigger } from './tabs'

describe('estados dos componentes interativos', () => {
  it('mantém botões habilitados acionáveis e com cursor de ação', () => {
    const onClick = vi.fn()

    render(<Button onClick={onClick}>Continuar</Button>)

    const button = screen.getByRole('button', { name: 'Continuar' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('data-disabled', 'false')
    expect(button).toHaveClass('cursor-pointer')

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('usa disabled nativo e bloqueia novas ações durante o loading', () => {
    const onClick = vi.fn()

    render(
      <Button loading loadingLabel="Salvando" onClick={onClick}>
        Salvar
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Salvando' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('data-disabled', 'true')
    expect(button).toHaveClass('data-[disabled=true]:cursor-not-allowed')

    fireEvent.click(button)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('desabilita semanticamente uma ação renderizada com asChild', () => {
    const onClick = vi.fn()

    render(
      <Button asChild disabled>
        <a href="#destino" onClick={onClick}>
          Ação indisponível
        </a>
      </Button>,
    )

    const link = screen.getByRole('link', { name: 'Ação indisponível' })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('data-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')

    fireEvent.click(link)
    expect(onClick).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  it('expõe disabled nativo e cursor consistente nos controles Radix', () => {
    render(
      <>
        <Checkbox aria-label="Checkbox desabilitado" disabled />
        <RadioGroup>
          <RadioGroupItem
            aria-label="Radio desabilitado"
            value="disabled"
            disabled
          />
        </RadioGroup>
        <Switch aria-label="Switch desabilitado" disabled />
        <Select disabled>
          <SelectTrigger aria-label="Select desabilitado">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
        </Select>
        <Tabs defaultValue="ativo">
          <TabsList>
            <TabsTrigger value="ativo">Ativo</TabsTrigger>
            <TabsTrigger value="indisponivel" disabled>
              Tab desabilitada
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </>,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'Checkbox desabilitado',
    })
    const radio = screen.getByRole('radio', { name: 'Radio desabilitado' })
    const switchControl = screen.getByRole('switch', {
      name: 'Switch desabilitado',
    })
    const select = screen.getByRole('combobox', { name: 'Select desabilitado' })
    const tab = screen.getByRole('tab', { name: 'Tab desabilitada' })

    for (const control of [checkbox, radio, switchControl, select, tab]) {
      expect(control).toBeDisabled()
      expect(control).toHaveClass('disabled:cursor-not-allowed')
    }

    expect(checkbox).toHaveClass('cursor-pointer')
    expect(radio).toHaveClass('cursor-pointer')
    expect(switchControl).toHaveClass('cursor-pointer')
    expect(select).toHaveClass('cursor-pointer')
    expect(tab).toHaveClass('cursor-pointer')
  })

  it('mantém itens de menu desabilitados visíveis, mas não acionáveis', () => {
    const onSelect = vi.fn()

    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuItem>Ação disponível</DropdownMenuItem>
          <DropdownMenuItem disabled onSelect={onSelect}>
            Ação indisponível
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    const enabledItem = screen.getByRole('menuitem', {
      name: 'Ação disponível',
    })
    const disabledItem = screen.getByRole('menuitem', {
      name: 'Ação indisponível',
    })

    expect(enabledItem).toHaveClass('cursor-pointer')
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
    expect(disabledItem).toHaveClass('data-[disabled]:cursor-not-allowed')

    fireEvent.click(disabledItem)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
