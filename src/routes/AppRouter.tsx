import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { HomePage } from '../features/home/pages/HomePage'
import { NotFoundPage } from '../features/not-found/pages/NotFoundPage'

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
      className="flex min-h-dvh items-center justify-center bg-background px-4 text-sm text-muted-foreground"
    >
      Carregando interface…
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
