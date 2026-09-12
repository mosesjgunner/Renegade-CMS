import type { CSSProperties } from 'react'
import type { ThemeManifest } from './contracts'
import { StarterShell } from './themes/StarterShell'
export const shellRegistry = { 'starter.shell': StarterShell } as Record<
  string,
  typeof StarterShell
>
export function themeStyle(theme: ThemeManifest): CSSProperties {
  return {
    ...Object.fromEntries(
      Object.entries(theme.tokens.color).map(([key, value]) => [`--presentation-${key}`, value]),
    ),
    '--presentation-font-display': theme.tokens.typography.display,
    '--presentation-font-body': theme.tokens.typography.body,
    ...Object.fromEntries(
      Object.entries(theme.tokens.spacing).map(([key, value]) => [
        `--presentation-spacing-${key}`,
        value,
      ]),
    ),
  } as CSSProperties
}
