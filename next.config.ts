import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Release verification may run beside a live standalone process. An explicit
  // alternate directory prevents a build from deleting files owned by that process.
  distDir: process.env.RENEGADE_NEXT_DIST_DIR || '.next',
  output: 'standalone',
  env: { RENEGADE_ARTIFACT_SHA: process.env.RENEGADE_ARTIFACT_SHA ?? '' },
  generateBuildId: async () => process.env.RENEGADE_ARTIFACT_SHA || null,
  // Default Turbopack builds do not use the development-only Webpack watcher rules.
  turbopack: {},
  experimental: { webpackMemoryOptimizations: true },
  async headers() {
    const noindexHeader = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
    return [
      { source: '/login', headers: noindexHeader },
      { source: '/enroll', headers: noindexHeader },
      { source: '/setup', headers: noindexHeader },
      { source: '/guided-setup', headers: noindexHeader },
      { source: '/preview/:path*', headers: noindexHeader },
      { source: '/builder/:path*', headers: noindexHeader },
      { source: '/members/settings', headers: noindexHeader },
      { source: '/member-auth/:path*', headers: noindexHeader },
      { source: '/messages/:path*', headers: noindexHeader },
      { source: '/notifications/:path*', headers: noindexHeader },
      { source: '/preferences/:path*', headers: noindexHeader },
      { source: '/pos/:path*', headers: noindexHeader },
      { source: '/admin/:path*', headers: noindexHeader },
    ]
  },
  webpack: (config, { dev }) => {
    if (dev) {
      const ignored = config.watchOptions?.ignored
      config.watchOptions = {
        ...config.watchOptions,
        ignored:
          ignored instanceof RegExp
            ? new RegExp(
                [
                  ignored.source,
                  /[\\/](scratch|test-results|\.next[^\\/]*)[\\/]/.source,
                  /[\\/]docs[\\/]rc[\\/]evidence[\\/]/.source,
                ].join('|'),
              )
            : [
                ...(Array.isArray(ignored) ? ignored : ignored ? [ignored] : []),
                '**/scratch/**',
                '**/test-results/**',
                '**/.next*/**',
                '**/docs/rc/evidence/**',
              ],
      }
    }
    return config
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })

