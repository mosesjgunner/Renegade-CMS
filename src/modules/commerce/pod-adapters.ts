/* eslint-disable @typescript-eslint/no-explicit-any -- canonical Payload JSON snapshots */
import { PrintfulPodAdapter } from './pod-real-provider'
import { PrintifyPodAdapter } from './pod-printify'
import { PodEmulatorAdapter } from './pod-emulator'
import { PodSimulatorAdapter } from './pod-simulator'
import { decryptCredential } from './pod-connection'
import { PodProviderError, type PodProviderAdapter } from './pod-contract'

export function adapterForPodConnection(
  connection: any,
  purpose: 'catalog' | 'orders' = 'catalog',
): PodProviderAdapter {
  if (connection.status === 'disabled')
    throw new PodProviderError('configuration', 'Provider connection is disabled.', false, true)
  if (process.env.RENEGADE_POD_SIMULATOR_URL)
    return new PodSimulatorAdapter(
      process.env.RENEGADE_POD_SIMULATOR_URL,
      connection.providerKey,
      String(connection.id),
    )
  if (connection.providerKey === 'pod-emulator') {
    if (purpose === 'orders')
      throw new PodProviderError(
        'configuration',
        'Configure a durable local POD simulator before submitting emulator orders.',
        false,
        true,
      )
    return new PodEmulatorAdapter()
  }
  if (!connection.encryptedApiKey)
    throw new PodProviderError(
      'configuration',
      'The selected POD provider is not configured.',
      false,
      true,
    )
  const apiKey = decryptCredential(connection.encryptedApiKey)
  if (connection.providerKey === 'printful')
    return new PrintfulPodAdapter({ apiKey, storeId: connection.remoteStoreId })
  if (connection.providerKey === 'printify')
    return new PrintifyPodAdapter({ apiKey, shopId: connection.remoteStoreId })
  throw new PodProviderError(
    'configuration',
    'The selected POD provider is not supported.',
    false,
    true,
  )
}
