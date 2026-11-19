import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { probeAudioEngine, resetAudioEngineProbeCache } from '@/modules/media/ffmpeg'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

// Mirrors the gate in src/app/(frontend)/api/admin/starters/route.ts:
// payload.auth, restricted to owner / administrator.
const staff = (role?: string | null) => role === 'owner' || role === 'administrator'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!staff(user?.role)) {
    return NextResponse.json(
      { error: 'Owner or administrator access is required.' },
      { status: 403 },
    )
  }

  const publicURL = new URL(request.url)
  publicURL.host = request.headers.get('host') ?? publicURL.host
  if (request.headers.get('origin') !== publicURL.origin)
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 })

  try {
    await execFileAsync('node', ['scripts/install-bundled-ffmpeg.mjs'], {
      cwd: process.cwd(),
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
    })
  } catch (error) {
    // Detail stays server-side; the response stays plain on purpose.
    console.error('Audio engine install failed:', error)
    return NextResponse.json(
      { error: 'The audio engine could not be installed. Check the server logs.' },
      { status: 500 },
    )
  }

  resetAudioEngineProbeCache()
  const audioEngine = await probeAudioEngine()
  if (audioEngine.status !== 'ready') {
    return NextResponse.json(
      {
        error: 'The audio engine could not be installed. Check the server logs.',
        audioEngine,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ audioEngine }, { headers: { 'Cache-Control': 'private, no-store' } })
}
