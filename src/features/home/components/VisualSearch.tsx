import { ArrowRight, MapPin, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'

export interface VisualSearchValues {
  service: string
  location: string
}

interface VisualSearchProps {
  disabled?: boolean
  loading?: boolean
  error?: string
  serviceValue?: string
  serviceOptions?: readonly string[]
  onServiceChange?: (value: string) => void
  onSearch?: (values: VisualSearchValues) => void
}

export function VisualSearch({ disabled = false, loading = false, error, serviceValue, serviceOptions = [], onServiceChange, onSearch }: VisualSearchProps) {
  const [localService, setLocalService] = useState('')
  const service = serviceValue ?? localService
  const [location, setLocation] = useState('')
  const [showUnavailable, setShowUnavailable] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || loading) return
    setShowUnavailable(false)
    if (onSearch) {
      onSearch({ service: service.trim(), location: location.trim() })
    } else {
      setShowUnavailable(true)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-5 lg:p-6">
      <form role="search" aria-label="Buscar profissionais" aria-busy={loading} onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_auto] lg:items-end">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="search-service">Qual serviço você precisa?</Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input id="search-service" name="service" list={serviceOptions.length ? 'service-options' : undefined} placeholder="Ex.: eletricista, diarista, pintor" value={service} disabled={disabled || loading} aria-invalid={Boolean(error)} aria-describedby={error ? 'visual-search-error' : undefined} onChange={(event) => { if (serviceValue === undefined) setLocalService(event.target.value); else onServiceChange?.(event.target.value); setShowUnavailable(false) }} className="pl-10" />
            {serviceOptions.length ? (
              <datalist id="service-options">
                {serviceOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="search-location">Onde?</Label>
          <div className="relative">
            <MapPin aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input id="search-location" name="location" placeholder="Cidade ou região" value={location} disabled={disabled || loading} onChange={(event) => { setLocation(event.target.value); setShowUnavailable(false) }} className="pl-10" />
          </div>
        </div>
        <Button size="lg" type="submit" loading={loading} disabled={disabled} loadingLabel="Buscando…" className="w-full whitespace-nowrap lg:w-auto">
          Encontrar profissionais <ArrowRight aria-hidden="true" />
        </Button>
      </form>
      {error ? <p id="visual-search-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {showUnavailable ? (
        <Alert className="mt-4">
          <Search aria-hidden="true" />
          <AlertTitle>Busca em preparação</AlertTitle>
          <AlertDescription>
            Ainda não há resultados públicos para estes campos. Você pode <Link className="font-semibold text-primary underline underline-offset-4" to="/cadastro">criar sua conta</Link> para começar no ProFind.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
