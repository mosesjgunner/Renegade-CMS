import { PortfolioWorkspace } from '@/modules/creator-studio/PortfolioWorkspace'

export const metadata = {
  title: 'Portfolios and projects',
  robots: { index: false, follow: false },
}

export default async function PortfolioStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>
}) {
  const { template } = await searchParams
  return <PortfolioWorkspace key={template ?? ''} template={template} />
}
