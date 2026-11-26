import { X } from 'lucide-react'

export function AppliedFilterList<Key extends string>({ items, onRemove }: {
  items: Array<[Key, string]>
  onRemove: (key: Key) => void
}) {
  const applied = items.filter(([, label]) => label)
  if (!applied.length) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="font-semibold">Filtros aplicados</span>
      <ul className="flex min-w-0 flex-wrap gap-2" aria-label="Filtros aplicados">
        {applied.map(([key, label]) => (
          <li key={key} className="min-w-0 max-w-full">
            <button type="button" aria-label={`Remover filtro ${label}`} onClick={() => onRemove(key)} className="ui-transition inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-md border bg-muted px-3 text-left text-xs wrap-anywhere hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <span className="min-w-0">{label}</span><X aria-hidden="true" className="size-4 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
