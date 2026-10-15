import { NextResponse, type NextRequest } from 'next/server'

import { trustedAdminMutationOrigin } from './modules/operations/request-origin'

export function proxy(request: NextRequest) {
  if (
    !trustedAdminMutationOrigin(request.method, request.headers, process.env.APP_URL ?? request.url)
  ) {
    return NextResponse.json(
      { error: 'Cross-origin authenticated mutation is forbidden.' },
      { status: 403 },
    )
  }
  return NextResponse.next()
}

export const config = { matcher: ['/api/:path*'] }
