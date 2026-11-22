'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  emptyPortfolio,
  portfolioBlockKinds,
  portfolioKinds,
  portfolioLabels,
  portfolioLayouts,
  portfolioVisibilities,
  type Portfolio,
  type PortfolioBlock,
  type PortfolioCollection,
  type PortfolioKind,
} from './portfolio-contract'
import styles from './PortfolioWorkspace.module.css'

type Entry = {
  id: string
  collection: PortfolioCollection
  kind: PortfolioKind | 'project'
  title: string
  updatedAt: string
  published: boolean
  path: string
}
type MediaChoice = Choice & { kind: string; altText?: string }
type Choice = { id: string; title: string }
type Library = {
  entries: Entry[]
  media: MediaChoice[]
  content: Choice[]
  products: Choice[]
  submissions: Choice[]
}
type Target = { section: number; block?: number }
const endpoint = '/api/creator-studio/portfolio'
const imageKinds = ['image', 'cover', 'thumbnail', 'graphic']
const blankBlock = (): PortfolioBlock => ({
  id: crypto.randomUUID(),
  kind: 'image',
  title: '',
  text: '',
  media: '',
  url: '',
  alt: '',
  caption: '',
  credit: '',
  rights: '',
})

async function request(query = '', data?: object) {
  const token = document.cookie
    .split('; ')
    .find((item) => item.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  const response = await fetch(
    endpoint + query,
    data
      ? {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-member-csrf': token ? decodeURIComponent(token) : '',
          },
          body: JSON.stringify(data),
        }
      : { cache: 'no-store' },
  )
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Portfolio request failed.')
  return body
}

