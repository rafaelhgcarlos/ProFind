export interface IntendedRouteState {
  from?: unknown
  notice?: unknown
}

const allowedSessionNotices = new Set([
  'Sua sessão expirou. Entre novamente para continuar.',
  'Esta conta está desativada e não pode acessar o ProFind.',
])

export function getSessionNotice(state: unknown) {
  if (typeof state !== 'object' || state === null || !('notice' in state)) {
    return null
  }

  const { notice } = state as IntendedRouteState
  return typeof notice === 'string' && allowedSessionNotices.has(notice)
    ? notice
    : null
}

export function isSafeInternalPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.startsWith('/entrar') &&
    !path.startsWith('/recuperar-senha')
  )
}

export function getSafeIntendedRoute(state: unknown, fallback = '/conta') {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return fallback
  }

  const { from } = state as IntendedRouteState
  return isSafeInternalPath(from) ? from : fallback
}
