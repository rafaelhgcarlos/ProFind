import type { PropsWithChildren, ReactNode } from 'react'

import { AuthenticatedLayout } from './AuthenticatedLayout'

interface ProfessionalLayoutProps extends PropsWithChildren {
  pageTitle: string
  userName?: string
  activeNavigationHref?: string
  contextSwitcher?: ReactNode
}

export function ProfessionalLayout({ children, ...props }: ProfessionalLayoutProps) {
  return (
    <AuthenticatedLayout mode="professional" {...props}>
      {children}
    </AuthenticatedLayout>
  )
}
