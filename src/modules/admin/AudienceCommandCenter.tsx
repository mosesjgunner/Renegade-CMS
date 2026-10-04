import Link from 'next/link'
import { parseEnabledModules } from '../module-registry'

export default function AudienceCommandCenter() {
  return (
    <main className="gutter--left gutter--right">
      <h1>Audience</h1>
      <p role="status">
        Audience reporting is unavailable while delivery evidence and site permissions are being
        validated. No delivery, revenue, or provider health is reported here.
      </p>
      {parseEnabledModules(process.env.RENEGADE_MODULES).has('newsletter') && (
        <p>
          <Link href="/admin/collections/subscribers">Manage newsletter subscribers</Link>
        </p>
      )}
      <p>
        <Link href="/admin/capabilities">Review capabilities and connections</Link>
      </p>
    </main>
  )
}
