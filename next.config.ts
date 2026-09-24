import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Release verification may run beside a live standalone process. An explicit
  // alternate directory prevents a build from deleting files owned by that process.
  distDir: process.env.RENEGADE_NEXT_DIST_DIR || '.next',
  output: 'standalone',
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
