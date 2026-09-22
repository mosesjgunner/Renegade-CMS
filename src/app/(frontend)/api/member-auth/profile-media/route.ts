import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { communitySiteForHost } from '@/modules/community/site-scope'
import { ProfileAccessError } from '@/modules/community/profile-projection'
import { uploadMemberProfileImage } from '@/modules/community/profile-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  try {
    const siteId = await communitySiteForHost(payload, request.headers.get('host'))
    const form = await request.formData()
    const field = form.get('field')
    const file = form.get('file')
    if ((field !== 'avatar' && field !== 'cover') || !(file instanceof File))
      throw new ProfileAccessError(400, 'Choose an avatar or header image file.')
    const coordinate = (name: string) => {
      const value = form.get(name)
      return value === null || value === '' ? undefined : Number(value)
    }
    const x = coordinate('focalX')
    const y = coordinate('focalY')
    const image = await uploadMemberProfileImage(payload, memberId, siteId, {
      field,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      altText: String(form.get('altText') ?? ''),
      focalPoint: x === undefined || y === undefined ? undefined : { x, y },
    })
    return Response.json(
      { image },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Profile image upload failed.' },
      { status: error instanceof ProfileAccessError ? error.status : 400 },
    )
  }
}
