/**
 * POD-08 — Cartwall audio binding (PURE CORE): binds the POD-05 cartwall
 * state (banks of carts in the session document) to playback semantics
 * (tool map rows 5, 20, 21; POD-REQ-13 audio completion).
 *
 * Pattern-level adaptation of CurryCaster v1's `CartWallWindow` /
 * `CartButton` model (MIT, © 2024 Adam Curry — see THIRD_PARTY_NOTICES):
 * click = play, click again = stop; per-cart fader; a countdown runs
 * while a cart plays; STOP ALL halts carts and players together.
 *
 * EDIT-MODE GATE (row 21): every cart MUTATION (assign, rename, colour,
 * level, remove, clear) is rejected unless the wall is in edit mode —
 * enforced HERE in the engine, not merely hidden in the UI. Transport
 * (play/stop) is performance, not mutation, and is always available.
 *
 * Played state: a cart played to its end (or stopped after starting)
 * marks the POD-05 session clip 'played' (the dimming the cartwall UI
 * renders) and opens/closes a played-clip log entry in the session
 * document (played-log.ts — written at play START, crash-safe). PFL
 * does not exist for carts in the reference model; carts always feed
 * the program CLIPS bus.
 *
 * This core owns runtime state only (positions, countdowns, faders);
 * the browser adapter (players-browser.ts) turns state transitions
 * into actual audio. All operations return new runtime state snapshots
 * plus the session-document effects, so tests are deterministic.
 */

import { findClip, finishClip, stopCue, type StudioSessionDoc } from '../session-engine'
import { beginPlayedClip, closePlayedClip, type SessionDocWithPlayedLog } from './played-log'
import { FADER_MAX_DB, FADER_MIN_DB, wheelFaderDb } from './player-engine'
import type { PlayerEngine } from './player-engine'

export type CartRuntimeState = {
  cartId: string
  bankId: string
  title: string
  /** Media asset the cart resolves to, when the POD-05 clip carries one (extension field). */
  assetId?: string
  cueInSec: number
  cueOutSec: number
  status: 'idle' | 'playing' | 'played'
  positionSec: number
  gainDb: number
}

export type CartwallAudioState = {
  editMode: boolean
  carts: CartRuntimeState[]
}

export type CartOpResult = {
  ok: boolean
  error?: 'edit-mode-required' | 'no-such-cart'
  state: CartwallAudioState
  /** Session document after applying play/stop side effects (dimming + played log). */
  session?: SessionDocWithPlayedLog
}

const clampDb = (db: number): number => Math.min(FADER_MAX_DB, Math.max(FADER_MIN_DB, db))

/** Builds the runtime wall from a POD-05 session document's cartwall. */
export function createCartwallAudio(
  session: StudioSessionDoc,
  options: { editMode?: boolean } = {},
): CartwallAudioState {
  const carts: CartRuntimeState[] = []
  for (const bank of session.cartwall.banks) {
    for (const clip of bank.clips) {
      const extended = clip as typeof clip & { assetId?: string; gainDb?: number }
      carts.push({
        cartId: clip.id,
        bankId: bank.id,
        title: clip.title,
        ...(extended.assetId ? { assetId: extended.assetId } : {}),
        cueInSec: clip.cueInSec,
        cueOutSec: clip.cueOutSec,
        status: clip.state === 'played' ? 'played' : 'idle',
        positionSec: clip.cueInSec,
        gainDb: clampDb(extended.gainDb ?? 0),
      })
    }
  }
  return { editMode: options.editMode ?? false, carts }
}

const findCart = (state: CartwallAudioState, cartId: string): CartRuntimeState | undefined =>
  state.carts.find((cart) => cart.cartId === cartId)

const cloneState = (state: CartwallAudioState): CartwallAudioState =>
  JSON.parse(JSON.stringify(state)) as CartwallAudioState

export const setEditMode = (state: CartwallAudioState, editMode: boolean): CartwallAudioState => ({
  ...cloneState(state),
  editMode,
})

const gate = (state: CartwallAudioState): CartOpResult | null =>
  state.editMode ? null : { ok: false, error: 'edit-mode-required', state }

// ---------------------------------------------------------------------------
// Mutations (edit-mode gated, in the engine)
// ---------------------------------------------------------------------------

/** Assigns (or re-assigns) a media asset to a cart. Edit mode only. */
export function assignCartAsset(
  state: CartwallAudioState,
  cartId: string,
  assetId: string,
): CartOpResult {
  const blocked = gate(state)
  if (blocked) return blocked
  const next = cloneState(state)
  const cart = findCart(next, cartId)
  if (!cart) return { ok: false, error: 'no-such-cart', state }
  cart.assetId = assetId
  return { ok: true, state: next }
}

/** Renames a cart. Edit mode only. */
export function renameCart(state: CartwallAudioState, cartId: string, title: string): CartOpResult {
  const blocked = gate(state)
  if (blocked) return blocked
  const next = cloneState(state)
  const cart = findCart(next, cartId)
  if (!cart) return { ok: false, error: 'no-such-cart', state }
  cart.title = title
  return { ok: true, state: next }
}

