import type { PropsWithChildren } from 'react'

import { AuthenticatedLayout } from './AuthenticatedLayout'

interface ProfessionalLayoutProps extends PropsWithChildren {
  pageTitle: string
  userName?: string
  activeNavigationHref?: string
}

export function ProfessionalLayout({ children, ...props }: ProfessionalLayoutProps) {
  return (
    <AuthenticatedLayout mode="professional" {...props}>
      {children}
    </AuthenticatedLayout>
  )
}
