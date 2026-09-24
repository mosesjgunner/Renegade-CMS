import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  discoverThemes,
  validatePackage,
  migrateTokens,
} from '../../src/modules/presentation/packages'
import { validateTokens, contrast } from '../../src/modules/presentation/tokens'
const base = {
  id: 'example',
  version: '1.0.0',
  label: 'Example',
  renegade: '^1.0.0',
  renderer: 'neutral-starter',
  tokens: {},
  assets: [],
  migrations: [],
}
describe('PRE-01 package security and design tokens', () => {
  it('discovers installed versions and idempotently migrates presentation tokens', async () => {
    const installed = await discoverThemes()
    expect(installed).toHaveLength(3)
    expect(installed.every((p) => p.compatible && p.digest)).toBe(true)
    const upgraded = installed.find((p) => p.package?.version === '1.1.0')!.package!
    const once = migrateTokens(upgraded, '1.0.0', {})
    expect(migrateTokens(upgraded, '1.1.0', once)).toEqual(once)
    expect(() => migrateTokens(upgraded, '0.5.0', {})).toThrow('migration')
  })
  it.each([
    { ...base, id: '../escape' },
    { ...base, version: 'latest' },
    { ...base, version: 'v1.0.0' },
    { ...base, renegade: '' },
    { ...base, renderer: ['neutral-starter'] },
    { ...base, renderer: '../../evil.js' },
    { ...base, javascript: 'alert(1)' },
    { ...base, css: 'body{}' },
    { ...base, assets: [{ path: 'assets/../evil.png', sha256: 'a'.repeat(64) }] },
    {
      ...base,
      migrations: [{ from: '1.0.0', to: '2.0.0', operation: 'rewriteArticle', tokens: {} }],
    },
  ])('rejects malicious or malformed configuration %#', (input) =>
    expect(() => validatePackage(input)).toThrow(),
  )
  it('rejects the checked-in malicious fixtures before discovery can offer activation', async () => {
    const fixtures = JSON.parse(
      await readFile(new URL('../fixtures/themes/malicious.json', import.meta.url), 'utf8'),
    )
    const root = await mkdtemp(path.join(tmpdir(), 'pre01-fixtures-'))
    try {
      for (const [index, fixture] of fixtures.entries()) {
        const directory = path.join(root, `fixture-${index}`)
        await mkdir(directory)
        await writeFile(path.join(directory, 'theme.json'), JSON.stringify({ ...base, ...fixture }))
      }
      const discovered = await discoverThemes(root)
      expect(discovered).toHaveLength(fixtures.length)
      expect(discovered.every((item) => !item.compatible && item.error && !item.package)).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it('retains incompatible packages for inspection while refusing compatibility', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pre01-incompatible-'))
    try {
      await mkdir(path.join(root, 'future'))
      await writeFile(
        path.join(root, 'future', 'theme.json'),
        JSON.stringify({ ...base, renegade: '^99.0.0' }),
      )
      const [item] = await discoverThemes(root)
      expect(item.package?.id).toBe('example')
      expect(item.compatible).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it('rejects injection, unknown tokens, and insufficient contrast', () => {
    for (const value of [
      { 'color.ink': '#ffffff' },
      { 'typography.body': 'url(https://evil)' },
      { 'spacing.normal': '1px; color:red' },
      { body: '<script>' },
    ])
      expect(() => validateTokens(value)).toThrow()
    expect(contrast('#000000', '#ffffff')).toBe(21)
  })
  it('rejects symlinks, undeclared files, bad asset hashes and duplicate identities', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pre01-'))
    try {
      for (const name of ['one', 'two', 'injection', 'badasset', 'link']) {
        await mkdir(path.join(root, name))
        await writeFile(path.join(root, name, 'theme.json'), JSON.stringify(base))
      }
      await writeFile(path.join(root, 'injection', 'evil.js'), 'throw 1')
      await mkdir(path.join(root, 'badasset', 'assets'))
      await writeFile(path.join(root, 'badasset', 'assets', 'image.png'), 'not the expected bytes')
      await writeFile(
        path.join(root, 'badasset', 'theme.json'),
        JSON.stringify({ ...base, assets: [{ path: 'assets/image.png', sha256: '0'.repeat(64) }] }),
      )
      await symlink(path.join(root, 'one'), path.join(root, 'link', 'secret'), 'junction')
      const found = await discoverThemes(root)
      expect(found.every((p) => !p.compatible && p.error)).toBe(true)
      expect(found.find((p) => p.directory === 'one')?.error).toMatch('Duplicate')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
