'use client'

import { useState } from 'react'

export type GalleryImage = { id: string; alt: string }

/**
 * RC3-20 SHOP-UX Pass 02 — accessible product gallery: one main image with
 * thumbnail buttons. Buttons are native elements (keyboard-operable, focus
 * visible), the selected thumbnail is exposed with aria-pressed, and the
 * main image's alt text always describes the image actually shown.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[]
  productName: string
}) {
  const [selected, setSelected] = useState(0)
  if (!images.length) return null
  const current = images[Math.min(selected, images.length - 1)]
  return (
    <div className="space-y-3">
      <img
        src={`/media/${encodeURIComponent(current.id)}?variant=hero`}
        alt={current.alt}
        className="w-full rounded-lg object-cover"
      />
      {images.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${productName} images`}>
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={index === selected}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              className={`rounded border-2 p-0.5 ${
                index === selected ? 'border-primary' : 'border-transparent'
              }`}
            >
              <img
                src={`/media/${encodeURIComponent(image.id)}?variant=thumbnail`}
                alt=""
                className="h-16 w-16 rounded object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
