import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (!grant.authorized) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const cookieHeader = request.headers.get('cookie') || ''
    const match = cookieHeader.match(/renegade-active-site=([^;]+)/)
    const effectiveSiteId = siteId || (match ? match[1].trim() : undefined)

    if (effectiveSiteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(effectiveSiteId)) {
      return NextResponse.json(
        { error: 'Forbidden. You do not have operator access to this site.' },
        { status: 403 },
      )
    }

    const where = effectiveSiteId
      ? { site: { equals: effectiveSiteId } }
      : grant.isGlobalOwner
        ? undefined
        : { site: { in: grant.authorizedSiteIds } }

    const accountsResult = await payload.find({
      collection: 'social-accounts' as never,
      where,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({
      accounts: accountsResult.docs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query social accounts.' },
      { status: 500 },
    )
  }
}

import { encryptSecret, sanitizeSocialLog } from '@/modules/social/security'
import { getProviderCapabilityTruth, socialProviderFor, credentialsForSocialAccount } from '@/modules/social/provider-runtime'
import { blueskyAdapter } from '@/modules/social/adapters/bluesky'

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (!grant.authorized) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: 'connect' | 'test' | 'disconnect' | 'reconcile'
      accountId?: string
      siteId?: string
      network?: string
      displayName?: string
      actorType?: 'site' | 'publication' | 'space'
      externalAccountId?: string
      connectionReference?: string
      credentials?: {
        identifier?: string
        appPassword?: string
        password?: string
        service?: string
        token?: string
      }
      mode?: 'fixture' | 'local-harness' | 'remote-sandbox' | 'live'
    }

    const action = body.action || 'connect'

    if (action === 'disconnect') {
      if (!body.accountId) {
        return NextResponse.json({ error: 'accountId is required for disconnect.' }, { status: 400 })
      }
      const existing = (await payload.findByID({
        collection: 'social-accounts' as never,
        id: body.accountId,
        depth: 0,
        overrideAccess: true,
      })) as any

      if (!existing) {
        return NextResponse.json({ error: 'Social account not found.' }, { status: 404 })
      }

      const accountSiteId = typeof existing.site === 'object' && existing.site ? existing.site.id : existing.site
      if (accountSiteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(String(accountSiteId))) {
        return NextResponse.json(
          { error: 'Forbidden. You do not have operator access to this site.' },
          { status: 403 },
        )
      }

      const updated = await payload.update({
        collection: 'social-accounts' as never,
        id: body.accountId,
        data: {
          credentialHealth: 'revoked',
          capabilityState: 'unavailable',
          connectionReference: null,
          diagnostics: {
            disconnectedAt: new Date().toISOString(),
            disconnectedBy: auth?.user?.email || 'operator',
            reason: 'Operator requested safe disconnection.',
          },
        } as never,
        overrideAccess: true,
      })

      return NextResponse.json({
        success: true,
        action: 'disconnect',
        account: updated,
      })
    }

    if (action === 'test') {
      if (!body.accountId) {
        return NextResponse.json({ error: 'accountId is required for test.' }, { status: 400 })
      }
      const existing = (await payload.findByID({
        collection: 'social-accounts' as never,
        id: body.accountId,
        depth: 0,
        overrideAccess: true,
      })) as any

      if (!existing) {
        return NextResponse.json({ error: 'Social account not found.' }, { status: 404 })
      }

      const accountSiteId = typeof existing.site === 'object' && existing.site ? existing.site.id : existing.site
      if (accountSiteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(String(accountSiteId))) {
        return NextResponse.json(
          { error: 'Forbidden. You do not have operator access to this site.' },
          { status: 403 },
        )
      }

      const network = existing.network
      const adapter = socialProviderFor(network)
      let resolvedCreds = credentialsForSocialAccount(existing.connectionReference)
      if (!resolvedCreds && body.credentials) {
        resolvedCreds = body.credentials
      }

      let health: 'healthy' | 'revoked' | 'expired' | 'not-configured' = 'healthy'
      let errorMessage: string | null = null

      if (!resolvedCreds) {
        health = 'not-configured'
        errorMessage = 'No credentials found for account.'
      } else if (network === 'bluesky') {
        const identifier = resolvedCreds.identifier || resolvedCreds.handle
        const password = resolvedCreds.appPassword || resolvedCreds.password
        const service = resolvedCreds.service || 'http://127.0.0.1:3130'
        if (!identifier || !password) {
          health = 'not-configured'
          errorMessage = 'Bluesky identifier and appPassword are required.'
        } else {
          try {
            await blueskyAdapter.createSession(service, identifier, password)
            health = 'healthy'
          } catch (err: unknown) {
            health = 'revoked'
            errorMessage = err instanceof Error ? err.message : String(err)
          }
        }
      }

      const capabilityTruth = getProviderCapabilityTruth(
        network,
        body.mode || (existing.diagnostics?.mode as any),
      )

      const updated = await payload.update({
        collection: 'social-accounts' as never,
        id: body.accountId,
        data: {
          credentialHealth: health,
          capabilityState: health === 'healthy' ? 'available' : 'unavailable',
          lastVerifiedAt: new Date().toISOString(),
          diagnostics: {
            mode: capabilityTruth.mode,
            testedAt: new Date().toISOString(),
            status: health,
            lastError: errorMessage ? sanitizeSocialLog(errorMessage) : null,
          },
        } as never,
        overrideAccess: true,
      })

      return NextResponse.json({
        success: health === 'healthy',
        health,
        account: updated,
        capabilityTruth,
      })
    }

    // Connect / Setup
    const targetSiteId = body.siteId
    if (!targetSiteId) {
      return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
    }

    if (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(targetSiteId)) {
      return NextResponse.json(
        { error: 'Forbidden. You do not have operator access to this site.' },
        { status: 403 },
      )
    }

    const network = body.network as any
    if (!network) {
      return NextResponse.json({ error: 'network is required.' }, { status: 400 })
    }

    const externalAccountId = body.externalAccountId || body.displayName || `${network}-account`
    const displayName = body.displayName || externalAccountId
    const actorType = body.actorType || 'site'
    const requestedMode = body.mode || (process.env.NODE_ENV !== 'production' ? 'local-harness' : 'live')

    const capabilityTruth = getProviderCapabilityTruth(network, requestedMode)

    let connectionRef: string | null = body.connectionReference || null
    let credentialHealth: 'healthy' | 'revoked' | 'expired' | 'not-configured' = 'not-configured'
    let verificationError: string | null = null

    if (body.credentials) {
      // Direct credentials provided; encrypt them into connectionReference envelope
      const creds = body.credentials
      if (network === 'bluesky') {
        const identifier = creds.identifier
        const password = creds.appPassword || creds.password
        const service = creds.service || 'http://127.0.0.1:3130'
        if (!identifier || !password) {
          credentialHealth = 'not-configured'
          verificationError = 'Missing identifier or app password.'
        } else {
          try {
            await blueskyAdapter.createSession(service, identifier, password)
            credentialHealth = 'healthy'
          } catch (err: unknown) {
            credentialHealth = 'revoked'
            verificationError = err instanceof Error ? err.message : String(err)
          }
        }
      } else {
        credentialHealth = 'healthy'
      }

      // Store ONLY encrypted secret reference
      const serialized = JSON.stringify(creds)
      connectionRef = `enc:${encryptSecret(serialized)}`
    } else if (connectionRef) {
      // Check existing connectionReference
      const resolved = credentialsForSocialAccount(connectionRef)
      if (resolved && network === 'bluesky') {
        const identifier = resolved.identifier
        const password = resolved.appPassword || resolved.password
        const service = resolved.service || 'http://127.0.0.1:3130'
        try {
          await blueskyAdapter.createSession(service, identifier, password)
          credentialHealth = 'healthy'
        } catch (err: unknown) {
          credentialHealth = 'revoked'
          verificationError = err instanceof Error ? err.message : String(err)
        }
      } else if (resolved) {
        credentialHealth = 'healthy'
      } else {
        credentialHealth = 'not-configured'
      }
    }

    const capabilityState =
      credentialHealth === 'healthy'
        ? (capabilityTruth.mode === 'manual-handoff' ? 'manual-handoff' : 'available')
        : 'unavailable'

    // Check if doc exists
    let existingDoc: any = null
    if (body.accountId) {
      existingDoc = await payload.findByID({
        collection: 'social-accounts' as never,
        id: body.accountId,
        depth: 0,
        overrideAccess: true,
      })
    } else {
      const search = await payload.find({
        collection: 'social-accounts' as never,
        where: {
          and: [
            { site: { equals: targetSiteId } },
            { network: { equals: network } },
            { externalAccountId: { equals: externalAccountId } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (search.docs.length > 0) existingDoc = search.docs[0]
    }

    const diagnosticsPayload = {
      mode: capabilityTruth.mode,
      configuredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: credentialHealth,
      lastError: verificationError ? sanitizeSocialLog(verificationError) : null,
      scopes: capabilityTruth.capabilities.postTypes,
    }

    let savedAccount: any
    if (existingDoc) {
      savedAccount = await payload.update({
        collection: 'social-accounts' as never,
        id: existingDoc.id,
        data: {
          displayName,
          actorType,
          capabilityState,
          capabilities: capabilityTruth.capabilities,
          credentialHealth,
          connectionReference: connectionRef,
          lastVerifiedAt: new Date().toISOString(),
          diagnostics: diagnosticsPayload,
        } as never,
        overrideAccess: true,
      })
    } else {
      savedAccount = await payload.create({
        collection: 'social-accounts' as never,
        data: {
          site: targetSiteId,
          displayName,
          network,
          actorType,
          externalAccountId,
          capabilityState,
          capabilities: capabilityTruth.capabilities,
          credentialHealth,
          connectionReference: connectionRef,
          lastVerifiedAt: new Date().toISOString(),
          diagnostics: diagnosticsPayload,
        } as never,
        overrideAccess: true,
      })
    }

    return NextResponse.json({
      success: credentialHealth === 'healthy',
      account: savedAccount,
      capabilityTruth,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Social connection operation failed.' },
      { status: 500 },
    )
  }
}
