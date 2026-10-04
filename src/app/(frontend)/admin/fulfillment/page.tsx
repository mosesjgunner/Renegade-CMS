import UnavailableWorkspace from '@/modules/admin/UnavailableWorkspace'

export default function FulfillmentAdminPage() {
  return (
    <UnavailableWorkspace
      title="POD & Fulfillment"
      reason="Fulfillment command-center actions are unavailable pending persisted mappings, jobs, and provider verification."
    />
  )
}
