export function imageKitDisplayUrl(url: string, width: number) {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('imagekit.io')) return url
    parsed.searchParams.set('tr', `w-${width},q-85,f-auto`)
    return parsed.toString()
  } catch {
    return url
  }
}
