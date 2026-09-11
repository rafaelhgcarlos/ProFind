import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { HomePage } from '../features/home/pages/HomePage'
import { NotFoundPage } from '../features/not-found/pages/NotFoundPage'
import { Skeleton } from '../components/ui/skeleton'

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
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/design-system"
        element={
          <Suspense fallback={<RouteFallback />}>
            <DesignSystemPage />
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
  )
}
