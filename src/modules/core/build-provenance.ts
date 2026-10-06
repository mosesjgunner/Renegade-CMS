import { readFileSync } from 'node:fs'
import path from 'node:path'

export type BuildProvenance = {
  sourceSha: string
  clean: boolean | null
  version: string
  lockfileSha256: string
}

/** Read artifact metadata, never a caller-supplied runtime BUILD_SHA override. */
export function readBuildProvenance(): BuildProvenance | null {
  try {
    const data = JSON.parse(readFileSync(path.resolve('build-provenance.json'), 'utf8'))
    if (!/^[a-f0-9]{40}$/.test(data.sourceSha) || !/^[a-f0-9]{64}$/.test(data.lockfileSha256))
      return null
    return data as BuildProvenance
  } catch {
    return null
  }
}
