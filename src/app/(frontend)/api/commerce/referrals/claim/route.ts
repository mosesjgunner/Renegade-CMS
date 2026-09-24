import { NextRequest, NextResponse } from 'next/server'
import {
  evaluateReferralAttribution,
  type CodeOwnerRecord,
  type ReferralCustomerContext,
} from '../../../../../../modules/commerce/referral-service'
import type { ReferralProgram } from '../../../../../../modules/commerce/affiliate-referral-contracts'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, orderAmountMinor, currency, customer, codeOwner, program } = body

    if (!code || !orderAmountMinor || !currency) {
      return NextResponse.json({ error: 'Missing required code or order amounts' }, { status: 400 })
    }

    // Default sample program if none provided in request
    const referralProgram: ReferralProgram = program ?? {
      id: 'default-referral-program',
      siteId: 'default-site',
      version: 1,
      name: 'Default Referral Program',
      status: 'active',
      eligibility: {
        allowedMemberRoles: ['member', 'subscriber', 'author'],
        requireVerifiedEmail: false,
      },
      codes: { minLength: 3, maxLength: 32 },
      benefit: {
        referrerRewardType: 'basis_points',
        referrerRewardValue: '1000', // 10%
      },
      attribution: {
        model: 'last-touch',
        windowDays: 30,
        requireCookieConsent: false,
      },
      selfReferralRules: {
        blockSameMemberId: true,
        blockSameEmail: true,
        blockSamePaymentMethod: true,
        blockSameIpHash: true,
      },
      holdPeriodDays: 14,
      reversalRules: {
        reverseOnOrderRefund: true,
        reverseOnOrderCancel: true,
        reverseOnDispute: true,
      },
      terms: {
        version: '1.0',
        publishedAt: new Date().toISOString(),
        text: 'Standard referral program terms and conditions.',
      },
    }

    const defaultOwner: CodeOwnerRecord = codeOwner ?? {
      memberId: 'referrer_member_1',
      email: 'referrer@example.com',
      role: 'member',
      emailVerified: true,
    }

    const customerContext: ReferralCustomerContext = customer ?? {
      memberId: 'customer_member_2',
      email: 'buyer@example.com',
    }

    const result = evaluateReferralAttribution({
      program: referralProgram,
      referralCode: code,
      codeOwner: defaultOwner,
      customer: customerContext,
      orderAmountMinor: String(orderAmountMinor),
      currency: String(currency),
      consented: body.consented ?? true,
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Attribution evaluation failed'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
