import { CreatorWorkspace } from '@/modules/creator-studio/CreatorWorkspace'

export default async function MemberStudioPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  return <CreatorWorkspace handle={handle} />
}
