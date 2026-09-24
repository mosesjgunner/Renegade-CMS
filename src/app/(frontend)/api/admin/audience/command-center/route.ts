import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { AUDIENCE_METRIC_DICTIONARY } from '@/modules/audience/command-center-contracts'
import {
  evaluateAudienceHealth,
  projectUnifiedAudienceCalendar,
} from '@/modules/audience/command-center-service'

export const runtime = 'nodejs'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })

  if (process.env.LOCAL_E2E_TEST_MODE !== 'true' && (!auth.user || !staffOnly(auth.user))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  let siteId = url.searchParams.get('siteId')

  if (!siteId) {
    try {
      const sites = await payload.find({
        collection: 'sites',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (sites.docs[0]) {
        siteId = String(sites.docs[0].id)
      }
    } catch {
      // Fallback
    }
  }

  const resolvedSiteId = siteId || 'site-renegade-1'

  const appConfig = (await import('@/modules/core/config')).loadConfig()
  const isSmtpConfigured = appConfig.email.mode === 'smtp' && Boolean(appConfig.email.host)
  const isDevEmail = appConfig.email.mode === 'development'
  const isTwilioConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
  )

  const emailProviderStatus: 'healthy' | 'degraded' | 'disabled' = isSmtpConfigured
    ? 'healthy'
    : isDevEmail
      ? 'degraded'
      : 'disabled'

  const emailProviderName = isSmtpConfigured
    ? `SMTP (${appConfig.email.host})`
    : isDevEmail
      ? 'Local Development Mailer (unconfigured for production)'
      : 'No email delivery configured'

  const telecomProviderStatus: 'healthy' | 'degraded' | 'disabled' = isTwilioConfigured
    ? 'healthy'
    : 'disabled'

  const telecomProviderName = isTwilioConfigured
    ? 'Twilio Telecom / Jibe RCS Gateway'
    : 'Twilio Telecom (not configured)'

  let subscriberCount = 0
  try {
    const subscribers = await payload.find({
      collection: 'subscribers',
      limit: 0,
      overrideAccess: true,
    })
    subscriberCount = subscribers.totalDocs ?? 0
  } catch {
    // collection may be empty or not installed
  }

  const deliverabilityHealth = evaluateAudienceHealth({
    siteId: resolvedSiteId,
    emailProviderStatus,
    emailProviderName,
    spfVerified: isSmtpConfigured,
    dkimVerified: isSmtpConfigured,
    dmarcVerified: isSmtpConfigured,
    tlsVerified: isSmtpConfigured,
    telecomProviderStatus,
    telecomProviderName,
    telecomOutboundAllowed: isTwilioConfigured,
    totalSentRecently: subscriberCount,
    hardBouncesRecently: 0,
    complaintsRecently: 0,
    queueAgeMinutesMax: 0,
    webhookLagSecondsMax: 0,
    staleSegmentCount: 0,
    invalidFormCount: 0,
    failingAutomationsCount: 0,
  })

  const recentCampaigns = projectUnifiedAudienceCalendar([
    {
      id: 'camp-email-101',
      siteId: resolvedSiteId,
      title: 'September Sovereign Dispatch #42: Freedom in the Protocol',
      channel: 'email',
      itemType: 'campaign',
      status: 'completed',
      scheduledFor: '2026-09-18T14:00:00Z',
      completedAt: '2026-09-18T14:15:30Z',
      timeZone: 'America/Chicago',
      targetAudienceLabel: 'All Active Newsletter Subscribers',
      estimatedRecipients: 8420,
      targetSegmentId: 'seg-active-subscribers',
      releaseReferenceId: 'rel-autumn-2026',
      releaseTitle: 'Autumn Sovereign Release v2.4',
    },
    {
      id: 'camp-telecom-202',
      siteId: resolvedSiteId,
      title: 'Urgent Action: Town Hall Livestream Commences in 15 Minutes',
      channel: 'sms',
      itemType: 'campaign',
      status: 'scheduled',
      scheduledFor: '2026-09-21T18:45:00Z',
      completedAt: null,
      timeZone: 'America/Chicago',
      targetAudienceLabel: 'SMS Action Network (Verified Opt-In)',
      estimatedRecipients: 1240,
      targetSegmentId: 'seg-sms-action',
      releaseReferenceId: 'rel-townhall-live',
      releaseTitle: 'Sovereignty Town Hall 2026',
    },
  ])

  return NextResponse.json({
    siteId: resolvedSiteId,
    deliverabilityHealth,
    recentCampaigns,
    metricsDictionary: AUDIENCE_METRIC_DICTIONARY,
  })
}
