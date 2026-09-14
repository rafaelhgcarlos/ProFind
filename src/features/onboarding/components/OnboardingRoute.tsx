import { Navigate, Outlet } from 'react-router-dom'

import { hasCompletedOnboarding, roleHomeRoutes } from '../user-role'
import { useProfile } from '../use-profile'

export function OnboardingRoute() {
  const { profile } = useProfile()

  if (profile && hasCompletedOnboarding(profile)) {
    return <Navigate to={roleHomeRoutes[profile.activeMode]} replace />
  }

  return <Outlet />
}
