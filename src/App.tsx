import { BrowserRouter } from 'react-router-dom'

import { ScrollToAnchor } from './components/navigation/ScrollToAnchor'
import { Toaster } from './components/ui/toaster'
import { TooltipProvider } from './components/ui/tooltip'
import { ThemeProvider } from './providers/theme-provider'
import { AppRouter } from './routes/AppRouter'

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <ScrollToAnchor />
          <AppRouter />
          <Toaster />
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  )
}
