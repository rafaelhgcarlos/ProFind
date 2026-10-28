import { ChevronLeft, ChevronRight, Maximize2, Move, ZoomIn, ZoomOut } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { imageKitDisplayUrl } from './admin-image-viewer.utils'

export interface AdminReviewImage {
  url: string
  alt: string
  label: string
}

interface AdminImageViewerProps {
  images: AdminReviewImage[]
  index: number | null
  returnFocusTo?: HTMLElement | null
  onIndexChange(index: number | null): void
}

const MIN_SCALE = 1
const MAX_SCALE = 4
const SCALE_STEP = 0.5

export function AdminImageViewer({
  images,
  index,
  returnFocusTo,
  onIndexChange,
}: AdminImageViewerProps) {
  const open = index !== null && images.length > 0
  const safeIndex = index === null ? 0 : Math.min(Math.max(index, 0), images.length - 1)
  const image = images[safeIndex]
  const [scale, setScale] = useState(MIN_SCALE)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null)

  const fitToScreen = useCallback(() => {
    setScale(MIN_SCALE)
    setPosition({ x: 0, y: 0 })
  }, [])

  const changeImage = useCallback((nextIndex: number) => {
    if (images.length < 2) return
    const normalized = (nextIndex + images.length) % images.length
    fitToScreen()
    setLoading(true)
    setFailed(false)
    onIndexChange(normalized)
  }, [fitToScreen, images.length, onIndexChange])

  function close() {
    onIndexChange(null)
    window.setTimeout(() => returnFocusTo?.focus(), 0)
  }

  const changeScale = useCallback((nextScale: number) => {
    const normalized = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
    setScale(normalized)
    if (normalized === MIN_SCALE) setPosition({ x: 0, y: 0 })
  }, [])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (scale === MIN_SCALE) return
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId || scale === MIN_SCALE) return
    const deltaX = event.clientX - drag.current.x
    const deltaY = event.clientY - drag.current.y
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    setPosition((current) => ({ x: current.x + deltaX, y: current.y + deltaY }))
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    drag.current = null
  }

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        changeImage(safeIndex - 1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        changeImage(safeIndex + 1)
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        changeScale(scale + SCALE_STEP)
      }
      if (event.key === '-') {
        event.preventDefault()
        changeScale(scale - SCALE_STEP)
      }
      if (event.key === '0') {
        event.preventDefault()
        fitToScreen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [changeImage, changeScale, fitToScreen, open, safeIndex, scale])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close() }}>
      <DialogContent className="h-[min(92dvh,60rem)] max-w-[min(96vw,90rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 sm:p-5">
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle className="truncate">{image?.label ?? 'Visualizador de imagens'}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{images.length ? `${safeIndex + 1} de ${images.length}` : 'Nenhuma imagem'}</span>
            <span>{Math.round(scale * 100)}%</span>
            {scale > MIN_SCALE ? <span className="inline-flex items-center gap-1"><Move aria-hidden="true" className="size-3.5" /> Arraste para mover</span> : null}
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative flex min-h-0 touch-none items-center justify-center overflow-hidden rounded-md bg-black/90"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          {loading && !failed ? (
            <p role="status" className="absolute text-sm font-medium text-white">Carregando imagem…</p>
          ) : null}
          {failed ? (
            <div role="alert" className="max-w-sm p-6 text-center text-sm text-white">
              <p className="font-semibold">Não foi possível carregar esta imagem.</p>
              <Button className="mt-4" variant="secondary" onClick={() => { setFailed(false); setLoading(true) }}>
                Tentar novamente
              </Button>
            </div>
          ) : image ? (
            <img
              key={`${image.url}-${failed ? 'retry' : 'image'}`}
              src={imageKitDisplayUrl(image.url, 1920)}
              alt={image.alt}
              draggable="false"
              className="max-h-full max-w-full select-none object-contain transition-transform duration-150 ease-out"
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                cursor: scale > MIN_SCALE ? 'grab' : 'default',
              }}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setFailed(true) }}
            />
          ) : null}

          {images.length > 1 ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Imagem anterior"
                className="absolute left-2 shadow-soft sm:left-4"
                onClick={() => changeImage(safeIndex - 1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Próxima imagem"
                className="absolute right-2 shadow-soft sm:right-4"
                onClick={() => changeImage(safeIndex + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2" role="group" aria-label="Controles de visualização">
          <Button type="button" size="sm" variant="outline" disabled={scale <= MIN_SCALE} onClick={() => changeScale(scale - SCALE_STEP)}>
            <ZoomOut aria-hidden="true" /> Reduzir
          </Button>
          <div
            role="meter"
            aria-label="Nível de ampliação"
            aria-valuemin={100}
            aria-valuemax={400}
            aria-valuenow={Math.round(scale * 100)}
            className="min-w-16 text-center text-sm tabular-nums text-muted-foreground"
          >
            {Math.round(scale * 100)}%
          </div>
          <Button type="button" size="sm" variant="outline" disabled={scale >= MAX_SCALE} onClick={() => changeScale(scale + SCALE_STEP)}>
            <ZoomIn aria-hidden="true" /> Ampliar
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={scale === MIN_SCALE && position.x === 0 && position.y === 0} onClick={fitToScreen}>
            <Maximize2 aria-hidden="true" /> Ajustar à tela
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
