import { BadgeCheck, MapPin, MessagesSquare, type LucideIcon } from 'lucide-react'

import type { Benefit } from '../../types/project'

const icons: Record<Benefit['icon'], LucideIcon> = {
  location: MapPin,
  conversation: MessagesSquare,
  trust: BadgeCheck,
}

type FeatureCardProps = Benefit

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  const Icon = icons[icon]

  return (
    <article className="border-t pt-5">
      <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-bold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </article>
  )
}
