/**
 * POD-16 — Relay process adapter: spawns the real ffmpeg binary for
 * the supervisor core in `relay.ts` (the POD-09 conform-service spawn
 * pattern). This is the only file in the live module that touches
 * child_process; the supervisor itself stays pure and testable with
 * a fake process.
 */

import { spawn, type ChildProcess } from 'node:child_process'

import type { RelayInput, RelayProcessHandle, RelaySpawner } from './relay'

export const createFfmpegRelaySpawner = (ffmpegPath?: string): RelaySpawner => {
  const binary = ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg'
  return (args: string[], input: RelayInput): RelayProcessHandle => {
    const child: ChildProcess = spawn(binary, args, {
      stdio: [input.kind === 'pipe' ? 'pipe' : 'ignore', 'ignore', 'pipe'],
    })
    const spawnCallbacks: Array<() => void> = []
    const exitCallbacks: Array<(code: number | null, signal: string | null) => void> = []
    const stderrCallbacks: Array<(line: string) => void> = []
    let exited = false
    child.on('spawn', () => spawnCallbacks.forEach((cb) => cb()))
    child.on('error', (error) => {
      if (exited) return
      exited = true
      stderrCallbacks.forEach((cb) => cb(`spawn error: ${error.message}`))
      exitCallbacks.forEach((cb) => cb(null, null))
    })
    child.on('exit', (code, signal) => {
      if (exited) return
      exited = true
      exitCallbacks.forEach((cb) => cb(code, signal))
    })
    let stderrBuffer = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8')
      const lines = stderrBuffer.split('\n')
      stderrBuffer = lines.pop() ?? ''
      lines
        .filter((line) => line.trim())
        .forEach((line) => stderrCallbacks.forEach((cb) => cb(line)))
    })
    return {
      pid: child.pid,
      stdin:
        input.kind === 'pipe' && child.stdin
          ? {
              write: (chunk: Uint8Array) => child.stdin!.write(chunk),
              end: () => child.stdin!.end(),
            }
          : null,
      kill: (signal?: string) => {
        try {
          child.kill((signal as NodeJS.Signals) ?? 'SIGTERM')
        } catch {
          // Already gone — an exit event is what matters, and it fired or will.
        }
      },
      onSpawn: (cb) => spawnCallbacks.push(cb),
      onExit: (cb) => exitCallbacks.push(cb),
      onStderr: (cb) => stderrCallbacks.push(cb),
    }
  }
}
