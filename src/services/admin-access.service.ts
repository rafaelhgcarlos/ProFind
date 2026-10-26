import {
  adminAccessRepository,
  type AdminAccessDocument,
} from '../repositories/admin-access.repository'

export interface AdminAuthorizationState {
  authorized: boolean
}

export function hasActiveAdminAccess(
  access: AdminAccessDocument | null,
): boolean {
  return access?.active === true && access.schemaVersion === 1
}

export const adminAccessService = {
  observeAuthorization(
    userId: string,
    onValue: (authorization: AdminAuthorizationState) => void,
    onError: (error: Error) => void,
  ) {
    return adminAccessRepository.observeByUserId(
      userId,
      (access) => onValue({ authorized: hasActiveAdminAccess(access) }),
      onError,
    )
  },
}
