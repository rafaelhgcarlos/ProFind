interface FeatureCardProps {
  title: string
  description: string
  icon: string
}
export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span
        className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-xl"
        aria-hidden="true"
      >
        {icon}
      </span>
      <h2 className="mt-4 font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  )
}
