import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

// Launch TypeScript CLIs through Node so Windows never needs to execute a .cmd
// wrapper or interpolate operator-supplied paths through a shell.
export function runOperationalScript(script: string, args: string[]) {
  return runOperationalProcess(process.execPath, ['--import', 'tsx', script, ...args])
}

// A successful child exit alone does not prove that its archive reached disk.
export async function runOperationalProcess(
  command: string,
  args: string[],
  files: { inputFile?: string; outputFile?: string } = {},
) {
  const child = spawn(command, args, {
    stdio: [files.inputFile ? 'pipe' : 'inherit', files.outputFile ? 'pipe' : 'inherit', 'inherit'],
  })
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)),
    )
  })
  const transfers: Promise<void>[] = []
  if (files.inputFile)
    transfers.push(
      pipeline(createReadStream(files.inputFile), child.stdin!).catch(
        async (error: NodeJS.ErrnoException) => {
          // Catalogue readers such as pg_restore -l may finish before EOF. Only
          // tolerate their early input closure when the command itself succeeds.
          if (!['EPIPE', 'EOF', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code ?? ''))
            throw error
          await exited
        },
      ),
    )
  if (files.outputFile) transfers.push(pipeline(child.stdout!, createWriteStream(files.outputFile)))
  try {
    await Promise.all([exited, ...transfers])
  } catch (error) {
    // A failed disk/read stream must not leave pg_dump/pg_restore running.
    child.kill()
    child.stdin?.destroy()
    child.stdout?.destroy()
    await Promise.allSettled([exited, ...transfers])
    throw error
  }
}
