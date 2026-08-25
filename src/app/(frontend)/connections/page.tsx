import { ConnectionsCenter } from '@/modules/extensions/ConnectionsCenter'

export default function ConnectionsPage() {
  return <ConnectionsCenter connections={[]} groupFor={() => 'Security'} />
}
