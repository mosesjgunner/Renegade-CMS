import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { Payload } from 'payload'
import { communitySiteForHost } from '../community/site-scope'
import { currentMember, readMemberSession, verifyCsrf } from '../identity/member-identity'
import { samePublicOrigin } from '../public/site-scope'
import { readBoundedUploadBody } from '../media/upload-staging'
import { MediaWorkflowError } from '../media/workflow'

export const privateHeaders = { 'cache-control': 'private, no-store' }

export async function submissionActor(payload: Payload, request: Request, required = true) {
  const modifying = !['GET', 'HEAD'].includes(request.method)
  if (modifying && !verifyCsrf(request.headers))
    throw new MediaWorkflowError('Invalid CSRF token.', 403)
  const siteId = await communitySiteForHost(payload, request.headers.get('host')).catch(() => {
    throw new MediaWorkflowError('Site unavailable.', 404)
  })
  if (modifying && !(await samePublicOrigin(payload, request, true)))
    throw new MediaWorkflowError('Request origin is not allowed.', 403)
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if ((required || modifying) && !memberId) throw new MediaWorkflowError('Sign in required.', 401)
  return { siteId, memberId: memberId ?? '' }
}

export function submissionError(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof MediaWorkflowError
          ? error.message
          : 'Submission request failed. Please retry.',
    },
    { status: error instanceof MediaWorkflowError ? error.status : 500, headers: privateHeaders },
  )
}

export async function submissionJSON(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readBoundedUploadBody(request, 16 * 1024)
  try {
    const data = JSON.parse(bytes.toString('utf8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) return data
  } catch {
    // Return a bounded public error.
  }
  throw new MediaWorkflowError('Invalid submission request.', 400)
}

export function streamSubmissionFile(
  request: Request,
  file: { filename: string; size: number; mimeType: string },
) {
  const headers = new Headers({
    ...privateHeaders,
    'content-type': file.mimeType,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'same-origin',
    'accept-ranges': 'bytes',
  })
  if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/'))
    headers.set(
      'content-disposition',
      file.mimeType === 'application/pdf'
        ? 'attachment; filename=submission.pdf'
        : 'attachment; filename=submission.txt',
    )
  const range = request.headers.get('range')
  let start = 0
  let end = file.size - 1
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match && match[1]) {
      start = Number(match[1])
      if (match[2]) end = Math.min(end, Number(match[2]))
    } else if (match && match[2]) start = Math.max(0, file.size - Number(match[2]))
    if (
      !match ||
      (!match[1] && !match[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end
    ) {
      headers.set('content-range', `bytes */${file.size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set('content-range', `bytes ${start}-${end}/${file.size}`)
  }
  headers.set('content-length', String(end - start + 1))
  const body =
    request.method === 'HEAD'
      ? null
      : (Readable.toWeb(
          createReadStream(file.filename, { start, end }),
        ) as ReadableStream<Uint8Array>)
  return new Response(body, { status: range ? 206 : 200, headers })
}
