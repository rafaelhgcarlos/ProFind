import { ArrowRight, ChevronLeft, ChevronRight, WifiOff } from 'lucide-react'
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Swiper as SwiperInstance } from 'swiper'
import { A11y } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/a11y'

import './active-requests-carousel.css'

import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import type { CatalogSpecialty } from '../../../types/catalog'
import { CLIENT_ACTIVE_REQUESTS_LIMIT, type ClientRequestListItem } from '../../../types/service-request'
import { cn } from '../../../utils/cn'
import { ClientRequestCard } from '../../client-requests/components/ClientRequestCard'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
const breakpoints = { 544: { slidesPerView: 2 }, 912: { slidesPerView: 3 } }
const modules = [A11y]

function subscribeToReducedMotion(listener: () => void) {
  const media = window.matchMedia?.(reducedMotionQuery)
  media?.addEventListener('change', listener)
  return () => media?.removeEventListener('change', listener)
}

function prefersReducedMotion() {
  return window.matchMedia?.(reducedMotionQuery).matches ?? false
}

function slideIds(swiper: SwiperInstance) {
  return swiper.slides.map((slide) => slide.dataset.requestId)
}

function sameSlideOrder(previous: (string | undefined)[], current: (string | undefined)[]) {
  return previous.length === current.length && previous.every((id, index) => id === current[index])
}

