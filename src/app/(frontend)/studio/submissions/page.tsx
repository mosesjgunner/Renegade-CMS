import { SubmissionWorkspace } from '@/modules/creator-studio/SubmissionWorkspace'

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string | string[]; destination?: string | string[] }>
}) {
  const { target, destination } = await searchParams
  return (
    <SubmissionWorkspace
      key={typeof target === 'string' ? target : `upload:${String(destination ?? '')}`}
      publicTarget={typeof target === 'string' ? target : undefined}
      destination={typeof destination === 'string' ? destination : undefined}
    />
  )
}
