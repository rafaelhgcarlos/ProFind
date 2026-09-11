import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link
            className="text-xl font-black tracking-tight text-teal-700"
            to="/"
            aria-label="ProFind — página inicial"
          >
            ProFind
          </Link>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
            MVP
          </span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
