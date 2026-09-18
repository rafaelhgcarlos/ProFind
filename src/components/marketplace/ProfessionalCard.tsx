import { BadgeCheck, Heart, MapPin, Star } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '../../utils/cn'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

export interface ProfessionalCardProps {
  name: string
  specialty: string
  photoUrl?: string
  verified?: boolean
  rating?: number
  reviewCount?: number
  area?: string
  availability?: string
  portfolioImages?: string[]
  profileHref?: string
  onRequestQuote?: () => void
  onFavorite?: () => void
  isFavorite?: boolean
  className?: string
}

export function ProfessionalCard({ name, specialty, photoUrl, verified, rating, reviewCount, area, availability, portfolioImages = [], profileHref, onRequestQuote, onFavorite, isFavorite = false, className }: ProfessionalCardProps) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <div className="p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <Avatar className="size-14 border bg-secondary sm:size-16">
            {photoUrl ? <AvatarImage src={photoUrl} alt={`Foto de ${name}`} /> : null}
            <AvatarFallback>{initials || 'PF'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 text-lg font-bold break-words">{name}</h3>
              {verified ? <Badge variant="success" className="gap-1"><BadgeCheck className="size-3.5" aria-hidden="true" />Verificado</Badge> : null}
            </div>
            <p className="mt-1 text-sm break-words text-muted-foreground">{specialty}</p>
          </div>
          {onFavorite ? (
            <Button type="button" variant="ghost" size="icon" aria-label={isFavorite ? `Remover ${name} dos favoritos` : `Favoritar ${name}`} aria-pressed={isFavorite} onClick={onFavorite} className="shrink-0">
              <Heart className={cn(isFavorite && 'fill-current')} aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {rating !== undefined || area || availability ? (
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {rating !== undefined ? (
              <span className="inline-flex items-center gap-1.5"><Star className="size-4 fill-warning text-warning" aria-hidden="true" /><strong className="text-foreground">{rating.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong>{reviewCount !== undefined ? `(${reviewCount} avaliações)` : null}</span>
            ) : null}
            {area ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 shrink-0" aria-hidden="true" />{area}</span> : null}
            {availability ? <Badge variant="secondary">{availability}</Badge> : null}
          </div>
        ) : null}

        {portfolioImages.length > 0 ? (
          <div className="mt-5 grid grid-cols-3 gap-2" aria-label={`Prévia do portfólio de ${name}`}>
            {portfolioImages.slice(0, 3).map((image, index) => <img key={`${image}-${index}`} src={image} alt={`Trabalho ${index + 1} de ${name}`} loading="lazy" className="aspect-[4/3] w-full rounded-md bg-muted object-cover" />)}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 border-t bg-muted/30 p-4 sm:flex-row sm:p-5">
        <Button className="w-full sm:flex-1" disabled={!onRequestQuote} onClick={onRequestQuote}>Solicitar orçamento</Button>
        {profileHref ? <Button variant="outline" className="w-full sm:flex-1" asChild><Link to={profileHref}>Ver perfil</Link></Button> : <Button variant="outline" className="w-full sm:flex-1" disabled>Ver perfil</Button>}
      </div>
    </Card>
  )
}
