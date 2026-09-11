import type { PropsWithChildren } from 'react'

import { AuthenticatedLayout } from './AuthenticatedLayout'

interface AdminLayoutProps extends PropsWithChildren {
  pageTitle: string
  userName?: string
}

export function AdminLayout({ children, ...props }: AdminLayoutProps) {
  return (
    <AuthenticatedLayout mode="admin" {...props}>
      {children}
    </AuthenticatedLayout>
  )
}
