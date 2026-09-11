import type { PropsWithChildren } from 'react'

import { PublicLayout } from './PublicLayout'

export function AppShell({ children }: PropsWithChildren) {
  return <PublicLayout>{children}</PublicLayout>
}
