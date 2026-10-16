import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runOperationalProcess } from '../../src/scripts/operational-process'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'renegade-archive-io-'))
  roots.push(root)
  return root
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('operational archive process IO', () => {
  it('awaits the complete binary archive on disk before returning', async () => {
    const root = await fixture()
    const inputFile = path.join(root, 'input.dump')
    const outputFile = path.join(root, 'output.dump')
    const archive = Buffer.alloc(4 * 1024 * 1024 + 37, 0xa7)
    await writeFile(inputFile, archive)
    await runOperationalProcess(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      inputFile,
      outputFile,
    })
    expect((await readFile(outputFile)).equals(archive)).toBe(true)
  })

  it('rejects a missing input file and terminates the reader', async () => {
    const root = await fixture()
    await expect(
      runOperationalProcess(process.execPath, ['-e', 'process.stdin.resume()'], {
        inputFile: path.join(root, 'missing.dump'),
      }),
    ).rejects.toThrow()
  })

  it.each([0, 7])(
    'preserves exit %s when an archive catalogue reader closes input early',
    async (code) => {
      const root = await fixture()
      const inputFile = path.join(root, 'large.dump')
      await writeFile(inputFile, Buffer.alloc(16 * 1024 * 1024, 42))
      const result = runOperationalProcess(
        process.execPath,
        ['-e', `process.stdin.once('data', () => process.exit(${code}))`],
        { inputFile },
      )
      if (code === 0) await expect(result).resolves.toBeUndefined()
      else await expect(result).rejects.toThrow('failed (7)')
    },
  )

  it('rejects an unwritable output and terminates the producer', async () => {
    const root = await fixture()
    await expect(
      runOperationalProcess(
        process.execPath,
        ['-e', 'setInterval(() => process.stdout.write(Buffer.alloc(65536)), 1)'],
        {
          outputFile: root,
        },
      ),
    ).rejects.toThrow()
  })

  it('rejects child failure even after archive bytes were written', async () => {
    const root = await fixture()
    await expect(
      runOperationalProcess(
        process.execPath,
        ['-e', 'process.stdout.write("partial"); process.exitCode = 7'],
        {
          outputFile: path.join(root, 'partial.dump'),
        },
      ),
    ).rejects.toThrow('failed (7)')
  })

  it('rejects a missing executable without leaving a pending transfer', async () => {
    const root = await fixture()
    await expect(
      runOperationalProcess(path.join(root, 'missing-executable'), [], {
        outputFile: path.join(root, 'empty.dump'),
      }),
    ).rejects.toThrow()
  })
})
