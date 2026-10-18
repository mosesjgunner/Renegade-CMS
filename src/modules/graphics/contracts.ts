import type { GraphicPreset } from '../media/contracts'

export type GraphicTemplate =
  | 'quote'
  | 'article-social'
  | 'og'
  | 'podcast'
  | 'youtube-thumbnail'
  | 'book-chapter-promo'
  | 'product'
  | 'event'
  | 'announcement'
  | 'donation-campaign'
export const graphicTemplatePresets: Record<
  GraphicTemplate,
  { preset: GraphicPreset; width: number; height: number }
> = {
  quote: { preset: 'square', width: 1080, height: 1080 },
  'article-social': { preset: 'square', width: 1080, height: 1080 },
  og: { preset: 'og', width: 1200, height: 630 },
  podcast: { preset: 'square', width: 3000, height: 3000 },
  'youtube-thumbnail': { preset: 'thumbnail', width: 1280, height: 720 },
  'book-chapter-promo': { preset: 'portrait', width: 1080, height: 1350 },
  product: { preset: 'square', width: 1080, height: 1080 },
  event: { preset: 'story', width: 1080, height: 1920 },
  announcement: { preset: 'square', width: 1080, height: 1080 },
  'donation-campaign': { preset: 'square', width: 1080, height: 1080 },
}