/** Clears a cart's assignment (back to an empty slot). Edit mode only. */
export function clearCart(state: CartwallAudioState, cartId: string): CartOpResult {
  const blocked = gate(state)
  if (blocked) return blocked
  const next = cloneState(state)
  const cart = findCart(next, cartId)
  if (!cart) return { ok: false, error: 'no-such-cart', state }
  cart.assetId = undefined
  cart.status = 'idle'
  cart.positionSec = cart.cueInSec
  return { ok: true, state: next }
}

// ---------------------------------------------------------------------------
// Faders (per-cart level is a mutation: edit mode OR live trim? The
// reference gives every cart a fader usable during the show, so fader
// moves are transport-class, not edit-class — but ASSIGNING a cart's
// stored level as part of deck editing goes through setCartLevel,
// which is gated. Live trim uses wheelCartFader, ungated.)
// ---------------------------------------------------------------------------

/** Sets a cart's stored level. Edit mode only (deck editing). */
export function setCartLevel(
  state: CartwallAudioState,
  cartId: string,
  gainDb: number,
): CartOpResult {
  const blocked = gate(state)
  if (blocked) return blocked
  const next = cloneState(state)
  const cart = findCart(next, cartId)
  if (!cart) return { ok: false, error: 'no-such-cart', state }
  cart.gainDb = clampDb(gainDb)
  return { ok: true, state: next }
}

/** Live wheel trim of a cart fader during the show (not a deck mutation). */
export function wheelCartFader(
  state: CartwallAudioState,
  cartId: string,
  wheelDeltaY: number,
): CartOpResult {
  const next = cloneState(state)
  const cart = findCart(next, cartId)
  if (!cart) return { ok: false, error: 'no-such-cart', state }
  cart.gainDb = wheelFaderDb(cart.gainDb, wheelDeltaY)
  return { ok: true, state: next }
}

// ---------------------------------------------------------------------------
// Transport (click play/stop) + countdown
// ---------------------------------------------------------------------------

/**
 * Click a cart: idle/played → play; playing → stop. Play opens a
 * played-clip log entry in the session document at play START and the
 * returned session carries it; stop closes the entry as 'stopped' and
 * marks the session clip played (dimming).
 */
export function toggleCart(
  state: CartwallAudioState,
  session: StudioSessionDoc,
  cartId: string,
): CartOpResult {
  const next = cloneState(state)
  const cart = findCart(next, cartId)
  if (!cart) return { ok: false, error: 'no-such-cart', state }
  if (cart.status === 'playing') {
    cart.status = 'played'
    cart.positionSec = cart.cueInSec
    const closed = closePlayedClip(session, { source: 'cart', clipId: cartId, outcome: 'stopped' })
    const stopped = stopCue(closed.session, cartId)
    const played = finishClip(stopped.session, cartId)
    return { ok: true, state: next, session: played.session as SessionDocWithPlayedLog }
  }
  cart.status = 'playing'
  cart.positionSec = cart.cueInSec
  const begun = beginPlayedClip(session, {
    source: 'cart',
    clipId: cartId,
    assetId: cart.assetId,
    title: cart.title,
  })
  return { ok: true, state: next, session: begun.session }
}

/** Countdown model for a cart: seconds remaining in the cue region (0 when not playing). */
export const cartCountdownSec = (cart: CartRuntimeState): number =>
  cart.status === 'playing' ? Math.max(0, cart.cueOutSec - cart.positionSec) : 0

/**
 * Advances playing carts. A cart reaching its OUT point stops, marks
 * played in the session document, and closes its log entry
 * 'completed'. Returns the effects to apply (session doc) — callers
 * thread the returned session forward.
 */
export function advanceCarts(
  state: CartwallAudioState,
  session: StudioSessionDoc,
  dtSec: number,
): CartOpResult {
  if (!Number.isFinite(dtSec) || dtSec < 0) throw new Error('advanceCarts requires dt >= 0.')
  const next = cloneState(state)
  let doc: StudioSessionDoc = session
  for (const cart of next.carts) {
    if (cart.status !== 'playing') continue
    cart.positionSec += dtSec
    if (cart.positionSec >= cart.cueOutSec) {
      cart.status = 'played'
      cart.positionSec = cart.cueInSec
      const closed = closePlayedClip(doc, {
        source: 'cart',
        clipId: cart.cartId,
        outcome: 'completed',
      })
      doc = finishClip(closed.session, cart.cartId).session
    }
  }
  return { ok: true, state: next, session: doc as SessionDocWithPlayedLog }
}

/**
 * STOP ALL integration (tool map row 5): halts the player engine AND
 * every playing cart in one operation, closing every open played-log
 * entry as 'stopped' and marking played carts in the session document.
 */
export function stopAllAudio(
  engine: PlayerEngine,
  state: CartwallAudioState,
  session: StudioSessionDoc,
): CartOpResult & { stoppedPlayers: number } {
  const stoppedPlayers = engine.stopAll()
  const next = cloneState(state)
  let doc: StudioSessionDoc = engine.playedLogToSession(session)
  for (const cart of next.carts) {
    if (cart.status !== 'playing') continue
    cart.status = 'played'
    cart.positionSec = cart.cueInSec
    const closed = closePlayedClip(doc, { source: 'cart', clipId: cart.cartId, outcome: 'stopped' })
    doc = finishClip(closed.session, cart.cartId).session
  }
  return { ok: true, state: next, session: doc as SessionDocWithPlayedLog, stoppedPlayers }
}

/** Session lookup helper re-exported for the UI layer. */
export const cartInSession = findClip
