import { describe, expect, it } from 'vitest'

import {
  hasInstallerManagedConfig,
  hasUnsafeProductionConfig,
  ProductionInstallError,
  renderProductionConfig,
  validateProductionInstallInput,
} from '../../src/modules/operations/production-installer'

const input = {
  appUrl: 'https://cms.example.test',
  proxyMode: 'trusted',
  trustedProxyHops: '1',
  profile: 'Lean',
  webBind: '127.0.0.1:3000',
  ownerEmail: 'owner@example.test',
}
const secrets = { postgresPassword: 'p'.repeat(48), payloadSecret: 's'.repeat(64) }

describe('production installer decisions', () => {
  it('accepts supported profile and private bind preflight input', () => {
    expect(() => validateProductionInstallInput(input)).not.toThrow()
  })
  it('refuses malformed or unsafe production settings before Docker starts', () => {
    expect(() =>
      validateProductionInstallInput({
        ...input,
        appUrl: 'http://localhost:3000',
        webBind: '0.0.0.0:3000',
      }),
    ).toThrow(ProductionInstallError)
  })
  it('generates a complete managed configuration without substituting secrets', () => {
    const config = renderProductionConfig(input, secrets)
    expect(config).toContain('DEPLOYMENT_PROFILE=Lean')
    expect(config).toContain('ENABLE_TEST_ROUTES=false')
    expect(hasInstallerManagedConfig(config)).toBe(true)
    expect(hasUnsafeProductionConfig(config)).toBe(false)
  })
  it('detects an existing installer-managed configuration for a restart without treating it as new', () => {
    expect(hasInstallerManagedConfig(renderProductionConfig(input, secrets))).toBe(true)
    expect(hasInstallerManagedConfig('APP_URL=https://cms.example.test\n')).toBe(false)
  })
  it('refuses placeholder secrets and test-route production configurations', () => {
    expect(
      hasUnsafeProductionConfig('POSTGRES_PASSWORD=replace-me\nPAYLOAD_SECRET=valid-secret\n'),
    ).toBe(true)
    expect(
      hasUnsafeProductionConfig(
        'POSTGRES_PASSWORD=valid\nPAYLOAD_SECRET=valid\nENABLE_TEST_ROUTES=true\n',
      ),
    ).toBe(true)
    expect(hasUnsafeProductionConfig('POSTGRES_PASSWORD=short\nPAYLOAD_SECRET=short\n')).toBe(true)
  })
})
