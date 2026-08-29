import type { DomainDefinition } from '../core/payload-domains'
import { operationsTasks } from './tasks'

export const operationsDomain: DomainDefinition = {
  id: 'operations',
  tasks: operationsTasks,
}
