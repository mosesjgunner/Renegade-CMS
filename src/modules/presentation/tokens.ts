import type { CSSProperties } from 'react'
export const tokenDefaults = {
  'color.canvas': '#f8f6f0',
  'color.surface': '#ffffff',
  'color.ink': '#191614',
  'color.accent': '#b91c1c',
  'color.focus': '#005ea8',
  'typography.body': 'system-ui, sans-serif',
  'typography.display': 'Georgia, serif',
  'spacing.normal': '1.5rem',
  'radii.normal': '0.5rem',
  'borders.width': '1px',
  'shadows.card': 'none',
  'widths.content': '72rem',
  'motion.duration': '0ms',
}
export type DesignTokens = Partial<Record<keyof typeof tokenDefaults, string>>
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  }
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
export function validateTokens(input: unknown): DesignTokens {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Tokens must be an object.')
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(tokenDefaults, key) || typeof value !== 'string')
      throw new Error('Unknown design token.')
    const valid = key.startsWith('color.')
      ? /^#[0-9a-f]{6}$/i.test(value)
      : key.startsWith('typography.')
        ? ['system-ui, sans-serif', 'Georgia, serif', 'monospace'].includes(value)
        : key === 'shadows.card'
          ? ['none', '0 2px 8px #00000020'].includes(value)
          : key === 'motion.duration'
            ? /^(0|50|100|150|200)ms$/.test(value)
            : /^(\d{1,3}(\.\d{1,3})?)(px|rem)$/.test(value) && parseFloat(value) <= 200
    if (!valid) throw new Error(`Invalid token: ${key}. Use the documented allowed values.`)
  }
  const tokens = { ...tokenDefaults, ...input }
  for (const bg of ['color.canvas', 'color.surface'] as const) {
    if (
      contrast(tokens['color.ink'], tokens[bg]) < 4.5 ||
      contrast(tokens['color.accent'], tokens[bg]) < 4.5 ||
      contrast(tokens['color.focus'], tokens[bg]) < 3
    )
      throw new Error(
        'Insufficient contrast: text/accent require 4.5:1 and focus requires 3:1 against canvas and surface.',
      )
  }
  return input as DesignTokens
}
export function tokenStyle(tokens: DesignTokens): CSSProperties {
  return Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      `--presentation-${key
        .replace(/^color\./, '')
        .replace('typography.', 'font-')
        .replaceAll('.', '-')}`,
      value,
    ]),
  ) as CSSProperties
}
