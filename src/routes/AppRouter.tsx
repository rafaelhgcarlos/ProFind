import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { HomePage } from '../features/home/pages/HomePage'
import { NotFoundPage } from '../features/not-found/pages/NotFoundPage'
import { Skeleton } from '../components/ui/skeleton'
import { RegistrationDraftProvider } from '../features/registration/registration-draft-provider'
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute'
import { ModeRoute } from '../features/onboarding/components/ModeRoute'
import { OnboardingRoute } from '../features/onboarding/components/OnboardingRoute'
import { ProfileHomeRedirect } from '../features/onboarding/components/ProfileHomeRedirect'
import { ProfileRoute } from '../features/onboarding/components/ProfileRoute'

const DesignSystemPage = lazy(() =>
  import('../features/design-system/pages/DesignSystemPage').then((module) => ({
    default: module.DesignSystemPage,
  })),
)

const LayoutPreviewPage = lazy(() =>
  import('../features/design-system/pages/LayoutPreviewPage').then((module) => ({
    default: module.LayoutPreviewPage,
  })),
)

const RegistrationPage = lazy(() =>
  import('../features/registration/pages/RegistrationPage').then((module) => ({
    default: module.RegistrationPage,
  })),
)

const TermsOfUsePage = lazy(() =>
  import('../features/legal/pages/TermsOfUsePage').then((module) => ({
    default: module.TermsOfUsePage,
  })),
)

const PrivacyPolicyPage = lazy(() =>
  import('../features/legal/pages/PrivacyPolicyPage').then((module) => ({
    default: module.PrivacyPolicyPage,
  })),
)

const LoginPage = lazy(() =>
  import('../features/auth/pages/LoginPage').then((module) => ({
    default: module.LoginPage,
  })),
)

const PasswordRecoveryPage = lazy(() =>
  import('../features/auth/pages/PasswordRecoveryPage').then((module) => ({
    default: module.PasswordRecoveryPage,
  })),
)

const OnboardingPage = lazy(() =>
  import('../features/onboarding/pages/OnboardingPage').then((module) => ({
    default: module.OnboardingPage,
  })),
)

const ModeHomePage = lazy(() =>
  import('../features/onboarding/pages/ModeHomePage').then((module) => ({
    default: module.ModeHomePage,
  })),
)

const ProfessionalProfilePage = lazy(() =>
  import('../features/professional-profile/pages/ProfessionalProfilePage').then(
    (module) => ({ default: module.ProfessionalProfilePage }),
  ),
)

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-dvh bg-background px-4 py-6 sm:px-6 lg:px-8"
    >
      <span className="sr-only">Carregando interface…</span>
      <div aria-hidden="true" className="mx-auto w-full max-w-7xl animate-pulse">
        <div className="flex items-center justify-between border-b pb-5">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="size-10 rounded-full" />
        </div>
        <div className="mt-10 max-w-3xl space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="hidden h-44 lg:block" />
        </div>
      </div>
    </div>
  )
}

export function AppRouter() {
  return (
    <RegistrationDraftProvider>
      <Routes>
      <Route
        path="/entrar"
        element={
          <Suspense fallback={<RouteFallback />}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/recuperar-senha"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PasswordRecoveryPage />
          </Suspense>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route element={<ProfileRoute />}>
          <Route path="/conta" element={<ProfileHomeRedirect />} />
          <Route element={<OnboardingRoute />}>
            <Route
              path="/onboarding"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <OnboardingPage />
                </Suspense>
              }
            />
          </Route>
          <Route element={<ModeRoute mode="client" />}>
            <Route
              path="/cliente"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ModeHomePage mode="client" />
                </Suspense>
              }
            />
          </Route>
          <Route element={<ModeRoute mode="professional" />}>
            <Route
              path="/profissional"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ModeHomePage mode="professional" />
                </Suspense>
              }
            />
            <Route
              path="/profissional/perfil"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ProfessionalProfilePage />
                </Suspense>
              }
            />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/cadastro"
        element={
          <Suspense fallback={<RouteFallback />}>
            <RegistrationPage />
          </Suspense>
        }
      />
      <Route
        path="/design-system"
        element={
          <Suspense fallback={<RouteFallback />}>
            <DesignSystemPage />
          </Suspense>
        }
      />
      <Route
        path="/termos-de-uso"
        element={
          <Suspense fallback={<RouteFallback />}>
            <TermsOfUsePage />
          </Suspense>
        }
      />
      <Route
        path="/politica-de-privacidade"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PrivacyPolicyPage />
          </Suspense>
        }
      />
      <Route
        path="/design-system/layouts/cliente"
        element={
          <Suspense fallback={<RouteFallback />}>
            <LayoutPreviewPage mode="client" />
          </Suspense>
        }
      />
      <Route
        path="/design-system/layouts/profissional"
        element={
          <Suspense fallback={<RouteFallback />}>
            <LayoutPreviewPage mode="professional" />
          </Suspense>
        }
      />
      <Route
        path="/design-system/layouts/admin"
        element={
          <Suspense fallback={<RouteFallback />}>
            <LayoutPreviewPage mode="admin" />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RegistrationDraftProvider>
  )
}
