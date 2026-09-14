import { Navigate, Outlet } from 'react-router-dom'

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
  const { profile } = useProfile()

  if (!profile || !hasCompletedOnboarding(profile)) {
    return <Navigate to="/onboarding" replace />
  }

  if (profile.activeMode !== mode) {
    const modeIsEnabled = profile.roles.includes(mode)
    return (
      <Navigate
        to={roleHomeRoutes[profile.activeMode]}
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
