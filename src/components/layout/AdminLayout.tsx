import type { PropsWithChildren } from 'react'

import { AuthenticatedLayout } from './AuthenticatedLayout'
import type { PageHeading } from './PageHeader'

interface AdminLayoutProps extends PropsWithChildren {
  pageTitle: string
  heading?: PageHeading
  userName?: string
  activeNavigationHref?: string
}

export function AdminLayout({ children, ...props }: AdminLayoutProps) {
  return (
    <AuthenticatedLayout mode="admin" {...props}>
      {children}
    </AuthenticatedLayout>
  )
}
