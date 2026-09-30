'use client'

import { useMemo, useRef, useState } from 'react'
import { feeCoverAmount } from './donations'

export type DonationFormCampaign = {
  id: string
  title: string
  currency: string
  minorUnitDigits: number
  minimumAmountMinor: string
  maximumAmountMinor: string
  allowedAmounts: string[]
  recurrence: Array<'one-time' | 'recurring'>
  feeCover?: {
    mode: 'percentage-plus-fixed'
    basisPoints: number
    fixedAmountMinor: string
    maximumFeeMinor?: string
  }
  privacyDefault: 'public' | 'anonymous' | 'private'
  designations: Array<{ key: string; label: string }>
  disclosures: string[]
}

function toMinor(value: string, digits: number): string | null {
  if (!/^\d+(\.\d*)?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  if (fraction.length > digits) return null
  return (
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0')
  ).toString()
}
function money(minor: string, currency: string, digits: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    Number(minor) / 10 ** digits,
  )
}

export function DonationForm({
  campaign,
  intentEndpoint = '/api/commerce/donations/intent',
}: {
  campaign: DonationFormCampaign
  intentEndpoint?: string
}) {
  const [amount, setAmount] = useState('')
  const [recurrence, setRecurrence] = useState<'one-time' | 'recurring'>(
    campaign.recurrence[0] ?? 'one-time',
  )
  const [coverFees, setCoverFees] = useState(false)
  const [recognition, setRecognition] = useState(campaign.privacyDefault)
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [designation, setDesignation] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const checkoutKey = useRef<{ body: string; key: string } | null>(null)
  const minor = useMemo(
    () => toMinor(amount, campaign.minorUnitDigits),
    [amount, campaign.minorUnitDigits],
  )
  const boundsError =
    amount &&
    (!minor ||
      BigInt(minor) < BigInt(campaign.minimumAmountMinor) ||
      BigInt(minor) > BigInt(campaign.maximumAmountMinor))
      ? `Enter an amount between ${money(campaign.minimumAmountMinor, campaign.currency, campaign.minorUnitDigits)} and ${money(campaign.maximumAmountMinor, campaign.currency, campaign.minorUnitDigits)}.`
      : ''
  let fee = '0'
  if (coverFees && minor && campaign.feeCover) {
    try {
      fee = feeCoverAmount(minor, campaign.feeCover)
    } catch {
      fee = '0'
    }
  }
  const total = minor && !boundsError ? (BigInt(minor) + BigInt(fee)).toString() : '0'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!minor || boundsError) {
      setError(boundsError || 'Enter a valid donation amount.')
      return
    }
    setBusy(true)
    try {
      const body = JSON.stringify({
        campaignId: campaign.id,
        amountMinor: minor,
        customAmount: !campaign.allowedAmounts.includes(minor),
        currency: campaign.currency,
        recurrence,
        feeCover: coverFees,
        recognition,
        publicDisplayName: recognition === 'public' ? displayName : undefined,
        donorMessage: recognition === 'private' ? message : undefined,
        designation: designation || undefined,
        email: email || undefined,
        marketingConsent,
      })
      if (checkoutKey.current?.body !== body)
        checkoutKey.current = { body, key: crypto.randomUUID() }
      const response = await fetch(intentEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': checkoutKey.current.key },
        body,
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || 'We could not start checkout. Please try again.')
      if (result.actionUrl) {
        window.location.assign(result.actionUrl)
        return
      }
      throw new Error('Checkout did not return a secure payment page.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not start checkout.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby="donation-title" noValidate>
      <h2 id="donation-title">Donate to {campaign.title}</h2>
      <fieldset>
        <legend>Donation amount ({campaign.currency})</legend>
        {campaign.allowedAmounts.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={minor === value}
            onClick={() =>
              setAmount(
                (Number(value) / 10 ** campaign.minorUnitDigits).toFixed(campaign.minorUnitDigits),
              )
            }
          >
            {money(value, campaign.currency, campaign.minorUnitDigits)}
          </button>
        ))}
        <label htmlFor="donation-amount">Custom amount</label>
        <input
          id="donation-amount"
          name="amount"
          inputMode="decimal"
          type="number"
          min={Number(campaign.minimumAmountMinor) / 10 ** campaign.minorUnitDigits}
          max={Number(campaign.maximumAmountMinor) / 10 ** campaign.minorUnitDigits}
          step={1 / 10 ** campaign.minorUnitDigits}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={Boolean(boundsError)}
          aria-describedby="donation-bounds"
          required
        />
        <p id="donation-bounds" aria-live="polite">
          {boundsError ||
            `Minimum ${money(campaign.minimumAmountMinor, campaign.currency, campaign.minorUnitDigits)}; maximum ${money(campaign.maximumAmountMinor, campaign.currency, campaign.minorUnitDigits)}.`}
        </p>
      </fieldset>
      {campaign.recurrence.length > 1 && (
        <fieldset>
          <legend>Frequency</legend>
          {campaign.recurrence.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="recurrence"
                value={value}
                checked={recurrence === value}
                onChange={() => setRecurrence(value)}
              />
              {value === 'one-time' ? 'One time' : 'Recurring'}
            </label>
          ))}
        </fieldset>
      )}
      {campaign.feeCover && (
        <fieldset>
          <legend>Processing fees</legend>
          <label>
            <input
              type="checkbox"
              checked={coverFees}
              onChange={(event) => setCoverFees(event.target.checked)}
            />
            Cover the estimated processing fee (
            {money(fee, campaign.currency, campaign.minorUnitDigits)})
          </label>
          <p>You can choose whether to add this amount.</p>
        </fieldset>
      )}
      {campaign.designations.length > 0 && <label htmlFor="designation">Direct my gift to</label>}
      {campaign.designations.length > 0 && (
        <select
          id="designation"
          value={designation}
          onChange={(event) => setDesignation(event.target.value)}
        >
          <option value="">Where needed most</option>
          {campaign.designations.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      )}
      <fieldset>
        <legend>Donor recognition</legend>
        <label htmlFor="recognition">Recognition preference</label>
        <select
          id="recognition"
          value={recognition}
          onChange={(event) => setRecognition(event.target.value as typeof recognition)}
        >
          <option value="public">Show my name publicly</option>
          <option value="anonymous">Recognize me anonymously</option>
          <option value="private">Keep my gift and message private</option>
        </select>
        {recognition === 'public' && (
          <label htmlFor="display-name">
            Public name
            <input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={100}
            />
          </label>
        )}
        {recognition === 'private' && (
          <label htmlFor="donor-message">
            Private message (optional)
            <textarea
              id="donor-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
            />
          </label>
        )}
      </fieldset>
      <label htmlFor="donor-email">
        Email for your receipt
        <input
          id="donor-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(event) => setMarketingConsent(event.target.checked)}
        />
        Send me occasional updates and news
      </label>
      <p aria-live="polite">
        Donation:{' '}
        {minor
          ? money(minor, campaign.currency, campaign.minorUnitDigits)
          : money('0', campaign.currency, campaign.minorUnitDigits)}
        {coverFees && minor
          ? `; fee: ${money(fee, campaign.currency, campaign.minorUnitDigits)}`
          : ''}
        ; total: {money(total, campaign.currency, campaign.minorUnitDigits)}.
      </p>
      {campaign.disclosures.map((disclosure, index) => (
        <p key={index}>{disclosure}</p>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || Boolean(boundsError) || !minor}>
        {busy ? 'Starting secure checkout…' : 'Continue to secure checkout'}
      </button>
    </form>
  )
}
