import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { getWorkflowAuditHistory } from '@/modules/editorial/cmos-persistence'
import { checkOperatorRecordAccess } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const articleId = url.searchParams.get('articleId')

  if (!articleId) {
    return NextResponse.json({ error: 'articleId query parameter is required.' }, { status: 400 })
  }

  if (!(await checkOperatorRecordAccess(payload, auth.user, 'content', articleId))) {
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
  }

  try {
    const auditTrail = await getWorkflowAuditHistory(payload, articleId)
    return NextResponse.json({ articleId, auditTrail })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to retrieve workflow audit history.',
      },
      { status: 400 },
    )
  }
}