export function ActiveRequestsCarousel({ items, specialties, stale }: {
  items: ClientRequestListItem[]
  specialties?: CatalogSpecialty[]
  stale: boolean
}) {
  const trackId = useId()
  const swiperRef = useRef<SwiperInstance | null>(null)
  const previousOrder = useRef<(string | undefined)[]>([])
  const activeId = useRef<string | undefined>(undefined)
  const [position, setPosition] = useState({ index: 0, total: 1, start: true, end: true })
  const [now, setNow] = useState(() => new Date())
  const reduceMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false)
  const speed = reduceMotion ? 0 : 260
  const count = items.length
  const boundedCount = count >= CLIENT_ACTIVE_REQUESTS_LIMIT ? `${count} ou mais` : count
  const title = count === 1 ? '1 pedido ativo' : `${boundedCount} pedidos ativos`
  const showControls = count > 1 && position.total > 1

  function syncPosition(swiper: SwiperInstance) {
    const index = swiper.snapIndex
    const total = swiper.isLocked ? 1 : swiper.snapGrid.length
    const start = swiper.isBeginning
    const end = swiper.isEnd
    setPosition((current) =>
      current.index === index && current.total === total && current.start === start && current.end === end
        ? current
        : { index, total, start, end },
    )
  }

  function rememberPosition(swiper: SwiperInstance) {
    const ids = slideIds(swiper)
    // Swiper can emit slide changes while reconciling children. Keep the prior ID until the update completes.
    if (sameSlideOrder(previousOrder.current, ids)) activeId.current = ids[swiper.activeIndex]
    syncPosition(swiper)
  }

  function syncSlides(swiper: SwiperInstance) {
    const ids = slideIds(swiper)
    if (!sameSlideOrder(previousOrder.current, ids)) {
      const anchor = activeId.current ? ids.indexOf(activeId.current) : -1
      previousOrder.current = ids
      if (anchor >= 0 && anchor !== swiper.activeIndex && !swiper.isLocked) {
        swiper.slideTo(anchor, 0)
      }
    }
    rememberPosition(swiper)
  }

  function connectSwiper(swiper: SwiperInstance) {
    swiperRef.current = swiper
    syncSlides(swiper)
  }

  useEffect(() => {
    const upcoming = items
      .filter(({ request }) => request.status === 'OPEN' && request.acceptUntil > now)
      .map(({ request }) => request.acceptUntil.getTime())
    if (upcoming.length === 0) return
    const delay = Math.min(2_147_483_647, Math.max(0, Math.min(...upcoming) - Date.now()))
    const timer = window.setTimeout(() => setNow(new Date()), delay)
    return () => window.clearTimeout(timer)
  }, [items, now])

  function move(direction: 'previous' | 'next') {
    const swiper = swiperRef.current
    if (!swiper || swiper.destroyed || swiper.isLocked) return
    if (direction === 'previous' && !swiper.isBeginning) swiper.slidePrev()
    if (direction === 'next' && !swiper.isEnd) swiper.slideNext()
  }

  function navigateWithKeys(event: KeyboardEvent<HTMLElement>) {
    if (!showControls || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    move(event.key === 'ArrowLeft' ? 'previous' : 'next')
  }

  function revealFocusedCard(event: FocusEvent<HTMLElement>) {
    const swiper = swiperRef.current
    if (!swiper || swiper.destroyed || swiper.isLocked || swiper.allowClick === false) return
    const slide = event.target.closest<HTMLElement>('.swiper-slide')
    if (!slide || !swiper.slides.includes(slide)) return
    const viewport = swiper.el.getBoundingClientRect()
    const card = slide.getBoundingClientRect()
    if (card.left < viewport.left - 1 || card.right > viewport.right + 1) {
      swiper.slideTo(swiper.slides.indexOf(slide), 0)
    }
  }

  return (
    <section aria-labelledby="active-requests-title" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="active-requests-title" className="text-2xl font-bold tracking-tight">
            {stale ? 'Pedidos ativos' : title}
          </h2>
          {showControls ? (
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              <span className="sr-only">Posição </span>{position.index + 1} / {position.total}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/cliente/pedidos">Meus pedidos <ArrowRight aria-hidden="true" /></Link>
          </Button>
          {showControls ? (
            <div role="group" aria-label="Controles dos pedidos ativos" className="flex items-center gap-1.5">
              <Button type="button" size="icon" variant="outline" aria-label="Pedidos anteriores"
                aria-controls={trackId} aria-disabled={position.start} data-disabled={position.start}
                onClick={() => move('previous')}>
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button type="button" size="icon" variant="outline" aria-label="Próximos pedidos"
                aria-controls={trackId} aria-disabled={position.end} data-disabled={position.end}
                onClick={() => move('next')}>
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {stale ? (
        <Alert variant="warning" className="mt-3">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Dados salvos no dispositivo</AlertTitle>
          <AlertDescription>
            {count} {count === 1 ? 'pedido exibido' : 'pedidos exibidos'}. Os dados podem estar desatualizados e não confirmam a situação atual. Confira quando a conexão voltar.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="min-w-0" onKeyDown={navigateWithKeys} onFocusCapture={revealFocusedCard}>
        <Swiper
          id={trackId}
          role="region"
          modules={modules}
          a11y={{
            containerMessage: 'Pedidos em acompanhamento',
            containerRoleDescriptionMessage: 'carrossel',
            slideRole: 'group',
            itemRoleDescriptionMessage: 'pedido',
            slideLabelMessage: '{{index}} de {{slidesLength}}',
            scrollOnFocus: false,
            wrapperLiveRegion: false,
          }}
          breakpointsBase="container"
          breakpoints={breakpoints}
          slidesPerView={count === 1 ? 1 : 1.12}
          spaceBetween={12}
          speed={speed}
          watchOverflow
          simulateTouch
          grabCursor
          preventClicks
          preventClicksPropagation
          tabIndex={showControls ? 0 : undefined}
          onSwiper={connectSwiper}
          onUpdate={syncSlides}
          onSlideChange={rememberPosition}
          onSnapIndexChange={syncPosition}
          onSnapGridLengthChange={syncPosition}
          onToEdge={syncPosition}
          onFromEdge={syncPosition}
          onLock={syncPosition}
          onUnlock={syncPosition}
          onResize={syncPosition}
          className={cn(
            'active-requests-swiper mt-3 w-full min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            count === 1 && 'max-w-md',
          )}
        >
          {items.map((item) => (
            <SwiperSlide key={item.request.requestId} data-request-id={item.request.requestId}>
              <ClientRequestCard
                compact
                item={item}
                specialtyName={specialties?.find((specialty) => specialty.id === item.request.specialtyId)?.name ?? 'Serviço solicitado'}
                stale={stale}
                now={now}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  )
}
