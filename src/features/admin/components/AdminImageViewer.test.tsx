import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { AdminImageViewer, type AdminReviewImage } from './AdminImageViewer'
import { imageKitDisplayUrl } from './admin-image-viewer.utils'

const images: AdminReviewImage[] = [
  {
    url: 'https://ik.imagekit.io/example/avatar.webp',
    alt: 'Foto profissional de Ana',
    label: 'Foto de perfil',
  },
  {
    url: 'https://images.example/work.webp',
    alt: 'Instalação elétrica concluída',
    label: 'Portfólio 1',
  },
]

function ViewerHarness() {
  const [index, setIndex] = useState<number | null>(null)
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLButtonElement | null>(null)
  return (
    <>
      <button
        ref={setReturnFocusTo}
        type="button"
        onClick={() => setIndex(0)}
      >Abrir foto</button>
      <AdminImageViewer
        images={images}
        index={index}
        returnFocusTo={returnFocusTo}
        onIndexChange={setIndex}
      />
    </>
  )
}

describe('AdminImageViewer', () => {
  it('aplica transformação de exibição somente em URLs ImageKit', () => {
    expect(imageKitDisplayUrl(images[0].url, 1920)).toContain('tr=w-1920%2Cq-85%2Cf-auto')
    expect(imageKitDisplayUrl(images[1].url, 1920)).toBe(images[1].url)
  })

  it('navega por controles e teclado, amplia e ajusta à tela', async () => {
    render(<ViewerHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir foto' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    fireEvent.load(screen.getByAltText('Foto profissional de Ana'))
    fireEvent.click(screen.getByRole('button', { name: /ampliar/i }))
    expect(screen.getByRole('meter', { name: 'Nível de ampliação' })).toHaveAttribute('aria-valuenow', '150')
    expect(screen.getByText('Arraste para mover')).toBeInTheDocument()
    const expandedImage = screen.getByAltText('Foto profissional de Ana')
    const imageStage = expandedImage.parentElement as HTMLElement
    fireEvent.pointerDown(imageStage, { pointerId: 1, clientX: 10, clientY: 15 })
    fireEvent.pointerMove(imageStage, { pointerId: 1, clientX: 35, clientY: 45 })
    fireEvent.pointerUp(imageStage, { pointerId: 1, clientX: 35, clientY: 45 })
    expect(expandedImage).toHaveStyle({ transform: 'translate3d(25px, 30px, 0) scale(1.5)' })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    expect(screen.getByAltText('Instalação elétrica concluída')).toHaveAttribute('src', images[1].url)
    fireEvent.click(screen.getByRole('button', { name: /ajustar à tela/i }))
    expect(screen.getByRole('meter', { name: 'Nível de ampliação' })).toHaveAttribute('aria-valuenow', '100')
    fireEvent.click(screen.getByRole('button', { name: 'Imagem anterior' }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
  })

  it('mostra erro de carregamento e fecha por Esc devolvendo o foco', async () => {
    render(<ViewerHarness />)
    const trigger = screen.getByRole('button', { name: 'Abrir foto' })
    fireEvent.click(trigger)
    fireEvent.error(screen.getByAltText('Foto profissional de Ana'))
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar esta imagem.')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
