import type { ExternalProvider } from './video-providers'

export function ExternalVideoPlayer({
  provider,
  url,
  title,
}: {
  provider: ExternalProvider
  url: string
  title: string
}) {
  if (provider === 'direct-video')
    return (
      <video
        aria-label={title}
        src={url}
        crossOrigin="anonymous"
        controls
        preload="none"
        className="aspect-video w-full bg-black"
      />
    )
  return (
    <iframe
      title={title}
      src={url}
      className="aspect-video w-full bg-black"
      sandbox={
        provider === 'custom-https'
          ? 'allow-scripts allow-presentation'
          : 'allow-scripts allow-same-origin allow-presentation'
      }
      allow="encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      loading="lazy"
      referrerPolicy={provider === 'youtube' ? 'strict-origin-when-cross-origin' : 'no-referrer'}
    />
  )
}
