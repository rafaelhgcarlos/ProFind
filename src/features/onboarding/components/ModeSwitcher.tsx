import { BriefcaseBusiness, ChevronDown, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {
  isUserRole,
  roleLabels,
  type UserRole,
} from '../user-role'
import { useProfile } from '../use-profile'

const roleIcons = {
  client: UserRound,
  professional: BriefcaseBusiness,
} satisfies Record<UserRole, typeof UserRound>

export function ModeSwitcher() {
  const navigate = useNavigate()
  const { profile, resolveLandingRoute, switchMode } = useProfile()
  const [isSwitching, setIsSwitching] = useState(false)

  if (!profile?.activeMode) return null

  const currentMode = profile.activeMode
  const CurrentIcon = roleIcons[currentMode]

  async function handleModeChange(value: string) {
    if (isSwitching || !isUserRole(value) || value === currentMode) return

    setIsSwitching(true)
    try {
      const updatedProfile = await switchMode(value)
      const destination = await resolveLandingRoute(updatedProfile)
      toast.success(`Modo ${roleLabels[value]} ativado.`)
      navigate(destination, { replace: true })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível alternar o modo agora.',
      )
    } finally {
      setIsSwitching(false)
    }
  }

  if (profile.roles.length < 2) {
    return (
      <span className="hidden min-h-9 items-center gap-2 rounded-md bg-secondary px-3 text-xs font-semibold text-secondary-foreground sm:inline-flex">
        <CurrentIcon className="size-4" aria-hidden="true" />
        {roleLabels[currentMode]}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          loading={isSwitching}
          loadingLabel="Alternando…"
          aria-label={`Modo atual: ${roleLabels[currentMode]}. Alternar modo`}
        >
          <CurrentIcon aria-hidden="true" />
          <span className="hidden sm:inline">{roleLabels[currentMode]}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Usar o ProFind como</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentMode}
          onValueChange={(value) => void handleModeChange(value)}
        >
          {profile.roles.map((role) => {
            const Icon = roleIcons[role]
            return (
              <DropdownMenuRadioItem key={role} value={role} disabled={isSwitching}>
                <Icon aria-hidden="true" />
                {roleLabels[role]}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
