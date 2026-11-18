/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * S2-15 recovery proof (service half): put the current rig world's
 * site A onto the renegade-party package through the real lifecycle,
 * so the shell half can remove that package from the standalone,
 * restart the server, and watch configuration resolution recover to
 * the previous package. Uses the world the live proof already built
 * (gui01b-logs/s2-15-world.json); run with the S2-15 env.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { changeTheme, readThemeState, themePool } from '../../src/modules/presentation/lifecycle'

describe('S2-15 recovery setup', () => {
  it('activates renegade-party on site A through the lifecycle', async () => {
    const world = JSON.parse(
      readFileSync('/home/hatch/workspace/gui01b-logs/s2-15-world.json', 'utf8'),
    ) as { siteA: string }
    const payload = await getPayload({ config })
    const pool = themePool(payload as never)
    const site = world.siteA
    let state = await readThemeState(pool, site)
    if (state.active?.id !== 'renegade-party') {
      if (state.draft?.id !== 'renegade-party') {
        await changeTheme(pool, {
          site,
          actor: 's2-15-recovery',
          revision: state.revision,
          action: 'draft',
          id: 'renegade-party',
          version: '1.0.0',
        })
        state = await readThemeState(pool, site)
      }
      await changeTheme(pool, {
        site,
        actor: 's2-15-recovery',
        revision: state.revision,
        action: 'activate',
      })
      state = await readThemeState(pool, site)
    }
    expect(state.active?.id).toBe('renegade-party')
    expect(state.previous?.id).toBe('neutral-starter')
  }, 300_000)
})
