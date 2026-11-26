import { AlertCircle, Images, Star } from 'lucide-react'
import { useState } from 'react'

import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { ImageThumbnail } from '../../../components/ui/image-thumbnail'
import { ImageViewer } from '../../../components/ui/image-viewer'
import type { ClientCurrentProfessional } from '../../../types/service-request'
import { imageKitDisplayUrl } from '../../../utils/imagekit-display-url'

export function ConfirmedProfessionalCard({ professional, specialty, warning }: {
  professional: ClientCurrentProfessional
  specialty: string
  warning: string
}) {
  const [viewer, setViewer] = useState<{ index: number | null; trigger: HTMLElement } | null>(null)
  const { publicName, profileImage, portfolioImages, rating, reviewCount } = professional
  const initials = publicName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PF'
  const images = portfolioImages.map((image, index) => ({
    url: image.url,
    alt: image.altText || `Trabalho ${index + 1} do profissional`,
    label: `Portfólio — imagem ${index + 1}`,
  }))

  return (
    <Card>
      <CardHeader><CardTitle>Profissional responsável</CardTitle></CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <Avatar className="size-16 shrink-0">
            {profileImage ? <AvatarImage src={imageKitDisplayUrl(profileImage.url, 160)} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 basis-36 grow wrap-anywhere">
            <h3 className="text-lg font-bold">{publicName || 'Profissional confirmado'}</h3>
            <p className="text-sm text-muted-foreground">{specialty}</p>
            {professional.headline ? <p className="mt-1 text-sm">{professional.headline}</p> : null}
            <p className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
              {rating !== null && reviewCount !== null && reviewCount > 0 ? (
                <><Star aria-hidden="true" className="size-4" />{rating.toFixed(1)} ({reviewCount} avaliações)</>
              ) : 'Sem avaliações'}
            </p>
          </div>
          {images.length ? (
            <Button type="button" variant="outline" onClick={(event) => setViewer({ index: 0, trigger: event.currentTarget })}>
              <Images aria-hidden="true" />Ver portfólio
            </Button>
          ) : null}
        </div>
        {warning ? <Alert variant="warning"><AlertCircle aria-hidden="true" /><AlertDescription>{warning} O acompanhamento do pedido continua disponível.</AlertDescription></Alert> : null}
        {images.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {portfolioImages.map((image, index) => (
              <button key={image.providerId} type="button" className="aspect-square overflow-hidden rounded-lg border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`Ampliar imagem ${index + 1} do portfólio`} onClick={(event) => setViewer({ index, trigger: event.currentTarget })}>
                <ImageThumbnail src={imageKitDisplayUrl(image.url, 640)} alt={images[index].alt} className="aspect-square" />
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Nenhuma imagem de portfólio disponível.</p>}
      </CardContent>
      <ImageViewer images={images} index={viewer?.index ?? null} returnFocusTo={viewer?.trigger} onIndexChange={(index) => setViewer((current) => current && { ...current, index })} />
    </Card>
  )
}
