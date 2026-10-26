import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { executeDbQuery } from '@/modules/community/comment-composer'
import { loadConfig } from '@/modules/core/config'
import {
  evaluateAudienceHealth,
  projectUnifiedAudienceCalendar,
  type RawCalendarItemInput,
} from '@/modules/audience/command-center-service'
import { AUDIENCE_METRIC_DICTIONARY } from '@/modules/audience/command-center-contracts'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user?.id || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  }
  try {
    const grant = await resolveOperatorGrantContext(payload, user)
    const siteId =
      new URL(request.url).searchParams.get('siteId') ??
      (await publicSiteForHost(payload, request.headers.get('host') ?? new URL(request.url).host))
    if (
      !siteId ||
      !grant.authorized ||
      (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))
    ) {
      return Response.json({ error: 'Staff site access required.' }, { status: 403 })
    }

    const where = { site: { equals: siteId } }
    const registered = (slug: keyof typeof payload.collections) =>
      Boolean(payload.collections[slug])

    const [
      subscribers,
      contacts,
      suppressions,
      messages,
      experiments,
      telecomMsgs,
      telecomDelivs,
      automations,
      recentConsent,
      recentSuppressions,
      formSubmissions,
    ] = await Promise.all([
      registered('subscribers')
        ? payload.count({ collection: 'subscribers', where, overrideAccess: true })
        : null,
      registered('contacts')
        ? payload.count({ collection: 'contacts', where, overrideAccess: true })
        : null,
      registered('suppressions')
        ? payload.count({ collection: 'suppressions', where, overrideAccess: true })
        : null,
      registered('email-messages')
        ? payload.find({
            collection: 'email-messages',
            where,
            depth: 0,
            limit: 50,
            sort: '-createdAt',
            overrideAccess: true,
          })
        : null,
      registered('audience-experiments')
        ? payload.find({
            collection: 'audience-experiments',
            where,
            depth: 0,
            limit: 50,
            sort: '-createdAt',
            overrideAccess: true,
          })
        : null,
      registered('telecom-messages')
        ? payload.find({
            collection: 'telecom-messages',
            where,
            depth: 0,
            limit: 50,
            sort: '-createdAt',
            overrideAccess: true,
          })
        : null,
      registered('telecom-deliveries')
        ? payload.find({
            collection: 'telecom-deliveries',
            where,
            depth: 0,
            limit: 50,
            sort: '-createdAt',
            overrideAccess: true,
          })
        : null,
      registered('automation-definitions')
        ? payload.find({
            collection: 'automation-definitions',
            where,
            depth: 0,
            limit: 50,
            sort: '-createdAt',
            overrideAccess: true,
          })
        : null,
      registered('consent-events')
        ? payload.find({
            collection: 'consent-events',
            where,
            depth: 0,
            limit: 20,
            sort: '-occurredAt',
            overrideAccess: true,
          })
        : null,
      registered('suppressions')
        ? payload.find({
            collection: 'suppressions',
            where,
            depth: 0,
            limit: 20,
            sort: '-occurredAt',
            overrideAccess: true,
          })
        : null,
      registered('form-submissions')
        ? payload.find({
            collection: 'form-submissions',
            where,
            depth: 0,
            limit: 50,
            sort: '-submittedAt',
            overrideAccess: true,
          })
        : null,
    ])

    const outcomes = registered('email-deliveries')
      ? await executeDbQuery<{ status: string; count: number }>(
          payload,
          `SELECT d.status, count(*)::int AS count FROM email_deliveries d
       JOIN email_messages m ON m.id=d.message_id WHERE m.site_id=$1 GROUP BY d.status`,
          [siteId],
        )
      : null

    const telecomOutcomes = telecomDelivs
      ? await executeDbQuery<{ status: string; count: number }>(
          payload,
          `SELECT status, count(*)::int AS count FROM telecom_deliveries WHERE site_id=$1 GROUP BY status`,
          [siteId],
        )
      : null
    // Provider configuration checks (real, un-manufactured state)
    const appConfig = loadConfig()
    const isSmtpConfigured = appConfig.email.mode === 'smtp' && Boolean(appConfig.email.host)
    const isDevEmail = appConfig.email.mode === 'development'
    const isTwilioConfigured = Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
    )

    const emailProviderStatus: 'healthy' | 'degraded' | 'disabled' = isSmtpConfigured
      ? 'degraded'
      : isDevEmail
        ? 'degraded'
        : 'disabled'

    const emailProviderName = isSmtpConfigured
      ? `SMTP (${appConfig.email.host})`
      : isDevEmail
        ? 'Local Development Mailer (Capture Sink)'
        : 'No email delivery configured'

    const telecomProviderStatus: 'healthy' | 'degraded' | 'disabled' = isTwilioConfigured
      ? 'degraded'
      : 'disabled'

    const telecomProviderName = isTwilioConfigured
      ? 'Twilio Telecom / Jibe RCS Gateway'
      : 'Local Telecom Emulator (unconfigured for live carrier dispatches)'

    const totalAccepted = outcomes?.find((o) => o.status === 'accepted')?.count ?? 0
    const totalBounced = outcomes?.find((o) => o.status === 'bounced')?.count ?? 0
    const totalComplaints = outcomes?.find((o) => o.status === 'complained')?.count ?? 0

    // Evaluate deliverability health using canonical records
    const deliverabilityHealth = evaluateAudienceHealth({
      siteId,
      emailProviderStatus,
      emailProviderName,
      spfVerified: false,
      dkimVerified: false,
      dmarcVerified: false,
      tlsVerified: false,
      telecomProviderStatus,
      telecomProviderName,
      telecomOutboundAllowed:
        process.env.TELECOM_MODE === 'twilio' &&
        process.env.TELECOM_ALLOW_OUTBOUND === 'true' &&
        isTwilioConfigured,
      totalSentRecently: totalAccepted + totalBounced + totalComplaints,
      hardBouncesRecently: totalBounced,
      complaintsRecently: totalComplaints,
      queueAgeMinutesMax: 0,
      webhookLagSecondsMax: 0,
      staleSegmentCount: 0,
      invalidFormCount: 0,
      failingAutomationsCount: 0,
    })

    // Project unified calendar from canonical email and telecom messages
    const calendarInputs: RawCalendarItemInput[] = [
      ...(messages?.docs.map((m: any) => ({
        id: String(m.id),
        siteId,
        title: String(m.subject || 'Untitled Campaign'),
        channel: 'email' as const,
        itemType: 'campaign' as const,
        status: (m.status === 'sent'
          ? 'completed'
          : ['draft', 'review', 'scheduled', 'completed', 'cancelled'].includes(m.status)
            ? m.status
            : 'draft') as any,
        scheduledFor: m.scheduledFor ?? null,
        completedAt: m.status === 'sent' ? m.updatedAt : null,
        timeZone: 'UTC',
        targetAudienceLabel: 'Active Subscribers',
        estimatedRecipients: Number(m.estimatedRecipients ?? 0),
        targetSegmentId: typeof m.segment === 'object' ? m.segment?.id : m.segment,
        releaseReferenceId: typeof m.release === 'object' ? m.release?.id : m.release,
      })) ?? []),
      ...(telecomMsgs?.docs.map((m: any) => ({
        id: String(m.id),
        siteId,
        title: String(m.title || 'Untitled Telecom Dispatch'),
        channel: (m.channel === 'rcs' ? 'rcs' : 'sms') as 'sms' | 'rcs',
        itemType: 'campaign' as const,
        status: (m.status === 'sent'
          ? 'completed'
          : ['draft', 'scheduled', 'completed', 'cancelled'].includes(m.status)
            ? m.status
            : 'draft') as any,
        scheduledFor: m.scheduledFor ?? null,
        completedAt: m.status === 'sent' ? m.updatedAt : null,
        timeZone: 'UTC',
        targetAudienceLabel: 'Mobile Subscribers',
        estimatedRecipients: 0,
      })) ?? []),
    ]

    const recentCampaigns = projectUnifiedAudienceCalendar(calendarInputs)

    // Form submissions summary
    const formCounts = formSubmissions
      ? await Promise.all(
          ['received', 'held', 'triaged'].map((status) =>
            payload.count({
              collection: 'form-submissions',
              where: { and: [where, { status: { equals: status } }] },
              overrideAccess: true,
            }),
          ),
        )
      : []
    const formsSummary = {
      total: formSubmissions?.totalDocs ?? 0,
      received: formCounts[0]?.totalDocs ?? 0,
      held: formCounts[1]?.totalDocs ?? 0,
      triaged: formCounts[2]?.totalDocs ?? 0,
    }

    const notificationCounts = registered('notifications')
      ? (
          await executeDbQuery<{
            inApp: number
            activityRecords: number
            queuedExternal: number
            failedExternal: number
          }>(
            payload,
            `SELECT (SELECT count(*)::int FROM inbox_notifications WHERE site_id=$1 AND channels ? 'in_app') AS "inApp",
           (SELECT count(*)::int FROM notifications n JOIN activity_events a ON a.id=n.activity_event_id WHERE a.site_id=$1) AS "activityRecords",
           (SELECT count(*)::int FROM audience_delivery_outbox WHERE site_id=$1 AND envelope->>'kind'='community-notification' AND status='pending') AS "queuedExternal",
           (SELECT count(*)::int FROM audience_delivery_outbox WHERE site_id=$1 AND envelope->>'kind'='community-notification' AND status IN ('failed','unknown')) AS "failedExternal"`,
            [siteId],
          )
        )[0]
      : null

    return Response.json(
      {
        siteId,
        subscribers: subscribers?.totalDocs ?? 0,
        contacts: contacts?.totalDocs ?? 0,
        suppressions: suppressions?.totalDocs ?? 0,
        deliverabilityHealth,
        reportingLimits:
          'Lifetime canonical status counts. Provider configuration does not verify DNS, TLS or carrier readiness. Queue age, webhook lag, segment freshness and validation health are not measured by this view.',
        recentCampaigns,
        notifications: notificationCounts,
        automationExecution:
          'General automation execution unavailable; supported intake actions use the form worker.',
        metricsDictionary: AUDIENCE_METRIC_DICTIONARY,
        emailOutcomes: outcomes ?? [],
        telecomOutcomes: telecomOutcomes ?? [],
        messages:
          messages?.docs.map((message) => ({
            id: message.id,
            subject: message.subject,
            status: message.status,
            scheduledFor: message.scheduledFor,
            recipientSnapshot: message.recipientSnapshot,
            reviewedAt: message.reviewedAt,
          })) ?? [],
        telecomMessages:
          telecomMsgs?.docs.map((message) => ({
            id: message.id,
            title: message.title,
            channel: message.channel,
            status: message.status,
            scheduledFor: message.scheduledFor,
          })) ?? [],
        automations:
          automations?.docs.map((def) => ({
            id: def.id,
            name: def.name,
            status: def.status,
            version: def.version,
          })) ?? [],
        experiments:
          experiments?.docs.map((experiment) => ({
            id: experiment.id,
            title: experiment.title,
            status: experiment.status,
          })) ?? [],
        suppressionLedger:
          recentSuppressions?.docs.map((s: any) => ({
            id: s.id,
            emailHash: s.emailHash,
            reason: s.reason,
            occurredAt: s.occurredAt,
            source: s.source,
          })) ?? [],
        recentConsentEvents:
          recentConsent?.docs.map((c: any) => ({
            id: c.id,
            event: c.event,
            basis: c.basis,
            channel: c.channel,
            purpose: c.purpose,
            occurredAt: c.occurredAt,
            wording: c.wording,
          })) ?? [],
        forms: formsSummary,
        source:
          'Persisted site records; email and telecom outcomes are transport/provider observations, not inbox delivery, opens or conversions.',
      },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error) {
    if (payload?.logger?.error) {
      payload.logger.error({ err: error, event: 'audience.command_center.error' })
    } else {
      console.error('Failed to load audience command center data:', error)
    }
    return Response.json(
      { error: 'Saved audience reporting could not be loaded.' },
      { status: 503 },
    )
  }
}
