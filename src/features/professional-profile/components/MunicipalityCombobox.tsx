import { LoaderCircle, MapPin, RotateCcw, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import {
  listMunicipalitiesByState,
  type IbgeMunicipality,
} from '../../../services/ibge-localities.service'
import type { ProfessionalBaseLocation } from '../../../types/professional-profile'
import { cn } from '../../../utils/cn'

interface MunicipalityComboboxProps {
  id: string
  label: string
  stateCode: string
  selectedMunicipality?: ProfessionalBaseLocation | null
  excludedIbgeCodes?: string[]
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  describedBy?: string
  onSelect(municipality: IbgeMunicipality): void
  onClear?(): void
}

type LoadingStatus = 'idle' | 'loading' | 'ready' | 'error'
const EMPTY_MUNICIPALITIES: IbgeMunicipality[] = []

interface MunicipalityLoadState {
  stateCode: string
  attempt: number
  status: LoadingStatus
  municipalities: IbgeMunicipality[]
}

function normalizedSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

export function MunicipalityCombobox({
  id,
  label,
  stateCode,
  selectedMunicipality,
  excludedIbgeCodes = [],
  disabled = false,
  required = false,
  invalid = false,
  describedBy,
  onSelect,
  onClear,
}: MunicipalityComboboxProps) {
  const listboxId = useId()
  const statusId = useId()
  const [loadState, setLoadState] = useState<MunicipalityLoadState>({
    stateCode: '',
    attempt: 0,
    status: 'idle',
    municipalities: [],
  })
  const [attempt, setAttempt] = useState(0)
  const [queryState, setQueryState] = useState({
    stateCode,
    value: selectedMunicipality?.city ?? '',
  })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    if (!stateCode) return

    let active = true

    void listMunicipalitiesByState(stateCode)
      .then((result) => {
        if (!active) return
        setLoadState({
          stateCode,
          attempt,
          status: 'ready',
          municipalities: result,
        })
      })
      .catch(() => {
        if (!active) return
        setLoadState({
          stateCode,
          attempt,
          status: 'error',
          municipalities: [],
        })
      })

    return () => {
      active = false
    }
  }, [attempt, stateCode])

  const isCurrentLoad =
    loadState.stateCode === stateCode && loadState.attempt === attempt
  const status: LoadingStatus = !stateCode
    ? 'idle'
    : isCurrentLoad
      ? loadState.status
      : 'loading'
  const municipalities = isCurrentLoad
    ? loadState.municipalities
    : EMPTY_MUNICIPALITIES
  const query =
    queryState.stateCode === stateCode
      ? queryState.value
      : selectedMunicipality?.stateCode === stateCode
        ? selectedMunicipality.city
        : ''

  const filteredMunicipalities = useMemo(() => {
    const excluded = new Set(excludedIbgeCodes)
    const normalizedQuery = normalizedSearch(query)
    return municipalities
      .filter(
        (municipality) =>
          !excluded.has(municipality.ibgeCode) &&
          (!normalizedQuery ||
            normalizedSearch(municipality.city).includes(normalizedQuery)),
      )
      .slice(0, 80)
  }, [excludedIbgeCodes, municipalities, query])

  const activeMunicipality =
    activeIndex >= 0 ? filteredMunicipalities[activeIndex] : undefined
  const listboxVisible = open && status === 'ready'

  function selectMunicipality(municipality: IbgeMunicipality) {
    setQueryState({ stateCode, value: municipality.city })
    setOpen(false)
    onSelect(municipality)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }

    if (status !== 'ready') return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) =>
        Math.min(Math.max(current + 1, 0), filteredMunicipalities.length - 1),
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) =>
        current <= 0 ? Math.max(filteredMunicipalities.length - 1, 0) : current - 1,
      )
    } else if (event.key === 'Enter' && open && activeMunicipality) {
      event.preventDefault()
      selectMunicipality(activeMunicipality)
    }
  }

  const inputDisabled = disabled || !stateCode || status === 'loading'

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-3.5 left-3 z-10 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listboxVisible}
          aria-controls={listboxId}
          aria-activedescendant={
            listboxVisible && activeMunicipality
              ? `${id}-option-${activeMunicipality.ibgeCode}`
              : undefined
          }
          aria-invalid={invalid}
          aria-describedby={[describedBy, statusId].filter(Boolean).join(' ') || undefined}
          autoComplete="off"
          className="pr-10 pl-9"
          value={query}
          placeholder={stateCode ? 'Pesquise o município' : 'Selecione primeiro a UF'}
          disabled={inputDisabled}
          onFocus={(event) => {
            setOpen(status === 'ready')
            if (selectedMunicipality?.ibgeCode) event.currentTarget.select()
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setQueryState({ stateCode, value: event.target.value })
            setActiveIndex(-1)
            setOpen(true)
            if (selectedMunicipality?.ibgeCode) onClear?.()
          }}
        />
        {status === 'loading' ? (
          <LoaderCircle
            className="absolute top-3.5 right-3 size-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}

        {listboxVisible ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={`Municípios de ${stateCode}`}
            className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-soft"
          >
            {filteredMunicipalities.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhum município encontrado.
              </p>
            ) : (
              filteredMunicipalities.map((municipality, index) => (
                <div
                  id={`${id}-option-${municipality.ibgeCode}`}
                  key={municipality.ibgeCode}
                  role="option"
                  aria-selected={
                    selectedMunicipality?.ibgeCode === municipality.ibgeCode
                  }
                  className={cn(
                    'flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm',
                    index === activeIndex && 'bg-accent text-accent-foreground',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectMunicipality(municipality)
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  {municipality.city}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div id={statusId} aria-live="polite">
        {status === 'loading' ? (
          <p className="text-xs text-muted-foreground">Carregando municípios…</p>
        ) : null}
        {status === 'ready' && municipalities.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum município disponível para esta UF.
          </p>
        ) : null}
        {status === 'error' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>Não foi possível carregar os municípios.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setAttempt((current) => current + 1)}
            >
              <RotateCcw aria-hidden="true" /> Tentar novamente
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
