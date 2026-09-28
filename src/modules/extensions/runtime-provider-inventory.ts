import type { AppConfig } from '../core/config'

export type RuntimeProviderState = 'configured' | 'enabled' | 'degraded' | 'unavailable'
export type RuntimeProviderInventoryItem = {
  id: string
  group:
    | 'Email'
    | 'Messaging'
    | 'Payments & Support'
    | 'Media'
    | 'Identity'
    | 'Social'
    | 'AI'
    | 'Fulfillment'
  providerKey: string
  label: string
  state: RuntimeProviderState
  credentialSource: string
  safeTestResult: string
  limitations: string[]
  manageHref?: string
}

type Environment = Record<string, string | undefined>

/** Metadata only: never returns an environment value or credential. */
export function runtimeProviderInventory(
  config: Pick<AppConfig, 'email' | 'storage' | 'networking' | 'nodeEnv'>,
  env: Environment,
  configuredProviderKeys: readonly string[] = [],
): RuntimeProviderInventoryItem[] {
  const smtpReady = config.email.mode === 'smtp' && Boolean(config.email.host && config.email.from)
  const emailState: RuntimeProviderState =
    config.email.mode === 'development' ? 'enabled' : smtpReady ? 'configured' : 'unavailable'
  const telecomMode = env.TELECOM_MODE || (config.nodeEnv === 'production' ? 'real' : 'development')
  const twilioReady = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN)
  const telecomState: RuntimeProviderState =
    telecomMode === 'development' || telecomMode === 'emulator'
      ? 'enabled'
      : (telecomMode === 'real' || telecomMode === 'twilio') && twilioReady
        ? 'configured'
        : 'unavailable'
  const s3Ready = config.storage.driver === 's3' && Boolean(config.storage.s3)
  const federationReady = Boolean(
    config.networking.enabled &&
      env.ACTIVITYPUB_PRIVATE_KEY_PEM &&
      env.ACTIVITYPUB_PUBLIC_KEY_PEM &&
      env.ACTIVITYPUB_KEY_ID,
  )
  const stripeTestReady = Boolean(
    env.COMMERCE_STRIPE_TEST_ENABLED === 'true' &&
      env.COMMERCE_STRIPE_TEST_SECRET_KEY &&
      env.COMMERCE_STRIPE_TEST_WEBHOOK_SECRET,
  )

  const rows: RuntimeProviderInventoryItem[] = [
    {
      id: 'runtime:email',
      group: 'Email',
      providerKey: config.email.mode === 'development' ? 'development-capture' : 'smtp',
      label:
        config.email.mode === 'development' ? 'Development Mail Capture' : 'Outbound Email (SMTP)',
      state: emailState,
      credentialSource:
        config.email.mode === 'development'
          ? 'Local process memory; no credentials'
          : smtpReady
            ? 'Environment variables; values hidden'
            : 'No SMTP credential configured',
      safeTestResult: 'Not tested here; no message was sent.',
      limitations: [
        config.email.mode === 'disabled'
          ? 'Email delivery is disabled.'
          : 'No remote email provider validation is recorded in this overview.',
        'Resend, Postmark, and SendGrid adapters are not installed.',
      ],
    },
    {
      id: 'runtime:telecom',
      group: 'Messaging',
      providerKey:
        telecomMode === 'development' || telecomMode === 'emulator' ? 'telecom-emulator' : 'twilio',
      label: 'Outbound SMS',
      state: telecomState,
      credentialSource:
        telecomState === 'configured'
          ? 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables; values hidden'
          : telecomState === 'enabled'
            ? 'Deterministic local emulator; no credentials'
            : 'No usable messaging credentials',
      safeTestResult:
        telecomState === 'enabled'
          ? 'Local emulator selected; no SMS sent.'
          : 'Not tested here; no SMS sent.',
      limitations: [
        telecomState === 'configured' && env.TELECOM_ALLOW_OUTBOUND !== 'true'
          ? 'Live outbound sends remain disabled by policy.'
          : 'Provider verification is not run from this overview.',
      ],
    },
    {
      id: 'runtime:storage',
      group: 'Media',
      providerKey: s3Ready ? 's3-compatible-storage' : 'local-storage',
      label: s3Ready ? 'S3-Compatible Media Storage' : 'Local Media Storage',
      state: s3Ready || config.storage.driver === 'local' ? 'enabled' : 'unavailable',
      credentialSource: s3Ready
        ? 'S3 environment variables; values hidden'
        : 'Local persistent volume; no provider credential',
      safeTestResult: 'Read/write health is reported separately in system diagnostics.',
      limitations: s3Ready
        ? ['This overview does not contact the storage endpoint.']
        : ['Local storage requires a persistent volume in production.'],
    },
    {
      id: 'runtime:federation',
      group: 'Identity',
      providerKey: 'activitypub',
      label: 'ActivityPub Federation',
      state: federationReady ? 'configured' : 'unavailable',
      credentialSource: federationReady
        ? 'ActivityPub signing key environment variables; values hidden'
        : 'Federation is disabled or signing keys are incomplete',
      safeTestResult: 'Not tested here; no federated activity was sent.',
      limitations: federationReady
        ? ['Remote-instance reachability is not verified here.']
        : ['ActivityPub publication is unavailable until enabled and signing keys are configured.'],
    },
    {
      id: 'runtime:stripe-test',
      group: 'Payments & Support',
      providerKey: 'stripe-test',
      label: 'Stripe Test Checkout',
      state: stripeTestReady ? 'configured' : 'unavailable',
      credentialSource: stripeTestReady
        ? 'Stripe test environment variables; values hidden'
        : 'Test checkout disabled or test credentials incomplete',
      safeTestResult: 'No charge or provider request was made.',
      limitations: ['Test-mode adapter only; no live payment provider adapter is installed.'],
    },
    {
      id: 'runtime:video-external',
      group: 'Media',
      providerKey: 'external-video-processor',
      label: 'External Video Processor',
      state: 'unavailable',
      credentialSource: 'No credential supported',
      safeTestResult: 'Not tested; no external adapter is installed.',
      limitations: [
        'The provider seam intentionally fails closed until a concrete adapter is installed.',
      ],
    },
  ]

  const configured = new Set(configuredProviderKeys)
  const socialProviders: Array<[string, string]> = [
    ['bluesky', 'Bluesky'],
    ['mastodon', 'Mastodon'],
    ['linkedin', 'LinkedIn'],
    ['facebook', 'Facebook'],
    ['instagram', 'Instagram'],
    ['threads', 'Threads'],
    ['pinterest', 'Pinterest'],
    ['youtube', 'YouTube'],
    ['tiktok', 'TikTok'],
    ['x', 'X'],
    ['telegram', 'Telegram'],
    ['discord', 'Discord'],
    ['activitypub', 'ActivityPub Social'],
  ]
  for (const [providerKey, label] of socialProviders) {
    if (configured.has(providerKey)) continue
    rows.push({
      id: `unconfigured:social:${providerKey}`,
      group: 'Social',
      providerKey,
      label,
      state: 'unavailable',
      credentialSource: 'No site account configured',
      safeTestResult: 'No account configured; no post or provider request was made.',
      limitations: ['Connect an account in Social Distribution before publishing.'],
      manageHref: '/admin/social',
    })
  }
  for (const [providerKey, label] of [
    ['ai.openai-compatible', 'OpenAI-Compatible AI'],
    ['ai.ollama', 'Local Ollama AI'],
  ]) {
    if (configured.has(providerKey)) continue
    rows.push({
      id: `unconfigured:${providerKey}`,
      group: 'AI',
      providerKey,
      label,
      state: 'unavailable',
      credentialSource: 'No site connection configured',
      safeTestResult: 'Not tested; no provider request was made.',
      limitations: ['Connect and test this provider in AI Studio before enabling tasks.'],
      manageHref: '/admin/ai',
    })
  }
  if (!configured.has('printful')) {
    rows.push({
      id: 'unconfigured:printful',
      group: 'Fulfillment',
      providerKey: 'printful',
      label: 'Printful POD',
      state: 'unavailable',
      credentialSource: 'No site store configured',
      safeTestResult: 'Not tested; no provider request or order was made.',
      limitations: ['Live order creation requires explicit opt-in and provider preflight.'],
      manageHref: '/admin/fulfillment',
    })
  }
  return rows
}
