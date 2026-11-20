import ReleaseCenter from '@/modules/admin/ReleaseCenter'
import TaskReadinessPanel from '@/modules/admin/TaskReadinessPanel'

export default function ReleasesAdminPage() {
  return (
    <>
      <div className="max-w-5xl mx-auto px-4 pt-8">
        <TaskReadinessPanel />
      </div>
      <ReleaseCenter />
    </>
  )
}
