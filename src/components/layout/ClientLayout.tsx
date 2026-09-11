import type { PropsWithChildren } from 'react'

import { AuthenticatedLayout } from './AuthenticatedLayout'

interface ClientLayoutProps extends PropsWithChildren {
  pageTitle: string
  userName?: string
  activeNavigationHref?: string
}

export function ClientLayout({ children, ...props }: ClientLayoutProps) {
  return (
    <AuthenticatedLayout mode="client" {...props}>
      {children}
    </AuthenticatedLayout>
  )
}
