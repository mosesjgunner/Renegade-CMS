/* Generated-style Payload routing edge. Keep aligned with the installed Payload version. */
import config from '@payload-config'
import '@payloadcms/next/css'
import { metadata, RootLayout } from '@payloadcms/next/layouts'
import type { ReactNode } from 'react'

import { importMap } from './admin/importMap.js'
import { serverFunction } from './actions'

export { metadata }

export default function PayloadLayout({ children }: { children: ReactNode }) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  )
}
