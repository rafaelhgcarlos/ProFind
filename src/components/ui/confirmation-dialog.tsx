import type { ReactNode, RefObject } from 'react'
import { useRef } from 'react'

import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'

interface ConfirmationDialogProps {
  open: boolean
  title: string
  description: ReactNode
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  busyLabel?: string
  disabled?: boolean
  destructive?: boolean
  returnFocusTo?: RefObject<HTMLElement | null>
  error?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationDialog({
  open, title, description, children, confirmLabel, cancelLabel = 'Voltar', busy, busyLabel,
  disabled, destructive, returnFocusTo, error, onCancel, onConfirm,
}: ConfirmationDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
      <DialogContent
        showClose={!busy}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}
        onPointerDownOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancel.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader className="pr-9">
          <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error ? <p role="alert" className="text-sm wrap-anywhere text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button ref={cancel} type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={disabled} loading={busy} loadingLabel={busyLabel} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
