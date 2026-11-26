import { ImageOff } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../utils/cn'

export function ImageThumbnail({ src, alt, className }: {
  src?: string | null
  alt: string
  className?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  return (
    <span className={cn('relative block aspect-[4/3] w-full min-w-0 max-w-full rounded-md bg-muted', className)}>
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 size-full rounded-[inherit] object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span role="img" aria-label={'Imagem indisponível: ' + alt} className="absolute inset-0 grid place-items-center text-muted-foreground">
          <ImageOff className="size-6" aria-hidden="true" />
        </span>
      )}
    </span>
  )
}
