import { BuilderShell } from '@/modules/public/BuilderShell'

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  return <BuilderShell layoutId={(await params).id} />
}
