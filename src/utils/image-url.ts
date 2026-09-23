export function renderableImageSource(source: string | undefined) {
  if (!source) return undefined
  try {
    const url = new URL(source)
    if (
      url.protocol !== 'https:' ||
      url.hostname === 'mock-images.profind.invalid'
    ) {
      return undefined
    }
    return source
  } catch {
    return undefined
  }
}
