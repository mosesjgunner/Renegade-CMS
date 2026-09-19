import { SimulatedTranslationProviderAdapter } from './adapter'
import { LocalizationEngine } from './engine'

// Singleton instance for server runtime
export const globalLocalizationEngine = new LocalizationEngine()
export const defaultSimulatedProvider = new SimulatedTranslationProviderAdapter()

export function getLocalizationEngine(): LocalizationEngine {
  return globalLocalizationEngine
}
