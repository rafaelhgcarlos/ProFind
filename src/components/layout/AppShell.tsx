import type { PropsWithChildren } from 'react'

import { PublicLayout, type PublicNavigationItem } from './PublicLayout'

interface AppShellProps extends PropsWithChildren {
  navigation?: PublicNavigationItem[]
  showAccountLinks?: boolean
}

export function AppShell({ children, ...props }: AppShellProps) {
  return <PublicLayout {...props}>{children}</PublicLayout>
}
