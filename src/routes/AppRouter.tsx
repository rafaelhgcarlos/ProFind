import { Route, Routes } from 'react-router-dom'

import { HomePage } from '../features/home/pages/HomePage'
import { NotFoundPage } from '../features/not-found/pages/NotFoundPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
