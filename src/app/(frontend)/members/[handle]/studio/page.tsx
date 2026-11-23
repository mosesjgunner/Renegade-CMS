import { StudioNavigation } from '@/modules/creator-studio/StudioNavigation'
import { CreatorWorkspace } from '@/modules/creator-studio/CreatorWorkspace'

export default async function MemberStudioPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  return (
    <>
      <StudioNavigation />
      <CreatorWorkspace handle={handle} />
    </>
  )
}
