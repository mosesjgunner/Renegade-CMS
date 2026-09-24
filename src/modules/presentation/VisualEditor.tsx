'use client'

import '@puckeditor/core/no-external.css'
import { Puck, type Config, type Data, type Field } from '@puckeditor/core'
import { useEffect, useMemo, useState } from 'react'

import {
  type PageLayout,
  type PresentationField,
  type ReferenceValue,
} from '../public/page-builder'
import { paletteFor, puckVisualEditor } from './puck-adapter'
import type { PresentationDocument } from './contracts'
import { resolveTheme } from './registry'

function documentFor(layout: PageLayout): PresentationDocument {
  const theme = resolveTheme(layout.themeId)
  const slot = layout.slot ?? 'main'
  return {
    version: 1,
    siteId: layout.siteId,
    theme: { id: theme.id, version: theme.version },
    template: { id: 'layout', version: '1.0.0' },
    surface: 'layout',
    slots: { [slot]: layout.blocks },
  }
}

export function toEditorData(layout: PageLayout): Data {
  return puckVisualEditor.toEditor(documentFor(layout))
}

export function fromEditorData(layout: PageLayout, data: Data): PageLayout {
  const document = puckVisualEditor.fromEditor(documentFor(layout), data)
  return {
    ...layout,
    blocks: document.slots[layout.slot ?? 'main'] ?? [],
    revision: layout.revision + 1,
  }
}

function ReferenceChooser({
  value,
  onChange,
  kind,
  layoutId,
}: {
  value?: ReferenceValue
  onChange: (value: ReferenceValue | undefined) => void
  kind: 'media' | 'link'
  layoutId: string
}) {
  const [options, setOptions] = useState<ReferenceValue[]>([])
  useEffect(() => {
    void fetch(`/api/layouts/${layoutId}/choices?kind=${kind}`)
      .then((response) => (response.ok ? response.json() : { options: [] }))
      .then((body) => setOptions(Array.isArray(body.options) ? body.options : []))
  }, [kind, layoutId])
  return (
    <select
      aria-label={kind === 'media' ? 'Choose media from library' : 'Choose internal destination'}
      value={value?.id ?? ''}
      onChange={(event) => onChange(options.find((option) => option.id === event.target.value))}
    >
      <option value="">Choose…</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function QueryEditor({
  value,
  onChange,
}: {
  value?: Record<string, unknown>
  onChange: (value: object) => void
}) {
  const query = { collection: 'content', limit: 6, sort: 'newest', ...value }
  return (
    <fieldset aria-label="Content query" style={{ display: 'grid', gap: 8 }}>
      <select
        value={String(query.collection)}
        onChange={(event) => onChange({ ...query, collection: event.target.value })}
      >
        <option value="content">Articles and pages</option>
        <option value="events">Events</option>
        <option value="albums">Albums</option>
        <option value="discussions">Discussions</option>
      </select>
      <select
        value={String(query.sort)}
        onChange={(event) => onChange({ ...query, sort: event.target.value })}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="title">Title</option>
      </select>
      <input
        aria-label="Maximum results"
        type="number"
        min={1}
        max={24}
        value={Number(query.limit)}
        onChange={(event) => onChange({ ...query, limit: Number(event.target.value) })}
      />
    </fieldset>
  )
}

function puckField(field: PresentationField, layoutId: string): Field {
  if (field.type === 'text') return { type: 'text', label: field.label }
  if (field.type === 'long-text') return { type: 'textarea', label: field.label }
  if (field.type === 'number')
    return { type: 'number', label: field.label, min: field.min, max: field.max }
  if (field.type === 'boolean')
    return {
      type: 'radio',
      label: field.label,
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    }
  if (field.type === 'select' || field.type === 'alignment' || field.type === 'token')
    return {
      type: 'select',
      label: field.label,
      options: field.options.map((value) => ({ label: value, value })),
    }
  if (field.type === 'content-query')
    return {
      type: 'custom',
      label: field.label,
      render: ({ value, onChange }) => (
        <QueryEditor value={value as Record<string, unknown>} onChange={onChange} />
      ),
    }
  return {
    type: 'custom',
    label: field.label,
    render: ({ value, onChange }) => (
      <ReferenceChooser
        value={value as ReferenceValue}
        onChange={onChange}
        kind={field.type as 'media' | 'link'}
        layoutId={layoutId}
      />
    ),
  }
}

export function VisualEditor({
  layout,
  onChange,
  onPublish,
}: {
  layout: PageLayout
  onChange: (layout: PageLayout) => void
  onPublish: (layout: PageLayout) => void
}) {
  const { id, siteId, themeId, slot = 'main' } = layout
  const config = useMemo(() => {
    const theme = resolveTheme(themeId)
    const document: PresentationDocument = {
      version: 1,
      siteId,
      theme: { id: theme.id, version: theme.version },
      template: { id: 'layout', version: '1.0.0' },
      surface: 'layout',
      slots: { [slot]: [] },
    }
    const palette = paletteFor(document)
    const allowed = new Set(palette.flatMap((category) => category.components))
    return {
      categories: Object.fromEntries(
        palette.map((category) => [
          category.id,
          {
            title: category.label,
            components: category.components,
            defaultExpanded: category.id === 'introduction',
          },
        ]),
      ),
      components: Object.fromEntries(
        Object.values(theme.componentRegistry)
          .filter((definition) => allowed.has(definition.id))
          .map((definition) => [
            definition.id,
            {
              label: definition.label,
              fields: Object.fromEntries(
                Object.entries(definition.fields).map(([name, field]) => [
                  name,
                  puckField(field, id),
                ]),
              ),
              defaultProps: {
                title: definition.label,
                alignment: 'left',
                spacing: 'normal',
                variant: 'default',
              },
              render: (props: Record<string, unknown>) => definition.render(props),
            },
          ]),
      ),
    } as unknown as Config
  }, [id, siteId, themeId, slot])

  return (
    <Puck
      key={`${layout.id}:${layout.themeId}:${layout.slot ?? 'main'}`}
      config={config}
      data={toEditorData(layout)}
      permissions={{ drag: true, duplicate: true, delete: true, edit: true, insert: true }}
      onChange={(data) => onChange(fromEditorData(layout, data))}
      onPublish={(data) => onPublish(fromEditorData(layout, data))}
      headerTitle="Renegade visual editor"
      headerPath={`${layout.surface ?? 'page'} / ${layout.slot ?? 'main'}`}
    />
  )
}
