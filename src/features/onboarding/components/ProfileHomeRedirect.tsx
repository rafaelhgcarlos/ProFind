import { Navigate } from 'react-router-dom'

import { clientLandingRoute } from '../../../services/client-profile.service'
import { hasCompletedOnboarding, roleHomeRoutes } from '../user-role'
import { useProfile } from '../use-profile'

export function ProfileHomeRedirect() {
  const { clientProfileReadiness, profile } = useProfile()

  if (!profile || !hasCompletedOnboarding(profile)) {
    return <Navigate to="/onboarding" replace />
  }

  const destination =
    profile.activeMode === 'client' && clientProfileReadiness
      ? clientLandingRoute(clientProfileReadiness)
      : roleHomeRoutes[profile.activeMode]
  return <Navigate to={destination} replace />
}
