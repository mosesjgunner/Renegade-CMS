import { createPackageArchive, type PackageArchive } from './contracts'

const base = {
  author: 'Renegade CMS',
  version: '1.0.0',
  compatibleCore: '^0.1.0',
  compatibleSchema: '^1.0.0',
  dependencies: [],
  requiredCapabilities: [],
  optionalCapabilities: [],
  license: { identifier: 'AGPL-3.0-or-later' },
} as const

/** First-party, data-only fixtures that prove packages travel without embedded React or server code. */
export const referencePackages: readonly PackageArchive[] = [
  createPackageArchive({
    ...base,
    key: 'renegade.reading-template',
    name: 'Reading page template',
    type: 'template',
    files: [
      {
        id: 'reading-page',
        kind: 'layout',
        path: 'templates/reading-page.json',
        contents: JSON.stringify({
          layoutVersion: 1,
          blocks: [
            { component: 'publisher.hero', componentVersion: 1, props: { title: 'Read on' } },
            {
              component: 'publisher.article-list',
              componentVersion: 1,
              props: { title: 'Latest' },
            },
          ],
        }),
      },
    ],
  }),
  createPackageArchive({
    ...base,
    key: 'renegade.hero-preset',
    name: 'Accessible hero preset',
    type: 'block-preset',
    files: [
      {
        id: 'hero-accessible',
        kind: 'preset',
        path: 'presets/hero-accessible.json',
        contents: JSON.stringify({
          component: 'publisher.hero',
          componentVersion: 1,
          props: { title: 'Make this space yours' },
        }),
      },
    ],
  }),
  createPackageArchive({
    ...base,
    key: 'renegade.writer-starter',
    name: 'Writer starter site',
    type: 'starter-site',
    files: [
      {
        id: 'writer-home',
        kind: 'content',
        path: 'content/writer-home.json',
        contents: JSON.stringify({
          id: 'starter:writer-home',
          collection: 'page-layouts',
          layoutVersion: 1,
          themeId: 'neutral-starter',
          blocks: [
            {
              component: 'publisher.hero',
              componentVersion: 1,
              props: { title: 'A useful publication' },
            },
          ],
        }),
      },
    ],
  }),
]
