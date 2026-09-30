import { Eye, Save, Send } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import type { ProfessionalProfileStatus } from '../../../types/professional-profile'

const statusLabels: Record<ProfessionalProfileStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  PAUSED: 'Pausado',
  SUSPENDED: 'Suspenso',
}

const statusVariants = {
  DRAFT: 'outline',
  PUBLISHED: 'success',
  PAUSED: 'warning',
  SUSPENDED: 'destructive',
} as const

interface ProfileBuilderHeaderProps {
  publicName: string
  headline: string
  avatarUrl?: string
  status: ProfessionalProfileStatus
  completion: number
  dirty: boolean
  saving: boolean
  disabled: boolean
  showPrimary?: boolean
  onPreview: () => void
  onPrimaryAction: () => void
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

export function ProfileBuilderHeader({
  publicName,
  headline,
  avatarUrl,
  status,
  completion,
  dirty,
  saving,
  disabled,
  showPrimary = true,
  onPreview,
  onPrimaryAction,
}: ProfileBuilderHeaderProps) {
  const name = publicName.trim() || 'Seu perfil profissional'
  const actionLabel = status === 'PUBLISHED' ? 'Salvar alterações' : status === 'PAUSED' ? 'Republicar perfil' : 'Publicar perfil'

  return (
    <section aria-labelledby="profile-builder-title" className="min-w-0 max-w-full overflow-hidden rounded-xl border bg-card p-5 shadow-soft sm:p-6">
      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_auto] 2xl:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-16 border border-primary/20">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback>{initialsFor(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="profile-builder-title" className="min-w-0 break-words text-xl font-bold leading-tight">{name}</h2>
              <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>
            </div>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {headline.trim() || 'Adicione um título para apresentar sua atuação.'}
            </p>
            {dirty ? <p className="mt-1 text-xs font-medium text-warning">Alterações não salvas</p> : <p className="mt-1 text-xs text-muted-foreground">Tudo salvo</p>}
          </div>
        </div>

        <div className="min-w-0 max-w-full 2xl:px-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">Perfil {completion}% completo</span>
            <span className="text-muted-foreground">{completion === 100 ? 'Pronto para publicar' : 'Continue preenchendo'}</span>
          </div>
          <progress className="h-2 w-full accent-primary" value={completion} max={100} aria-label={`Perfil ${completion}% completo`} />
        </div>

        <div className="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap 2xl:ml-auto 2xl:flex-nowrap">
          <Button type="button" variant="outline" onClick={onPreview}>
            <Eye aria-hidden="true" /> Ver prévia
          </Button>
          {showPrimary ? (
            <Button type="button" loading={saving} loadingLabel="Salvando…" disabled={disabled} onClick={onPrimaryAction}>
              {status === 'PUBLISHED' ? <Save aria-hidden="true" /> : <Send aria-hidden="true" />}
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
