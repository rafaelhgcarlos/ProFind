import type { ImageReference } from './image'

export const CLIENT_PROFILE_MISSING_FIELDS = ['name', 'clientProfile'] as const

export type ClientProfileMissingField =
  (typeof CLIENT_PROFILE_MISSING_FIELDS)[number]

export interface ClientProfile {
  userId: string
  phone: string
  profileImage: ImageReference | null
}

export interface ClientProfileInput {
  name: string
  phone: string
  profileImage: ImageReference | null
}

export interface ClientProfileEditor extends ClientProfileInput {
  userId: string
  email: string
  exists: boolean
}

export interface ClientProfileReadiness {
  isComplete: boolean
  missingFields: ClientProfileMissingField[]
}

export interface ClientProfileState {
  profile: ClientProfile | null
  readiness: ClientProfileReadiness
}
