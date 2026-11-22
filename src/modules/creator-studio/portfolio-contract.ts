export const portfolioLayouts = [
  'grid',
  'masonry',
  'hero',
  'film-reel',
  'music-catalog',
  'case-study',
  'exhibition',
] as const

export const portfolioKinds = [
  'portfolio',
  'gallery',
  'mixed-media',
  'exhibition',
  'catalog',
] as const
export const portfolioVisibilities = ['public', 'unlisted', 'members', 'private'] as const

export type PortfolioCollection = 'albums' | 'creator-projects'
export type PortfolioLayout = (typeof portfolioLayouts)[number]
export type PortfolioKind = (typeof portfolioKinds)[number]
export type PortfolioVisibility = (typeof portfolioVisibilities)[number]
export type PortfolioBlock = {
  id: string
  kind: 'image' | 'audio' | 'video' | 'embed' | 'text'
  title: string
  text: string
  media: string
  url: string
  alt: string
  caption: string
  credit: string
  rights: string
}
export type PortfolioSection = { id: string; title: string; blocks: PortfolioBlock[] }
export type Portfolio = {
  title: string
  summary: string
  layout: PortfolioLayout
  visibility: PortfolioVisibility
  cover: string
  credits: string
  startsOn: string
  endsOn: string
  tags: string[]
  sourceRights: string
  canonicalContent: string
  relatedContent: string[]
  relatedProducts: string[]
  sections: PortfolioSection[]
}

export const emptyPortfolio = (): Portfolio => ({
  title: '',
  summary: '',
  layout: 'grid',
  visibility: 'public',
  cover: '',
  credits: '',
  startsOn: '',
  endsOn: '',
  tags: [],
  sourceRights: '',
  canonicalContent: '',
  relatedContent: [],
  relatedProducts: [],
  sections: [],
})

export const portfolioBlockKinds = ['image', 'audio', 'video', 'embed', 'text'] as const

export const portfolioLabels: Record<PortfolioLayout, string> = {
  grid: 'Grid',
  masonry: 'Masonry',
  hero: 'Hero',
  'film-reel': 'Film reel',
  'music-catalog': 'Music catalog',
  'case-study': 'Project case study',
  exhibition: 'Exhibition',
}

export function portfolioMediaIds(content: Portfolio) {
  return [
    ...new Set(
      [
        content.cover,
        ...content.sections.flatMap((section) => section.blocks.map((block) => block.media)),
      ].filter(Boolean),
    ),
  ]
}

export function portfolioEmbed(value: string): { frame: string; link: string } | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const path = url.pathname.split('/').filter(Boolean)
  let youtube: string | null | undefined
  if (url.hostname === 'youtu.be' && path.length === 1) youtube = path[0]
  if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') youtube = url.searchParams.get('v')
    else if (path.length === 2 && ['embed', 'shorts'].includes(path[0])) youtube = path[1]
  }
  if (youtube && /^[A-Za-z0-9_-]{11}$/.test(youtube))
    return {
      frame: `https://www.youtube-nocookie.com/embed/${youtube}`,
      link: `https://www.youtube.com/watch?v=${youtube}`,
    }
  const vimeo =
    ['vimeo.com', 'www.vimeo.com'].includes(url.hostname) && path.length === 1
      ? path[0]
      : url.hostname === 'player.vimeo.com' && path[0] === 'video' && path.length === 2
        ? path[1]
        : ''
  return vimeo && /^\d{1,12}$/.test(vimeo)
    ? { frame: `https://player.vimeo.com/video/${vimeo}`, link: `https://vimeo.com/${vimeo}` }
    : null
}
