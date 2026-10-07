import type { Access, CollectionBeforeChangeHook, Where } from 'payload'
import { APIError } from 'payload'
import { publicSiteForHost } from '../public/site-scope'
import { validateIntakeActions } from './form-runtime'

const relationId = (value: unknown) =>
  typeof value === 'object' && value
    ? String((value as { id?: unknown }).id ?? '')
    : String(value ?? '')
import { resolveOperatorGrantContext } from '../operations/operator-grants'

const staff = (role: unknown) => ['owner', 'administrator', 'staff'].includes(String(role))
export const formAccess =
  (schema = false): Access =>
  async ({ req }) => {
    if (!staff(req.user?.role)) return false
    const siteId = await publicSiteForHost(req.payload, req.headers.get('host'))
    if (!siteId) return false
    const grant = await resolveOperatorGrantContext(req.payload, req.user)
    if (!grant.authorized || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))) {
      return false
    }
    if (!schema) return { site: { equals: siteId } } as Where
    const forms = await req.payload.find({
      collection: 'form-definitions' as never,
      where: { site: { equals: siteId } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    } as never)
    return { form: { in: forms.docs.map((form) => String(form.id)) } } as Where
  }

export const guardFormWrite =
  (kind: 'definition' | 'schema' | 'submission'): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req }) => {
    const next = { ...originalDoc, ...data }
    let siteId = relationId(next.site)
    if (kind !== 'definition') {
      const form = await req.payload.findByID({
        collection: 'form-definitions' as never,
        id: relationId(next.form),
        depth: 0,
        overrideAccess: true,
      } as never)
      const formSite = relationId((form as unknown as Record<string, unknown>).site)
      if (kind === 'submission' && formSite !== siteId)
        throw new APIError('Form site mismatch.', 403)
      siteId = formSite
    }
    if (req.user) {
      const hostSiteId = await publicSiteForHost(req.payload, req.headers.get('host'))
      const grant = await resolveOperatorGrantContext(req.payload, req.user)
      const hasSiteGrant = grant.authorized && (grant.isGlobalOwner || grant.authorizedSiteIds.includes(siteId))
      if (
        !staff(req.user.role) ||
        !hasSiteGrant ||
        !hostSiteId ||
        hostSiteId !== siteId ||
        (originalDoc?.site && relationId(originalDoc.site) !== siteId)
      )
        throw new APIError('Form site access denied.', 403)
      if (kind === 'definition') {
        if (
          typeof next.publicPath !== 'string' ||
          !/^\/forms\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.publicPath)
        )
          throw new APIError('Use a public path such as /forms/contact-us.', 422)
        const valid = validateIntakeActions(next.actions ?? [])
        if (valid !== true) throw new APIError(valid, 422)
      }
      if (kind === 'submission' && originalDoc) {
        if (
          data?.status === 'triaged' &&
          Array.isArray(originalDoc.actionState) &&
          originalDoc.actionState.some((state: { status?: string }) => state.status !== 'completed')
        )
          throw new APIError('Intake execution is incomplete; status cannot claim triaged.', 409)
        const allowed = [
          'status',
          'reviewNotes',
          'retentionMode',
          'retentionHold',
          'retentionExpiresAt',
          'removeFromDiscovery',
        ]
        if (Object.keys(data ?? {}).some((key) => !allowed.includes(key)))
          throw new APIError('Submission answers and execution evidence are read-only.', 403)
      }
    }
    if (
      kind === 'schema' &&
      originalDoc?.state === 'published' &&
      Object.keys(data ?? {}).some((key) => key !== 'state')
    )
      throw new APIError(
        'Create a new schema version instead of editing published consent or fields.',
        409,
      )
    if (kind === 'definition' && next.activeSchema) {
      const schema = await req.payload.findByID({
        collection: 'form-schemas' as never,
        id: relationId(next.activeSchema),
        depth: 0,
        overrideAccess: true,
      } as never)
      if (
        relationId((schema as unknown as Record<string, unknown>).form) !== relationId(next.id) ||
        (schema as unknown as Record<string, unknown>).state !== 'published'
      )
        throw new APIError('Active schema must be published and belong to this form.', 422)
    }
    return data
  }
