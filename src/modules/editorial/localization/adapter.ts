import type { LocaleCode, LocaleVariant, TranslationDraftAttribution } from './contracts'

export interface TranslationDraftRequest {
  sourceText: {
    title: string
    summary?: string
    body?: Record<string, unknown> | string
    seoTitle?: string
    seoDescription?: string
    mediaAltTexts?: Record<string, string>
  }
  sourceLocale: LocaleCode
  targetLocale: LocaleCode
  options?: {
    model?: string
    formality?: 'default' | 'more' | 'less'
    glossaryId?: string
    temperature?: number
  }
}

export interface TranslationDraftResponse {
  success: boolean
  translatedText?: {
    title: string
    summary?: string
    body?: Record<string, unknown> | string
    seoTitle?: string
    seoDescription?: string
    mediaAltTexts?: Record<string, string>
  }
  attribution: TranslationDraftAttribution
}

export interface TranslationProviderAdapter {
  readonly id: string
  readonly name: string
  translateDraft(request: TranslationDraftRequest): Promise<TranslationDraftResponse>
}

/**
 * Built-in simulated provider adapter with predictable cost, token calculation,
 * and optional failure induction for robust testing.
 */
export class SimulatedTranslationProviderAdapter implements TranslationProviderAdapter {
  readonly id = 'simulated-ai-translator'
  readonly name = 'Renegade Simulated AI Translation Provider'

  private simulatedFailure: { code: string; message: string } | null = null

  setSimulatedFailure(failure: { code: string; message: string } | null) {
    this.simulatedFailure = failure
  }

  async translateDraft(request: TranslationDraftRequest): Promise<TranslationDraftResponse> {
    const now = new Date().toISOString()

    if (this.simulatedFailure) {
      return {
        success: false,
        attribution: {
          provider: this.id,
          model: request.options?.model || 'renegade-sim-v1',
          tokensUsed: 0,
          cost: 0,
          generatedAt: now,
          isMachineDraft: true,
          humanReviewed: false,
          errorMetadata: {
            code: this.simulatedFailure.code,
            message: this.simulatedFailure.message,
            timestamp: now,
          },
        },
      }
    }

    const { sourceText, targetLocale } = request
    const prefix = `[${targetLocale.toUpperCase()}] `

    const translateStr = (str?: string) => (str ? `${prefix}${str}` : str)

    let translatedBody: Record<string, unknown> | string | undefined = undefined
    let tokenEstimate = 0

    if (typeof sourceText.body === 'string') {
      translatedBody = translateStr(sourceText.body)
      tokenEstimate += sourceText.body.split(/\s+/).length * 2
    } else if (sourceText.body && typeof sourceText.body === 'object') {
      // Shallow clone and translate plain text strings in root
      const bodyObj = sourceText.body as Record<string, any>
      translatedBody = {
        ...bodyObj,
        _translated: targetLocale,
        plainText: translateStr(bodyObj.plainText || bodyObj.text || ''),
      }
      tokenEstimate += 120
    }

    tokenEstimate += (sourceText.title || '').split(/\s+/).length * 2
    tokenEstimate += (sourceText.summary || '').split(/\s+/).length * 2

    // Simulated media alt text translations
    const translatedMediaAltTexts: Record<string, string> = {}
    if (sourceText.mediaAltTexts) {
      for (const [id, alt] of Object.entries(sourceText.mediaAltTexts)) {
        translatedMediaAltTexts[id] = translateStr(alt) || ''
        tokenEstimate += alt.split(/\s+/).length * 2
      }
    }

    const costPer1kTokens = 0.002
    const calculatedCost = (tokenEstimate / 1000) * costPer1kTokens
    const cost = Math.max(0.0001, Number(calculatedCost.toFixed(6)))

    return {
      success: true,
      translatedText: {
        title: translateStr(sourceText.title) || '',
        summary: translateStr(sourceText.summary),
        body: translatedBody,
        seoTitle: translateStr(sourceText.seoTitle || sourceText.title),
        seoDescription: translateStr(sourceText.seoDescription || sourceText.summary),
        mediaAltTexts: translatedMediaAltTexts,
      },
      attribution: {
        provider: this.id,
        model: request.options?.model || 'renegade-sim-v1',
        tokensUsed: tokenEstimate,
        cost,
        generatedAt: now,
        isMachineDraft: true,
        humanReviewed: false,
        humanReviewerId: null,
        humanApprovedAt: null,
      },
    }
  }
}

/**
 * Validates that a locale variant meets mandatory human review and approval requirements.
 * Machine output must never be published or released without explicit human sign-off.
 */
export function assertHumanReviewApproved(variant: LocaleVariant): {
  approved: boolean
  reason?: string
} {
  if (variant.attribution?.isMachineDraft) {
    if (!variant.attribution.humanReviewed || !variant.attribution.humanApprovedAt) {
      return {
        approved: false,
        reason:
          'HUMAN_REVIEW_REQUIRED: Machine-generated translation draft must be reviewed and approved by an authorized human reviewer before publication or release.',
      }
    }
    if (!variant.attribution.humanReviewerId) {
      return {
        approved: false,
        reason:
          'HUMAN_REVIEW_REQUIRED: Machine translation approval must record the authorized reviewer ID.',
      }
    }
  }

  if (variant.status !== 'approved' && variant.status !== 'published') {
    return {
      approved: false,
      reason: `VARIANT_NOT_APPROVED: Locale variant status is '${variant.status}', but must be 'approved' prior to publication or release.`,
    }
  }

  return { approved: true }
}