function ChoiceSelect({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  value: string
  choices: Choice[]
  onChange: (value: string) => void
}) {
  return (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose…</option>
        {value && !choices.some((choice) => choice.id === value) && (
          <option value={value}>Unavailable reference</option>
        )}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function ReferenceList({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  value: string[]
  choices: Choice[]
  onChange: (value: string[]) => void
}) {
  return (
    <div>
      <ChoiceSelect
        label={label}
        value=""
        choices={choices.filter((choice) => !value.includes(choice.id))}
        onChange={(id) => id && onChange([...value, id])}
      />
      <ul>
        {value.map((id) => (
          <li key={id}>
            {choices.find((item) => item.id === id)?.title || 'Unavailable reference'}{' '}
            <button
              type="button"
              aria-label={`Remove ${choices.find((item) => item.id === id)?.title || 'reference'}`}
              onClick={() => onChange(value.filter((selected) => selected !== id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function move<T>(items: T[], from: number, to: number) {
  const order = [...items]
  const [item] = order.splice(from, 1)
  if (item) order.splice(to, 0, item)
  return order
}

function OrderButtons({
  position,
  count,
  name,
  onMove,
}: {
  position: number
  count: number
  name: string
  onMove: (index: number) => void
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Move ${name} up`}
        disabled={position === 0}
        onClick={() => onMove(position - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${name} down`}
        disabled={position === count - 1}
        onClick={() => onMove(position + 1)}
      >
        ↓
      </button>
    </>
  )
}

function BlockEditor({
  block,
  choices,
  onChange,
}: {
  block: PortfolioBlock
  choices: MediaChoice[]
  onChange: (block: PortfolioBlock) => void
}) {
  const [expanded, setExpanded] = useState(!block.media && !block.url && !block.text)
  const label = block.title || choices.find(({ id }) => id === block.media)?.title || block.kind
  function text(
    label: string,
    field: keyof Omit<PortfolioBlock, 'id' | 'kind'>,
    multiline = false,
  ): ReactNode {
    const props = {
      value: block[field],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange({ ...block, [field]: event.target.value }),
    }
    return (
      <label>
        {label}
        {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
      </label>
    )
  }
  return (
    <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>{label}</summary>
      <div className={styles.fields}>
        <label>
          Block type
          <select
            value={block.kind}
            onChange={(event) =>
              onChange({
                ...blankBlock(),
                id: block.id,
                title: block.title,
                kind: event.target.value as PortfolioBlock['kind'],
              })
            }
          >
            {portfolioBlockKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        {text('Block title', 'title')}
        {['image', 'audio', 'video'].includes(block.kind) && (
          <ChoiceSelect
            label="Media"
            value={block.media}
            choices={choices.filter((item) =>
              block.kind === 'image' ? imageKinds.includes(item.kind) : item.kind === block.kind,
            )}
            onChange={(media) =>
              onChange({
                ...block,
                media,
                alt: block.alt || choices.find((item) => item.id === media)?.altText || '',
              })
            }
          />
        )}
        {block.kind === 'embed' && text('YouTube or Vimeo URL', 'url')}
        {block.kind === 'text' && text('Text', 'text', true)}
        {block.kind === 'image' && text('Alt text', 'alt')}
        {text('Caption', 'caption')}
        {text('Credit', 'credit')}
        {text('Rights or license', 'rights')}
      </div>
    </details>
  )
}

export function PortfolioWorkspace() {
  const [library, setLibrary] = useState<Library>()
  const [entry, setEntry] = useState<Entry>()
  const [collection, setCollection] = useState<PortfolioCollection>('albums')
  const [kind, setKind] = useState<PortfolioKind>('portfolio')
  const [draft, setDraft] = useState<Portfolio>(emptyPortfolio)
  const [message, setMessage] = useState('Loading portfolios…')
  const [busy, setBusy] = useState(false)
  const drag = useRef<Target | null>(null)

  useEffect(() => {
    void request()
      .then((data) => {
        setLibrary(data)
        setMessage('')
      })
      .catch((error: Error) => setMessage(error.message))
  }, [])
  function loadEntry(data: Entry & { draft: Portfolio }) {
    setEntry(data)
    setCollection(data.collection)
    if (data.kind !== 'project') setKind(data.kind)
    setDraft(data.draft)
  }
  function reset(next: PortfolioCollection) {
    setEntry(undefined)
    setCollection(next)
    setKind('portfolio')
    setDraft({ ...emptyPortfolio(), layout: next === 'creator-projects' ? 'case-study' : 'grid' })
    setMessage('')
  }
  async function perform(task: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await task()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function save(action: 'save' | 'publish' | 'unpublish') {
    await perform(async () => {
      loadEntry(
        await request('', {
          action,
          collection,
          kind,
          id: entry?.id,
          updatedAt: entry?.updatedAt,
          draft,
        }),
      )
      setLibrary(await request())
      setMessage(
        action === 'publish'
          ? 'Published.'
          : action === 'unpublish'
            ? 'Unpublished. Your draft is saved.'
            : 'Draft saved.',
      )
    })
  }
  function change<K extends keyof Portfolio>(key: K, value: Portfolio[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }
  function reorder(from: Target, to: Target) {
    setDraft((current) => {
      if (from.block === undefined && to.block === undefined)
        return { ...current, sections: move(current.sections, from.section, to.section) }
      if (from.block === undefined) return current
      const source = current.sections[from.section]
      const destination = current.sections[to.section]
      if (!source || !destination) return current
      const blocks = [...source.blocks]
      const [block] = blocks.splice(from.block, 1)
      if (!block) return current
      const target = source === destination ? blocks : [...destination.blocks]
      target.splice(to.block ?? target.length, 0, block)
      return {
        ...current,
        sections: current.sections.map((section) =>
          section === destination
            ? { ...section, blocks: target }
            : section === source
              ? { ...section, blocks }
              : section,
        ),
      }
    })
  }
  function dragTo(event: React.DragEvent, target: Target) {
    event.preventDefault()
    event.stopPropagation()
    if (drag.current) reorder(drag.current, target)
    drag.current = null
  }
  function replaceBlocks(index: number, blocks: PortfolioBlock[]) {
    change(
      'sections',
      draft.sections.map((section, i) => (i === index ? { ...section, blocks } : section)),
    )
  }
  const entryQuery = entry ? `?collection=${entry.collection}&id=${entry.id}` : ''
  const artwork = library?.media.filter((item) => imageKinds.includes(item.kind)) ?? []

  return (
    <main className={styles.workspace}>
      <h1 className="font-display text-4xl">Portfolios and projects</h1>
      <p>
        <Link href="/studio">Creator Studio</Link> ·{' '}
        <Link href="/studio/submissions">Upload media for review</Link>
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {library && (
        <>
          <section className={styles.panel} aria-label="Your portfolios">
            <div className={styles.actions}>
              <button type="button" disabled={busy} onClick={() => reset('albums')}>
                New collection
              </button>
              <button type="button" disabled={busy} onClick={() => reset('creator-projects')}>
                New project
              </button>
              <label>
                Import portfolio
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (!file) return
                    void perform(async () => {
                      if (file.size > 2 * 1024 * 1024)
                        throw new Error('Portfolio export is too large.')
                      const bundle = JSON.parse(await file.text())
                      loadEntry(await request('', { action: 'import', bundle }))
                      setLibrary(await request())
                      setMessage('Portfolio imported as a new draft.')
                    })
                  }}
                />
              </label>
            </div>
            {library.submissions.length > 0 && (
              <ChoiceSelect
                label="Bring in a reviewed upload"
                value=""
                choices={library.submissions}
                onChange={(id) =>
                  id &&
                  void perform(async () => {
                    await request('', { action: 'add-reviewed-media', id })
                    setLibrary(await request())
                    setMessage('Media added to your portfolio library.')
                  })
                }
              />
            )}
            <ul>
              {library.entries.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () =>
                        loadEntry(await request(`?collection=${item.collection}&id=${item.id}`)),
                      )
                    }
                  >
                    {item.title}
                  </button>{' '}
                  {item.published ? 'Published' : 'Draft'}
                </li>
              ))}
            </ul>
          </section>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save('save')
            }}
          >
            <fieldset disabled={busy} className={styles.panel}>
              <legend>{collection === 'albums' ? 'Collection' : 'Creator project'}</legend>
              <div className={styles.fields}>
                <label>
                  Title
                  <input
                    required
                    maxLength={180}
                    value={draft.title}
                    onChange={(event) => change('title', event.target.value)}
                  />
                </label>
                {collection === 'albums' && (
                  <label>
                    Collection type
                    <select
                      value={kind}
                      onChange={(event) => setKind(event.target.value as PortfolioKind)}
                    >
                      {portfolioKinds.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Summary
                  <textarea
                    value={draft.summary}
                    onChange={(event) => change('summary', event.target.value)}
                    rows={3}
                  />
                </label>
                <label>
                  Presentation
                  <select
                    value={draft.layout}
                    onChange={(event) =>
                      change('layout', event.target.value as Portfolio['layout'])
                    }
                  >
                    {portfolioLayouts.map((layout) => (
                      <option key={layout} value={layout}>
                        {portfolioLabels[layout]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Audience
                  <select
                    value={draft.visibility}
                    onChange={(event) =>
                      change('visibility', event.target.value as Portfolio['visibility'])
                    }
                  >
                    {portfolioVisibilities.map((visibility) => (
                      <option key={visibility}>{visibility}</option>
                    ))}
                  </select>
                </label>
                <ChoiceSelect
                  label="Cover or featured artwork"
                  value={draft.cover}
                  choices={artwork}
                  onChange={(id) => change('cover', id)}
                />
              </div>
              <details>
                <summary>Credits, dates, tags and source rights</summary>
                <div className={styles.fields}>
                  <label>
                    Author and team credits
                    <textarea
                      value={draft.credits}
                      onChange={(event) => change('credits', event.target.value)}
                    />
                  </label>
                  <label>
                    Start date
                    <input
                      type="date"
                      value={draft.startsOn}
                      onChange={(event) => change('startsOn', event.target.value)}
                    />
                  </label>
                  <label>
                    End date
                    <input
                      type="date"
                      value={draft.endsOn}
                      onChange={(event) => change('endsOn', event.target.value)}
                    />
                  </label>
                  <label>
                    Tags, one per line
                    <textarea
                      value={draft.tags.join('\n')}
                      onChange={(event) => change('tags', event.target.value.split('\n'))}
                    />
                  </label>
                  <label>
                    Source rights
                    <textarea
                      value={draft.sourceRights}
                      onChange={(event) => change('sourceRights', event.target.value)}
                    />
                  </label>
                </div>
              </details>
              <details>
                <summary>Canonical content and related work</summary>
                <div className={styles.fields}>
                  <ChoiceSelect
                    label="Canonical content"
                    value={draft.canonicalContent}
                    choices={library.content}
                    onChange={(id) => change('canonicalContent', id)}
                  />
                  <ReferenceList
                    label="Related content"
                    value={draft.relatedContent}
                    choices={library.content}
                    onChange={(ids) => change('relatedContent', ids)}
                  />
                  <ReferenceList
                    label="Related products"
                    value={draft.relatedProducts}
                    choices={library.products}
                    onChange={(ids) => change('relatedProducts', ids)}
                  />
                </div>
              </details>
              <div className={styles.sections}>
                {draft.sections.map((section, index) => (
                  <fieldset
                    key={section.id}
                    className={styles.section}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dragTo(event, { section: index })}
                  >
                    <legend>Section {index + 1}</legend>
                    <div className={styles.actions}>
                      <span
                        tabIndex={-1}
                        className={styles.handle}
                        draggable
                        onDragStart={(event) => {
                          drag.current = { section: index }
                          event.dataTransfer.setData('text/plain', section.id)
                        }}
                        onDragEnd={() => {
                          drag.current = null
                        }}
                      >
                        Drag section
                      </span>
                      <OrderButtons
                        position={index}
                        name={`section ${index + 1}`}
                        count={draft.sections.length}
                        onMove={(to) => reorder({ section: index }, { section: to })}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          change(
                            'sections',
                            draft.sections.filter((item) => item !== section),
                          )
                        }
                      >
                        Remove section
                      </button>
                    </div>
                    <label>
                      Section title
                      <input
                        value={section.title}
                        onChange={(event) =>
                          change(
                            'sections',
                            draft.sections.map((item) =>
                              item === section ? { ...item, title: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </label>
                    {section.blocks.map((block, position) => (
                      <div
                        key={block.id}
                        className={styles.block}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => dragTo(event, { section: index, block: position })}
                      >
                        <div className={styles.actions}>
                          <span
                            tabIndex={-1}
                            className={styles.handle}
                            draggable
                            onDragStart={(event) => {
                              drag.current = { section: index, block: position }
                              event.dataTransfer.setData('text/plain', block.id)
                            }}
                            onDragEnd={() => {
                              drag.current = null
                            }}
                          >
                            Drag block
                          </span>
                          <OrderButtons
                            position={position}
                            name={`block ${position + 1}`}
                            count={section.blocks.length}
                            onMove={(to) =>
                              reorder(
                                { section: index, block: position },
                                { section: index, block: to },
                              )
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              replaceBlocks(
                                index,
                                section.blocks.filter((item) => item !== block),
                              )
                            }
                          >
                            Remove block
                          </button>
                        </div>
                        <BlockEditor
                          block={block}
                          choices={library.media}
                          onChange={(next) =>
                            replaceBlocks(
                              index,
                              section.blocks.map((item) => (item === block ? next : item)),
                            )
                          }
                        />
                      </div>
                    ))}
                    <div className={styles.fields}>
                      <ChoiceSelect
                        label="Add an image from the library"
                        value=""
                        choices={artwork}
                        onChange={(media) =>
                          media &&
                          replaceBlocks(index, [
                            ...section.blocks,
                            {
                              ...blankBlock(),
                              media,
                              alt: artwork.find((asset) => asset.id === media)?.altText || '',
                            },
                          ])
                        }
                      />
                      <button
                        type="button"
                        onClick={() => replaceBlocks(index, [...section.blocks, blankBlock()])}
                      >
                        Add block
                      </button>
                    </div>
                  </fieldset>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  change('sections', [
                    ...draft.sections,
                    {
                      id: crypto.randomUUID(),
                      title: '',
                      blocks: [],
                    },
                  ])
                }
              >
                Add section
              </button>
              <div className={styles.actions}>
                <button type="submit">Save draft</button>
                {entry && (
                  <>
                    <button type="button" onClick={() => void save('publish')}>
                      Publish
                    </button>
                    {entry.published && (
                      <button type="button" onClick={() => void save('unpublish')}>
                        Unpublish
                      </button>
                    )}
                    <Link
                      href={`/studio/portfolio/preview/${entry.collection}/${entry.id}`}
                      target="_blank"
                    >
                      Private preview
                    </Link>
                    {entry.published && (
                      <Link href={entry.path} target="_blank">
                        View published page
                      </Link>
                    )}
                    <a href={endpoint + entryQuery + '&export=1'} download>
                      Export portfolio
                    </a>
                  </>
                )}
              </div>
            </fieldset>
          </form>
        </>
      )}
    </main>
  )
}
