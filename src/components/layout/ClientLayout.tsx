import { CircleAlert } from 'lucide-react'
import { useContext, type PropsWithChildren, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { ProfileContext } from '../../features/onboarding/profile-context'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { AuthenticatedLayout } from './AuthenticatedLayout'

interface ClientLayoutProps extends PropsWithChildren {
  pageTitle: string
  userName?: string
  activeNavigationHref?: string
  contextSwitcher?: ReactNode
}

export function ClientLayout({ children, userName, ...props }: ClientLayoutProps) {
  const profileContext = useContext(ProfileContext)
  const location = useLocation()
  const showReadinessNotice =
    location.pathname !== '/cliente/perfil' &&
    profileContext?.clientProfileReadiness?.isComplete === false

  return (
    <AuthenticatedLayout
      mode="client"
      userName={userName ?? profileContext?.profile?.name}
      userAvatarUrl={profileContext?.clientProfile?.profileImage?.url}
      {...props}
    >
      {showReadinessNotice ? (
        <Alert variant="warning" className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Conclua seu perfil de cliente</AlertTitle>
          <AlertDescription>
            <p>Revise seu nome para deixar sua área pronta. Você pode continuar navegando.</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/cliente/perfil">Completar perfil</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {children}
    </AuthenticatedLayout>
  )
}
