import type { Payload } from 'payload'
import { createHash } from 'node:crypto'
import { withExecutionLock } from '../operations/execution-lock'
import {
  audienceDigest,
  normalizeEmailAddress,
  validateFormSchema,
  assertReviewedLocalizedConsent,
  type FormSchemaSnapshot,
} from './contracts'

type Doc = Record<string, unknown>
const id = (value: unknown) =>
  typeof value === 'object' && value ? String((value as Doc).id ?? '') : String(value ?? '')
export const supportedIntakeActions = ['create-contact', 'create-task'] as const

export function validateIntakeActions(value: unknown): string | true {
  if (!Array.isArray(value) || value.length > 20) return 'Use at most 20 intake actions.'
  if (value.some((action) => !action || !supportedIntakeActions.includes(action.type)))
    return 'Supported intake actions are create-contact and create-task. Other automations are unavailable.'
  return true
}

/** Load the saved active schema; caller-selected schemas and site IDs are never trusted. */
export async function loadPublicForm(payload: Payload, formId: string, siteId: string) {
  if (!payload.collections['form-definitions']) return null
  const found = await payload.find({
    collection: 'form-definitions' as never,
    where: {
      and: [
        { id: { equals: formId } },
        { site: { equals: siteId } },
        { visibility: { equals: 'public' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const form = found.docs[0] as unknown as Doc | undefined
  if (
    !form ||
    !id(form.activeSchema) ||
    ['manual-burn', 'tombstone', 'archive'].includes(String(form.retentionMode))
  )
    return null
  if (
    form.retentionMode === 'expire-at' &&
    (!form.retentionExpiresAt || Date.parse(String(form.retentionExpiresAt)) <= Date.now())
  )
    return null
  const schema = (await payload.findByID({
    collection: 'form-schemas' as never,
    id: id(form.activeSchema),
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  if (id(schema.form) !== id(form.id) || schema.state !== 'published') return null
  const snapshot = {
    ...(schema.schema as Doc),
    id: schema.id,
    version: schema.version,
    locale: schema.locale,
    consentText: schema.consentText,
    consentRevision: schema.consentRevision,
    consentTranslationStatus: schema.consentTranslationStatus,
  } as FormSchemaSnapshot & { id: unknown }
  if (validateIntakeActions(form.actions ?? []) !== true) return null
  try {
    if (!Array.isArray(snapshot.fields) || validateFormSchema(snapshot).length) return null
    assertReviewedLocalizedConsent(snapshot)
  } catch {
    return null
  }
  return { form, schema, snapshot }
}

type ActionState = {
  index: number
  type: string
  action: Doc
  status: string
  attempts: number
  resultId?: string
  error?: string
}
const actionId = (submissionId: string, index: number) => {
  const hash = createHash('sha256').update(`form-task:${submissionId}:${index}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

/** Existing actionState is the durable execution journal. A restart resumes incomplete steps.
 * Stable task IDs and contact locks reconcile a crash between side effect and journal persistence.
 */
export async function executeIntakeActions(
  payload: Payload,
  input: { submission: Doc; form: Doc; schema: Doc },
) {
  const submissionId = id(input.submission.id)
  return withExecutionLock(payload, `form-actions:${submissionId}`, async () => {
    const submission = (await payload.findByID({
      collection: 'form-submissions' as never,
      id: submissionId,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as Doc
    const siteId = id(submission.site)
    if (siteId !== id(input.form.site) || id(submission.form) !== id(input.form.id))
      throw new Error('Form action site/association mismatch.')
    const saved = Array.isArray(submission.actionState)
      ? (submission.actionState as ActionState[])
      : []
    const states: ActionState[] = saved.length
      ? saved.map((state) => ({
          ...state,
          attempts: Number.isFinite(state.attempts) ? state.attempts : 5,
        }))
      : (Array.isArray(input.form.actions) ? (input.form.actions as Doc[]) : []).map(
          (action, index) => ({
            index,
            action,
            type: String(action.type),
            status: 'pending',
            attempts: 0,
          }),
        )
    const persist = () =>
      payload.update({
        collection: 'form-submissions' as never,
        id: submissionId,
        data: { actionState: states } as never,
        overrideAccess: true,
      })
    await persist()
    for (const state of states) {
      if (state.status === 'completed' || state.attempts >= 5) continue
      state.attempts += 1
      try {
        const values = submission.values as Doc
        if (state.type === 'create-contact') {
          const email = normalizeEmailAddress(
            String(values[String(state.action.emailField ?? 'email')] ?? ''),
          )
          const hash = audienceDigest(email)
          state.resultId = await withExecutionLock(
            payload,
            `form-contact:${siteId}:${hash}`,
            async () => {
              const found = await payload.find({
                collection: 'contacts' as never,
                where: { and: [{ site: { equals: siteId } }, { emailHash: { equals: hash } }] },
                limit: 1,
                depth: 0,
                overrideAccess: true,
              } as never)
              const contact =
                found.docs[0] ??
                (await payload.create({
                  collection: 'contacts' as never,
                  data: {
                    site: siteId,
                    email,
                    emailHash: hash,
                    displayName: String(
                      values[String(state.action.nameField ?? 'name')] ?? email,
                    ).slice(0, 240),
                    status: 'lead',
                  } as never,
                  overrideAccess: true,
                }))
              return id(contact.id)
            },
          )
        } else if (state.type === 'create-task') {
          const taskId = actionId(submissionId, state.index)
          const found = await payload.find({
            collection: 'workflow-items' as never,
            where: { id: { equals: taskId } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          } as never)
          const task =
            found.docs[0] ??
            (await payload.create({
              collection: 'workflow-items' as never,
              data: {
                id: taskId,
                site: siteId,
                title: String(state.action.title ?? input.form.name).slice(0, 240),
                type: 'form-intake',
                status: 'open',
                priority: 'normal',
                sourceReferences: [{ collection: 'form-submissions', id: submissionId }],
              } as never,
              overrideAccess: true,
            }))
          if (id((task as unknown as Doc).site) !== siteId) throw new Error('Task site mismatch.')
          state.resultId = id(task.id)
        } else throw new Error('This action has no supported intake executor.')
        state.status = 'completed'
        delete state.error
      } catch {
        state.status = 'failed'
        state.error =
          'Intake action failed; review configuration and retry. No completion is claimed.'
      }
      await persist()
    }
    await payload.update({
      collection: 'form-submissions' as never,
      id: submissionId,
      data: {
        status: states.every((state) => state.status === 'completed')
          ? 'triaged'
          : states.some((state) => state.attempts >= 5)
            ? 'held'
            : 'received',
      } as never,
      overrideAccess: true,
    })
    return states
  })
}
