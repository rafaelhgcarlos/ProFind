import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

function getAnchorId(hash: string) {
  if (hash.length <= 1) return null

  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return hash.slice(1)
  }
}

export function ScrollToAnchor() {
  const location = useLocation()
  const currentUrl = `${location.pathname}${location.search}${location.hash}`

  useEffect(() => {
    const anchorId = getAnchorId(location.hash)
    if (!anchorId) return
    let cancelled = false

    const scrollToTarget = () => {
      const target = document.getElementById(anchorId)
      if (!target) return false

      target.scrollIntoView({ behavior: 'auto', block: 'start' })
      return true
    }

    const realignAfterFontsLoad = () => {
      void document.fonts?.ready.then(() => {
        if (!cancelled) scrollToTarget()
      })
    }

    if (scrollToTarget()) {
      realignAfterFontsLoad()
      return () => {
        cancelled = true
      }
    }

    const observer = new MutationObserver(() => {
      if (scrollToTarget()) {
        observer.disconnect()
        realignAfterFontsLoad()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const timeout = window.setTimeout(() => observer.disconnect(), 2_000)

    return () => {
      cancelled = true
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  }, [currentUrl, location.hash])

  return null
}
