import { describe, expect, it } from 'vitest'

import { renderableImageSource } from './image-url'

describe('renderableImageSource', () => {
  it('preserva somente URLs HTTPS renderizáveis', () => {
    expect(
      renderableImageSource('https://ik.imagekit.io/profind/avatar.webp'),
    ).toBe('https://ik.imagekit.io/profind/avatar.webp')
    expect(renderableImageSource('blob:preview-local')).toBeUndefined()
    expect(renderableImageSource('not-a-url')).toBeUndefined()
  })

  it('não requisita URLs mock legadas', () => {
    expect(
      renderableImageSource(
        'https://mock-images.profind.invalid/user/client-avatar-old',
      ),
    ).toBeUndefined()
  })
})
