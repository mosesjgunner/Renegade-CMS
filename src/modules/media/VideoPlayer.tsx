export type VideoCaption = {
  src: string
  language: string
  label: string
  default?: boolean
  kind?: 'captions' | 'subtitles'
}

/** Native controls are the accessible fallback; no editor or transcoder code enters this client boundary. */
export function VideoPlayer({
  title,
  src,
  hlsSrc,
  poster,
  captions = [],
}: {
  title: string
  src: string
  hlsSrc?: string
  poster?: string
  captions?: VideoCaption[]
}) {
  return (
    <figure className="w-full overflow-hidden rounded-xl bg-black text-white shadow-xl">
      <video
        className="aspect-video h-auto w-full"
        controls
        preload="metadata"
        poster={poster}
        aria-label={`Video: ${title}`}
        playsInline
      >
        {hlsSrc ? <source src={hlsSrc} type="application/vnd.apple.mpegurl" /> : null}
        <source src={src} type="video/mp4" />
        {captions.map((caption) => (
          <track
            key={`${caption.language}:${caption.label}`}
            src={caption.src}
            srcLang={caption.language}
            label={caption.label}
            kind={caption.kind || 'subtitles'}
            default={caption.default}
          />
        ))}
        Your browser does not support HTML5 video. <a href={src}>Download the playable MP4.</a>
      </video>
      <figcaption className="px-4 py-2 text-sm">{title}</figcaption>
    </figure>
  )
}
