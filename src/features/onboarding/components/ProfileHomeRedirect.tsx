import { Navigate } from 'react-router-dom'

import { hasCompletedOnboarding, roleHomeRoutes } from '../user-role'
import { useProfile } from '../use-profile'

export function ProfileHomeRedirect() {
  const { profile } = useProfile()

  if (!profile || !hasCompletedOnboarding(profile)) {
    return <Navigate to="/onboarding" replace />
  }

  return <Navigate to={roleHomeRoutes[profile.activeMode]} replace />
}
