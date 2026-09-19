import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  listWorkflowTemplates,
  saveWorkflowTemplate,
} from '@/modules/editorial/cmos-persistence'
import type { WorkflowTemplate } from '@/modules/editorial/cmos-workflow'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const templates = listWorkflowTemplates()
    return NextResponse.json({ templates })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list workflow templates.' },
      { status: 400 },
    )
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as WorkflowTemplate
    const result = saveWorkflowTemplate(body)
    if (!result.validation.valid) {
      return NextResponse.json(
        {
          error: 'Workflow template validation failed against dead ends or privilege escalation.',
          validationErrors: result.validation.errors,
        },
        { status: 422 },
      )
    }
    return NextResponse.json({ template: result.template })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save workflow template.' },
      { status: 400 },
    )
  }
}
