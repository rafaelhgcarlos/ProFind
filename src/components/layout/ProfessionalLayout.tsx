import { useContext, type PropsWithChildren, type ReactNode } from 'react'

import { ProfileContext } from '../../features/onboarding/profile-context'
import { AuthenticatedLayout } from './AuthenticatedLayout'

interface ProfessionalLayoutProps extends PropsWithChildren {
  pageTitle: string
  userName?: string
  activeNavigationHref?: string
  contextSwitcher?: ReactNode
}

export function ProfessionalLayout({
  children,
  userName,
  ...props
}: ProfessionalLayoutProps) {
  const profileContext = useContext(ProfileContext)
  return (
    <AuthenticatedLayout
      mode="professional"
      userName={
        userName ??
        profileContext?.professionalProfile?.publicName ??
        profileContext?.profile?.name
      }
      userAvatarUrl={profileContext?.professionalProfile?.profileImage?.url}
      {...props}
    >
      {children}
    </AuthenticatedLayout>
  )
}
