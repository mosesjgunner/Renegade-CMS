import { PortfolioWorkspace } from '@/modules/creator-studio/PortfolioWorkspace'

export const metadata = { title: 'Portfolios and projects', robots: { index: false, follow: false } }

export default function PortfolioStudioPage() {
  return <PortfolioWorkspace />
}
