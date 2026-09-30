import { BriefcaseBusiness, Images, MapPin, Phone } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { Badge } from '../../../components/ui/badge'
import type {
  ProfessionalAvailability,
  ProfessionalBaseLocation,
  ProfessionalContactVisibility,
  ProfessionalImageMetadata,
  ProfessionalServiceMode,
} from '../../../types/professional-profile'

interface ProfessionalProfilePreviewProps {
  publicName: string
  headline: string
  bio: string
  categoryNames: string[]
  specialtyNames: string[]
  experienceYears: string
  baseLocation: ProfessionalBaseLocation
  serviceMode: ProfessionalServiceMode | ''
  serviceRadiusKm: string
  selectedCities: ProfessionalBaseLocation[]
  availability: ProfessionalAvailability
  phone: string
  contactVisibility: ProfessionalContactVisibility
  profileImage: ProfessionalImageMetadata | null
  portfolioImages: ProfessionalImageMetadata[]
}

const availabilityLabels: Record<ProfessionalAvailability, string> = {
  AVAILABLE: 'Aceitando novos serviços',
  LIMITED: 'Agenda limitada',
  UNAVAILABLE: 'Indisponível no momento',
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'PF'
}

function serviceAreaLabel({
  serviceMode,
  serviceRadiusKm,
  selectedCities,
}: Pick<ProfessionalProfilePreviewProps, 'serviceMode' | 'serviceRadiusKm' | 'selectedCities'>) {
  if (serviceMode === 'RADIUS' && serviceRadiusKm) return `Atende em um raio de até ${serviceRadiusKm} km`
  if (serviceMode === 'SELECTED_CITIES') {
    return selectedCities.length > 0
      ? `${selectedCities.length} ${selectedCities.length === 1 ? 'município selecionado' : 'municípios selecionados'}`
      : 'Municípios ainda não selecionados'
  }
  if (serviceMode === 'CITY_ONLY') return 'Atende na cidade informada'
  return 'Área de atendimento ainda não informada'
}

export function ProfessionalProfilePreview(props: ProfessionalProfilePreviewProps) {
  const name = props.publicName.trim() || 'Seu nome profissional'
  const serviceNames = [...props.categoryNames, ...props.specialtyNames]

  return (
    <article aria-label="Prévia do perfil público" className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="border-b bg-surface-tint px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Prévia do perfil público</p>
        <p className="mt-1 text-xs text-muted-foreground">Alterações aparecem aqui antes de serem salvas.</p>
      </div>
      <div className="min-w-0 space-y-5 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-14 border">
            {props.profileImage ? <AvatarImage src={props.profileImage.url} alt="" /> : null}
            <AvatarFallback>{initialsFor(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-bold leading-tight">{name}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {props.headline.trim() || 'Título profissional não informado'}
            </p>
          </div>
        </div>

        <Badge variant="outline" className="max-w-full whitespace-normal text-left">
          {availabilityLabels[props.availability]}
        </Badge>

        {props.bio.trim() ? <p className="break-words text-sm leading-6">{props.bio}</p> : null}

        <dl className="space-y-3 text-sm">
          <div className="flex min-w-0 gap-2">
            <BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="sr-only">Serviços</dt>
              <dd className="break-words">{serviceNames.join(' · ') || 'Serviços ainda não informados'}</dd>
              {props.experienceYears ? <dd className="mt-0.5 text-xs text-muted-foreground">{props.experienceYears} anos de experiência</dd> : null}
            </div>
          </div>
          <div className="flex min-w-0 gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="sr-only">Localização e atendimento</dt>
              <dd className="break-words">
                {props.baseLocation.city && props.baseLocation.stateCode
                  ? `${props.baseLocation.city}, ${props.baseLocation.stateCode}`
                  : 'Localização ainda não informada'}
              </dd>
              <dd className="mt-0.5 text-xs text-muted-foreground">{serviceAreaLabel(props)}</dd>
            </div>
          </div>
          {props.contactVisibility === 'PUBLIC' && props.phone ? (
            <div className="flex min-w-0 gap-2">
              <Phone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="sr-only">Telefone público</dt>
                <dd className="break-all">{props.phone}</dd>
              </div>
            </div>
          ) : null}
        </dl>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Images className="size-4 text-primary" aria-hidden="true" />
            Portfólio
          </div>
          {props.portfolioImages.length > 0 ? (
            <div className="mt-3 grid min-w-0 grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
              {props.portfolioImages.slice(0, 6).map((image) => (
                <img
                  key={image.providerId}
                  src={image.url}
                  alt={image.altText}
                  className="aspect-square block w-full min-w-0 max-w-full rounded-md bg-muted object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Nenhuma imagem adicionada.</p>
          )}
        </div>
      </div>
    </article>
  )
}
