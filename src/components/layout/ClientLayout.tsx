import type { PropsWithChildren, ReactNode } from 'react'

import { AuthenticatedLayout } from './AuthenticatedLayout'

interface ClientLayoutProps extends PropsWithChildren {
  pageTitle: string
  userName?: string
  activeNavigationHref?: string
  contextSwitcher?: ReactNode
}

export function ClientLayout({ children, ...props }: ClientLayoutProps) {
  return (
    <AuthenticatedLayout mode="client" {...props}>
      {children}
    </AuthenticatedLayout>
  )
}
