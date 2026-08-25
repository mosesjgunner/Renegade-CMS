import { expect, it } from 'vitest'
import { PUBLIC_MANIFESTS } from '../../src/modules/extensions/api'
import { localFilesystemAdapter } from '../../src/modules/extensions/reference-adapters'

it('keeps public API manifests and federation/graph/anchor boundaries typed', () => {
  expect(PUBLIC_MANIFESTS[0].audit).toBe('required')
  expect(localFilesystemAdapter.contract.ownership.canonicalData).toBe('renegade')
  expect(localFilesystemAdapter.contract.disconnect.preserveCanonicalData).toBe(true)
})
