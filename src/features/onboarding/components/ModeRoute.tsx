import { Navigate, Outlet } from 'react-router-dom'

import { clientLandingRoute } from '../../../services/client-profile.service'
import {
  hasCompletedOnboarding,
  roleHomeRoutes,
  type UserRole,
} from '../user-role'
import { useProfile } from '../use-profile'

interface ModeRouteProps {
  mode: UserRole
}

export function ModeRoute({ mode }: ModeRouteProps) {
  const { clientProfileReadiness, profile } = useProfile()

  if (!profile || !hasCompletedOnboarding(profile)) {
    return <Navigate to="/onboarding" replace />
  }

  if (profile.activeMode !== mode) {
    const modeIsEnabled = profile.roles.includes(mode)
    const destination =
      profile.activeMode === 'client' && clientProfileReadiness
        ? clientLandingRoute(clientProfileReadiness)
        : roleHomeRoutes[profile.activeMode]
    return (
      <Navigate
        to={destination}
        replace
        state={
          modeIsEnabled
            ? undefined
            : { modeNotice: 'Este modo não está habilitado para sua conta.' }
        }
      />
    )
  }

  return <Outlet />
}
