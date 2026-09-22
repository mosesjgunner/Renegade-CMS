import {
  calculateSmsSegments,
  estimateTelecomCost,
  validateRcsContent,
  type RcsCard,
  type RcsContent,
  type SmsSegmentCalculation,
  type TelecomCostEstimate,
} from './contracts'

export type PersonalizationContext = Record<string, string | number | boolean | undefined | null>

/**
 * Replaces tokens of the format `{{variable|fallback}}` or `{{variable}}`.
 * Missing variables without fallbacks default to empty string and are reported.
 */
export function interpolatePersonalization(
  template: string,
  context: PersonalizationContext = {},
): { text: string; missingVariables: string[] } {
  const missingVariables: string[] = []

  const text = template.replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\|([^}]*))?\s*\}\}/g, (_, key, fallback) => {
    const val = context[key]
    if (val !== undefined && val !== null && val !== '') {
      return String(val)
    }
    if (fallback !== undefined) {
      return fallback
    }
    missingVariables.push(key)
    return ''
  })

  return { text, missingVariables }
}

export type SmsCompositionResult = {
  text: string
  segmentCalculation: SmsSegmentCalculation
  costEstimate: TelecomCostEstimate
  warnings: string[]
  missingVariables: string[]
}

export function composeSmsMessage(input: {
  body: string
  personalization?: PersonalizationContext
  senderIdentity?: string
  countryCode?: string
  purpose?: 'marketing' | 'transactional' | 'alerts'
  recipientCount?: number
}): SmsCompositionResult {
  const { text, missingVariables } = interpolatePersonalization(input.body, input.personalization)
  const segmentCalculation = calculateSmsSegments(text)
  const costEstimate = estimateTelecomCost({
    channel: 'sms',
    segments: segmentCalculation.segmentCount,
    recipientCount: input.recipientCount ?? 1,
    countryCode: input.countryCode ?? 'US',
  })

  const warnings: string[] = []

  // Regulatory / carrier compliance check for marketing
  if (input.purpose === 'marketing') {
    const uppercase = text.toUpperCase()
    if (!uppercase.includes('STOP')) {
      warnings.push("Marketing messages must include clear opt-out instructions (e.g. 'Reply STOP to cancel').")
    }
  }

  if (segmentCalculation.containsNonGsmCharacters) {
    warnings.push(
      `Message contains non-GSM characters (${segmentCalculation.nonGsmCharacters.slice(0, 3).join(', ')}), forcing UCS-2 encoding (70 chars/segment).`,
    )
  }

  if (segmentCalculation.segmentCount > 3) {
    warnings.push(
      `Message spans ${segmentCalculation.segmentCount} segments. Multi-segment messages have higher delivery failure rates and carrier surcharges.`,
    )
  }

  return {
    text,
    segmentCalculation,
    costEstimate,
    warnings,
    missingVariables,
  }
}

export type RcsCompositionResult = {
  rcs: RcsContent
  validationErrors: string[]
  warnings: string[]
  rcsCostEstimate: TelecomCostEstimate
  fallbackSmsComposition?: SmsCompositionResult
  exactRecipientPreview: {
    title?: string
    text: string
    hasMedia: boolean
    actionButtons: string[]
    fallbackPlan: string
  }
}

export function composeRcsMessage(input: {
  rcs: RcsContent
  personalization?: PersonalizationContext
  senderIdentity?: string
  countryCode?: string
  recipientCount?: number
}): RcsCompositionResult {
  const validationErrors = validateRcsContent(input.rcs)
  const warnings: string[] = []

  // Personalize top-level text
  const { text: personalizedText, missingVariables } = interpolatePersonalization(
    input.rcs.text,
    input.personalization,
  )

  // Personalize cards if present
  let personalizedCards: RcsCard[] | undefined = undefined
  if (input.rcs.cards) {
    personalizedCards = input.rcs.cards.map((card) => {
      const { text: title } = interpolatePersonalization(card.title, input.personalization)
      const { text: description } = card.description
        ? interpolatePersonalization(card.description, input.personalization)
        : { text: undefined }
      return {
        ...card,
        title,
        description,
      }
    })
  }

  const personalizedRcs: RcsContent = {
    ...input.rcs,
    text: personalizedText,
    cards: personalizedCards,
  }

  if (missingVariables.length > 0) {
    warnings.push(`Missing personalization variables: ${missingVariables.join(', ')}`)
  }

  // Cost estimate for RCS
  const isRich = Boolean(
    input.rcs.media || (input.rcs.cards && input.rcs.cards.length > 0) || input.rcs.type !== 'basic',
  )
  const rcsCostEstimate = estimateTelecomCost({
    channel: 'rcs',
    recipientCount: input.recipientCount ?? 1,
    countryCode: input.countryCode ?? 'US',
    isRichCard: isRich,
  })

  // Fallback composition
  let fallbackSmsComposition: SmsCompositionResult | undefined = undefined
  if (input.rcs.fallbackPolicy === 'allow-with-configured-text') {
    if (input.rcs.fallbackSmsBody) {
      fallbackSmsComposition = composeSmsMessage({
        body: input.rcs.fallbackSmsBody,
        personalization: input.personalization,
        senderIdentity: input.senderIdentity,
        countryCode: input.countryCode,
        recipientCount: input.recipientCount,
      })
    } else {
      validationErrors.push('RCS fallback is enabled but no fallback SMS body was provided.')
    }
  }

  // Exact recipient preview summary
  const actionButtons: string[] = []
  if (input.rcs.actions) {
    for (const a of input.rcs.actions) {
      actionButtons.push(a.text)
    }
  }
  if (personalizedCards) {
    for (const card of personalizedCards) {
      if (card.actions) {
        for (const a of card.actions) {
          actionButtons.push(a.text)
        }
      }
    }
  }

  let fallbackPlan = 'Prohibited (do not send if recipient lacks RCS)'
  if (input.rcs.fallbackPolicy === 'allow-with-configured-text') {
    fallbackPlan = `Allowed (send verified plain SMS: "${fallbackSmsComposition?.text ?? ''}")`
  } else if (input.rcs.fallbackPolicy === 'manual-review') {
    fallbackPlan = 'Hold for operator manual review if recipient lacks RCS'
  }

  return {
    rcs: personalizedRcs,
    validationErrors,
    warnings,
    rcsCostEstimate,
    fallbackSmsComposition,
    exactRecipientPreview: {
      title: personalizedCards?.[0]?.title,
      text: personalizedText,
      hasMedia: Boolean(input.rcs.media || personalizedCards?.some((c) => c.media)),
      actionButtons,
      fallbackPlan,
    },
  }
}
