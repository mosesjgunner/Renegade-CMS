import fs from 'node:fs'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { getInstallationReadiness } from '@/modules/operations/installation'
import {
  evaluateSetupTasks,
  persistTaskReadinessSnapshot,
} from '@/modules/operations/task-readiness'
import { loadConfig } from '@/modules/core/config'
import { probeAudioEngine } from '@/modules/media/ffmpeg'
import { migrations } from '@/migrations'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()
    const readiness = await getInstallationReadiness(payload, runtimeConfig)

    let storageStatus: 'validated' | 'failed' = 'failed'
    let storageDetails = 'Local media storage directory verified.'
    try {
      const mediaDir = path.resolve(process.cwd(), 'media')
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true })
      }
      fs.accessSync(mediaDir, fs.constants.R_OK | fs.constants.W_OK)
      storageStatus = 'validated'
    } catch (e: unknown) {
      storageStatus = 'failed'
      const msg = e instanceof Error ? e.message : 'Cannot access media directory'
      storageDetails = `Storage write error: ${msg}`
    }

    const audioEngineStatus = await probeAudioEngine()
    const audioEngineSourceLabel =
      audioEngineStatus.ffmpeg.source === 'bundled'
        ? 'bundled'
        : audioEngineStatus.ffmpeg.source === 'env'
          ? 'from server setting'
          : audioEngineStatus.ffmpeg.source === 'explicit'
            ? 'custom path'
            : 'system'

    const providers = {
      audioEngine: {
        name: 'Audio Engine (ffmpeg)',
        type: 'optional' as const,
        status:
          audioEngineStatus.status === 'ready' ? ('validated' as const) : ('unconfigured' as const),
        message:
          audioEngineStatus.status === 'ready'
            ? `Ready — ffmpeg ${audioEngineStatus.ffmpeg.version ?? 'unknown version'} (${audioEngineSourceLabel})`
            : 'Not set up yet — podcast recording, rendering and live streaming need the audio engine. It installs automatically with the installer, or an owner can install it from the Capability Center.',
      },
      database: {
        name: 'PostgreSQL Database',
        type: 'required' as const,
        status: readiness.database === 'connected' ? ('validated' as const) : ('failed' as const),
        message:
          readiness.database === 'connected'
            ? 'Connected and operational'
            : 'Database connection failed',
        recovery: readiness.recoveryAction,
      },
      storage: {
        name: 'Media Storage',
        type: 'required' as const,
        status: storageStatus,
        message: storageDetails,
        recovery:
          storageStatus === 'failed'
            ? 'Ensure application process has read/write permissions to media folder.'
            : undefined,
      },
      email: {
        name: 'Outbound Email (SMTP/Resend)',
        type: 'optional' as const,
        status:
          process.env.RESEND_API_KEY || process.env.SMTP_HOST
            ? ('configured' as const)
            : ('unconfigured' as const),
        message:
          process.env.RESEND_API_KEY || process.env.SMTP_HOST
            ? 'Credentials detected in environment'
            : 'Not configured (skippable, configurable later in Admin Studio)',
      },
      analytics: {
        name: 'Analytics & Telemetry',
        type: 'optional' as const,
        status: 'unconfigured' as const,
        message: 'Telemetry unconfigured (skippable, configurable later in Admin Studio)',
      },
      ai: {
        name: 'AI Model Provider',
        type: 'optional' as const,
        status:
          process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
            ? ('configured' as const)
            : ('unconfigured' as const),
        message:
          process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
            ? 'API key detected'
            : 'Not configured (skippable, configurable later in Admin Studio)',
      },
    }

    // The setup form reads `readiness` and `providers` exactly as before;
    // `tasks` is additive: the same live checks expressed through the
    // shared task-readiness service, so the setup page and the operator
    // console read one readiness contract. Persisting the snapshot is
    // best-effort and never fails this live response.
    const tasks = evaluateSetupTasks({ readiness, providers })
    await persistTaskReadinessSnapshot(payload, tasks).catch(() => false)

    return Response.json({
      readiness,
      providers,
      tasks,
    })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown readiness error'
    const fallbackTasks = evaluateSetupTasks({
      readiness: {
        ready: false,
        database: 'disconnected',
        migrationState: 'uninitialized',
        appliedMigrations: 0,
        totalMigrations: migrations.length,
        pendingMigrations: [],
        installationState: 'uninitialized',
        recoveryAction: 'Start PostgreSQL container and verify DATABASE_URL.',
      },
      providers: {
        database: {
          name: 'PostgreSQL Database',
          type: 'required' as const,
          status: 'failed' as const,
          message: 'Database connection failed',
          recovery: 'PostgreSQL is unavailable. Start container with "docker compose up -d".',
        },
        storage: {
          name: 'Media Storage',
          type: 'required' as const,
          status: 'failed' as const,
          message: 'Storage validation deferred until database is connected.',
        },
        audioEngine: {
          name: 'Audio Engine (ffmpeg)',
          type: 'optional' as const,
          status: 'unconfigured' as const,
          message:
            'Not set up yet — podcast recording, rendering and live streaming need the audio engine. It installs automatically with the installer, or an owner can install it from the Capability Center.',
        },
      },
    })
    return Response.json(
      {
        readiness: {
          ready: false,
          database: 'disconnected',
          migrationState: 'uninitialized',
          appliedMigrations: 0,
          totalMigrations: migrations.length,
          pendingMigrations: [],
          installationState: 'uninitialized',
          recoveryAction: 'Start PostgreSQL container and verify DATABASE_URL.',
        },
        tasks: fallbackTasks,
        providers: {
          database: {
            name: 'PostgreSQL Database',
            type: 'required',
            status: 'failed',
            message: 'Database connection failed',
            recovery: 'PostgreSQL is unavailable. Start container with "docker compose up -d".',
          },
          storage: {
            name: 'Media Storage',
            type: 'required',
            status: 'failed',
            message: 'Storage validation deferred until database is connected.',
          },
          audioEngine: {
            name: 'Audio Engine (ffmpeg)',
            type: 'optional',
            status: 'unconfigured',
            message:
              'Not set up yet — podcast recording, rendering and live streaming need the audio engine. It installs automatically with the installer, or an owner can install it from the Capability Center.',
          },
        },
        error: errorMsg,
      },
      { status: 200 },
    )
  }
}
