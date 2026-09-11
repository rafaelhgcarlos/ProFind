import type { PropsWithChildren } from 'react'

interface LegalSectionProps extends PropsWithChildren {
  id: string
  title: string
}

export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="max-w-3xl">
      <h2 id={`${id}-title`} className="text-xl font-black tracking-tight sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
        {children}
      </div>
    </section>
  )
}
