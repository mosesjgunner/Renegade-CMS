import { emptyPortfolio, type Portfolio, type PortfolioLayout } from './portfolio-contract'

export const creatorTemplates = [
  {
    key: 'photographer',
    name: 'Photographer',
    layout: 'masonry',
    sections: ['Selected photographs', 'About the work'],
  },
  {
    key: 'filmmaker',
    name: 'Filmmaker',
    layout: 'film-reel',
    sections: ['Featured films', 'Credits'],
  },
  {
    key: 'podcast-host',
    name: 'Podcast host',
    layout: 'hero',
    sections: ['Start listening', 'About the show'],
  },
  { key: 'educator', name: 'Educator', layout: 'case-study', sections: ['Lessons', 'Resources'] },
  {
    key: 'musician',
    name: 'Musician',
    layout: 'music-catalog',
    sections: ['Listen', 'Live performances'],
  },
  { key: 'general', name: 'General creator', layout: 'grid', sections: [] },
] as const satisfies readonly {
  key: string
  name: string
  layout: PortfolioLayout
  sections: readonly string[]
}[]

export function portfolioFromTemplate(key?: string): Portfolio {
  const template = creatorTemplates.find((item) => item.key === key)
  return {
    ...emptyPortfolio(),
    visibility: 'private',
    layout: template?.layout ?? 'case-study',
    sections:
      template?.sections.map((title, index) => ({
        id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
        title,
        blocks: [],
      })) ?? [],
  }
}
