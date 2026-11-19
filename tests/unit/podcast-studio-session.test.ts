/**
 * POD-05 (POD-REQ-11, POD-REQ-12, POD-REQ-13 state layer): the PT-E
 * session assertions ported to unit tests over the session state
 * engine + the OPML module. The PT-E prototype
 * (RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/PT-E-session-guests/session.js)
 * proved these semantics as a disposable state machine; here they run
 * against the production engine and the POD-00 session contract.
 * No audio exists in this stage — every assertion is about state.
 */
import { describe, expect, it } from 'vitest'

import {
  exportOpml,
  hashOpmlContent,
  importOpmlRundown,
  opmlToRundown,
  rundownToOpml,
} from '../../src/modules/podcast-studio/opml'
import {
  addBank,
  addClip,
  addRundownItem,
  armCue,
  completeSegment,
  createSession,
  findClip,
  fireCue,
  getMixerSnapshot,
  moveRundownItem,
  reloadSession,
  resetBank,
  restoreBank,
  restoreSession,
  saveSession,
  setMixerSnapshot,
  setSessionState,
  shareDeck,
  skipSegment,
  startSegment,
  stopAll,
  stopCue,
  tick,
  timingRollup,
  type StudioSessionDoc,
} from '../../src/modules/podcast-studio/session-engine'
import {
  applySessionOperation,
  buildExampleSession,
} from '../../src/modules/podcast-studio/sessions'
import { getRecordingState } from '../../src/modules/podcast-studio/recording/recording-session'

/** The PT-E fixture session, rebuilt through engine ops. */
function makePtESession(): StudioSessionDoc {
  let s = createSession({
    id: 'sess-pt-e-001',
    showId: 'show-pt-e',
    showTitle: 'PT-E Fixture Show',
  })
  s = setSessionState(s, 'live')
  const items = [
    { id: 'rd-1', type: 'segment', title: 'Cold open + headlines', plannedSec: 300 },
    { id: 'rd-2', type: 'clip', title: 'Clip: mayor soundbite', plannedSec: 45, clipId: 'cart-a1' },
    { id: 'rd-3', type: 'guest', title: 'Guest interview', plannedSec: 600 },
    {
      id: 'rd-4',
      type: 'link',
      title: 'Link read: show notes URL',
      plannedSec: 30,
      url: 'https://example.com/notes',
    },
    { id: 'rd-5', type: 'segment', title: 'Wrap + credits', plannedSec: 240 },
  ]
  for (const item of items) s = addRundownItem(s, item).session
  const bankA = addBank(s, { id: 'bank-a', name: 'Openers' })
  s = bankA.session
  s = addClip(s, 'bank-a', {
    id: 'cart-a1',
    title: 'Mayor soundbite',
    cueInSec: 0.5,
    cueOutSec: 44.0,
    fadeInSec: 0.1,
    fadeOutSec: 0.5,
    loop: false,
  }).session
  s = addClip(s, 'bank-a', {
    id: 'cart-a2',
    title: 'Theme sting',
    cueInSec: 0,
    cueOutSec: 8.0,
    fadeInSec: 0,
    fadeOutSec: 1.0,
    loop: false,
  }).session
  s = addBank(s, { id: 'bank-b', name: 'Beds' }).session
  s = addClip(s, 'bank-b', {
    id: 'cart-b1',
    title: 'News bed (loop)',
    cueInSec: 0,
    cueOutSec: 60.0,
    fadeInSec: 2.0,
    fadeOutSec: 2.0,
    loop: true,
  }).session
  s = addBank(s, { id: 'guest-slots', name: 'Guest slots' }).session
  return s
}

/** Runs the PT-E scripted show up to the mid-show save point. */
function runToMidShow(): StudioSessionDoc {
  let s = makePtESession()
  s = moveRundownItem(s, 2, 4).session
  s = moveRundownItem(s, 4, 2).session
  s = fireCue(s, 'cart-a2').session // unarmed: rejected + logged
  s = armCue(s, 'cart-a2').session
  s = fireCue(s, 'cart-a2').session
  s = stopCue(s, 'cart-a2').session
  s = startSegment(s, 'rd-1').session
  s = tick(s, 330) // planned 300 -> 30 s over
  s = completeSegment(s, 'rd-1').session
  s = startSegment(s, 'rd-2').session
  s = tick(s, 45)
  s = completeSegment(s, 'rd-2').session
  s = startSegment(s, 'rd-3').session
  s = armCue(s, 'cart-b1').session
  s = fireCue(s, 'cart-b1').session // bed playing under the guest
  return s
}

describe('POD-05 session engine — PT-E port', () => {
  it('reorder moves an item to the end and back, losing and duplicating nothing', () => {
    const s0 = makePtESession()
    const idsBefore = s0.rundown
      .map((item) => item.id)
      .slice()
      .sort()
    const moved = moveRundownItem(s0, 2, 4)
    expect(moved.ok).toBe(true)
    expect(moved.session.rundown.map((item) => item.id).join(',')).toBe('rd-1,rd-2,rd-4,rd-5,rd-3')
    expect(
      moved.session.rundown
        .map((item) => item.id)
        .slice()
        .sort(),
    ).toEqual(idsBefore)
    const back = moveRundownItem(moved.session, 4, 2)
    expect(back.session.rundown.map((item) => item.id).join(',')).toBe('rd-1,rd-2,rd-3,rd-4,rd-5')
    // immutable-style: the input document was not mutated
    expect(s0.rundown.map((item) => item.id).join(',')).toBe('rd-1,rd-2,rd-3,rd-4,rd-5')
  })

  it('an unarmed fire is rejected AND logged, and the clip stays idle', () => {
    const s = makePtESession()
    const result = fireCue(s, 'cart-a2')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not-armed')
    expect(findClip(result.session, 'cart-a2')?.clip.state).toBe('idle')
    expect(
      result.session.log.some(
        (entry) => entry.type === 'cue-fire-rejected' && entry.clipId === 'cart-a2',
      ),
    ).toBe(true)
  })

  it('arm → fire plays, firing consumes the arm, and a second fire is rejected', () => {
    let s = makePtESession()
    const armed = armCue(s, 'cart-a2')
    expect(armed.ok).toBe(true)
    expect(findClip(armed.session, 'cart-a2')?.clip.armed).toBe(true)
    const fired = fireCue(armed.session, 'cart-a2')
    expect(fired.ok).toBe(true)
    expect(findClip(fired.session, 'cart-a2')?.clip.state).toBe('playing')
    expect(findClip(fired.session, 'cart-a2')?.clip.armed).toBe(false)
    s = fired.session
    expect(fireCue(s, 'cart-a2').ok).toBe(false)
  })

  it('chapter markers are emitted on segment/guest start only, at the current elapsed time', () => {
    let s = makePtESession()
    const st1 = startSegment(s, 'rd-1')
    expect(st1.ok).toBe(true)
    expect(st1.chapterEmitted).toBe(true)
    s = st1.session
    expect(s.chapters).toHaveLength(1)
    expect(s.chapters[0].startTime).toBe(0)
    expect(s.chapters[0].title).toBe('Cold open + headlines')
    s = tick(s, 330)
    s = completeSegment(s, 'rd-1').session
    expect(s.chapters).toHaveLength(1) // completing emits no marker
    const st2 = startSegment(s, 'rd-2') // clip-type item
    expect(st2.ok).toBe(true)
    expect(st2.chapterEmitted).toBe(false)
    s = st2.session
    expect(s.chapters).toHaveLength(1)
    s = tick(s, 45)
    s = completeSegment(s, 'rd-2').session
    const st3 = startSegment(s, 'rd-3') // guest item
    expect(st3.chapterEmitted).toBe(true)
    s = st3.session
    expect(s.chapters).toHaveLength(2)
    expect(s.chapters[1].startTime).toBe(375)
  })

  it('rollup math: planned 1215, done +30 s variance mid-show, counts 2/1/2', () => {
    const s = runToMidShow()
    const roll = timingRollup(s)
    expect(roll.plannedTotalSec).toBe(1215)
    expect(roll.doneActualSec).toBe(375)
    expect(roll.donePlannedSec).toBe(345)
    expect(roll.varianceSec).toBe(30)
    expect(roll.counts.done).toBe(2)
    expect(roll.counts.playing).toBe(1)
    expect(roll.counts.pending).toBe(2)
    expect(s.rundown[0].actualSec).toBe(330)
  })

  it('mid-show save → reload is deep-equal and the restored copy stays operational', () => {
    const s = runToMidShow()
    const restored = reloadSession(saveSession(s))
    expect(restored).toEqual(s)
    expect(restored.rundown.find((item) => item.id === 'rd-3')?.status).toBe('playing')
    expect(restored.rundown.filter((item) => item.status === 'done')).toHaveLength(2)
    expect(restored.chapters).toHaveLength(2)
    const bed = findClip(restored, 'cart-b1')?.clip
    expect(bed).toMatchObject({
      state: 'playing',
      loop: true,
      cueInSec: 0,
      cueOutSec: 60,
      fadeInSec: 2,
      fadeOutSec: 2,
    })
    expect(restored.mixer).toEqual(s.mixer)
    const finished = completeSegment(tick(restored, 570), 'rd-3')
    expect(finished.ok).toBe(true)
    expect(finished.session.rundown.find((item) => item.id === 'rd-3')?.actualSec).toBe(570)
  })

  it('restore never auto-plays: playing clips reopen paused (and logged), desk state downgrades', () => {
    const s = runToMidShow() // bed playing, session live
    const restored = restoreSession(s)
    expect(findClip(restored, 'cart-b1')?.clip.state).toBe('paused')
    expect(restored.state).toBe('paused')
    expect(
      restored.log.some(
        (entry) =>
          entry.type === 'session-restored' &&
          Array.isArray(entry.pausedClipIds) &&
          entry.pausedClipIds.includes('cart-b1'),
      ),
    ).toBe(true)
    // The in-progress segment remains completable with correct actual time (PT-E).
    const finished = completeSegment(tick(restored, 570), 'rd-3')
    expect(finished.session.rundown.find((item) => item.id === 'rd-3')?.actualSec).toBe(570)
  })

  it('skip marks a segment skipped without a chapter marker', () => {
    const s = makePtESession()
    const skipped = skipSegment(s, 'rd-5')
    expect(skipped.ok).toBe(true)
    expect(skipped.session.rundown.find((item) => item.id === 'rd-5')?.status).toBe('skipped')
    expect(skipped.session.chapters).toHaveLength(0)
    expect(timingRollup(skipped.session).counts.skipped).toBe(1)
  })

  it('STOP ALL returns every clip to idle and logs the event', () => {
    let s = makePtESession()
    s = armCue(s, 'cart-a1').session
    s = fireCue(s, 'cart-a1').session
    s = armCue(s, 'cart-b1').session
    s = fireCue(s, 'cart-b1').session
    const stopped = stopAll(s)
    for (const bank of stopped.cartwall.banks) {
      for (const clip of bank.clips) expect(clip.state).toBe('idle')
    }
    expect(stopped.log.some((entry) => entry.type === 'stop-all')).toBe(true)
  })

  it('deck reset retains a backup and restore brings the pre-reset clips back', () => {
    let s = makePtESession()
    s = armCue(s, 'cart-a2').session
    s = fireCue(s, 'cart-a2').session // theme sting playing
    const shared = shareDeck(s, 'bank-a')
    expect(shared.ok).toBe(true)
    expect(JSON.parse(shared.deckJson ?? '{}').clips).toHaveLength(2)

    const reset = resetBank(s, 'bank-a')
    expect(reset.ok).toBe(true)
    expect(findClip(reset.session, 'cart-a2')?.clip.state).toBe('idle')
    expect(findClip(reset.session, 'cart-a2')?.clip.armed).toBe(false)
    expect(reset.session.deckBackups?.['bank-a']).toHaveLength(2)
    // the backup survives a save/reload cycle (it lives in the session document)
    const reloaded = reloadSession(saveSession(reset.session))
    expect(reloaded.deckBackups?.['bank-a']).toHaveLength(2)

    const restored = restoreBank(reloaded, 'bank-a')
    expect(restored.ok).toBe(true)
    expect(findClip(restored.session, 'cart-a2')?.clip.state).toBe('playing')
    expect(restoreBank(restored.session, 'bank-b').error).toBe('no-backup')
  })

  it('mixer snapshot set/get round-trips through save/reload', () => {
    const s = makePtESession()
    const mixer = {
      channels: [
        { id: 'host', gainDb: -1.5, muted: true },
        { id: 'clips', gainDb: -9, muted: false },
      ],
      masterGainDb: 0,
      limiterCeilingDb: -1,
    }
    const set = setMixerSnapshot(s, mixer)
    expect(set.ok).toBe(true)
    expect(getMixerSnapshot(set.session)).toEqual(mixer)
    expect(getMixerSnapshot(reloadSession(saveSession(set.session)))).toEqual(mixer)
  })

  it('save validates through the POD-00 parser (an invalid document throws)', () => {
    const s = makePtESession()
    const broken = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    delete broken.showId
    expect(() => saveSession(broken as never)).toThrow()
  })
})

describe('POD-05 OPML — rundown round-trip + conflict guard', () => {
  const opmlSession = (): StudioSessionDoc => {
    let s = createSession({ showId: 'show-opml', showTitle: 'OPML Show' })
    const items = [
      { id: 'sec-1', type: 'section', title: 'Hour 1', plannedSec: 0 },
      { id: 'rd-1', type: 'segment', title: 'Cold open & headlines', plannedSec: 300 },
      { id: 'rd-2', type: 'clip', title: 'Mayor soundbite', plannedSec: 45, clipId: 'cart-a1' },
      {
        id: 'rd-3',
        type: 'link',
        title: 'Notes: https://example.com/?a=1&b=2',
        plannedSec: 30,
        url: 'https://example.com/notes?x=1&y=2',
      },
      { id: 'sec-2', type: 'section', title: 'Hour 2', plannedSec: 0 },
      { id: 'rd-4', type: 'guest', title: 'Guest "Big" interview', plannedSec: 600 },
    ]
    for (const item of items) s = addRundownItem(s, item).session
    return s
  }

  it('rundown → OPML → rundown is an exact round trip (sections nest and flatten)', () => {
    const s = opmlSession()
    const opml = rundownToOpml(s)
    expect(opml).toContain('<opml version="2.0">')
    expect(opmlToRundown(opml)).toEqual(s.rundown)
    // and the exported document re-exports identically (stable serialisation)
    const reimported = importOpmlRundown(s, opml)
    expect(rundownToOpml(reimported)).toBe(opml)
  })

  it('import records the source hash on the session', () => {
    const s = opmlSession()
    const opml = rundownToOpml(s)
    const imported = importOpmlRundown(createSession({ showId: 'show-x', showTitle: 'X' }), opml)
    expect(imported.rundownSourceHash).toBe(hashOpmlContent(opml))
    expect(imported.rundown).toEqual(s.rundown)
    expect(imported.log.some((entry) => entry.type === 'opml-import')).toBe(true)
  })

  it('export refuses to overwrite a target changed since import — never silent — unless forced', () => {
    const s = opmlSession()
    const original = rundownToOpml(s)
    const imported = importOpmlRundown(s, original)

    // Target untouched since import: export proceeds.
    expect(exportOpml(imported, original).ok).toBe(true)
    // No target at all: export proceeds.
    expect(exportOpml(imported, null).ok).toBe(true)

    // Target changed on disk after import: conflict, with both hashes named.
    const changed = original.replace('Cold open', 'Cold open — EDITED ELSEWHERE')
    const refused = exportOpml(imported, changed)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.conflict).toBe(true)
      expect(refused.reason).toBe('target-changed-since-import')
      expect(refused.recordedHash).toBe(hashOpmlContent(original))
      expect(refused.targetHash).toBe(hashOpmlContent(changed))
    }

    // Forced export is explicit and reports itself.
    const forced = exportOpml(imported, changed, { force: true })
    expect(forced.ok).toBe(true)
    if (forced.ok) expect(forced.forced).toBe(true)
  })
})

describe('POD-05 Example Show scaffold (session shape)', () => {
  it('builds a starter session: 5-item rundown, one deck of 3 clips, export-profile placeholder', () => {
    const s = buildExampleSession('show-example', 'Example Show')
    expect(s.rundown).toHaveLength(5)
    expect(s.cartwall.banks).toHaveLength(1)
    expect(s.cartwall.banks[0].clips).toHaveLength(3)
    expect(s.exportProfile).toMatchObject({ status: expect.stringContaining('placeholder') })
    // and the whole document survives the save/reload journal intact
    expect(reloadSession(saveSession(s))).toEqual(s)
  })
})

describe('POD-21 session API ops — drop-marker + recording state (POD-15 gap)', () => {
  const fresh = () => createSession({ showId: 'show-pod21', showTitle: 'POD-21 Show' })

  it('recording-start opens the POD-09 recording state; a second start is refused by name', () => {
    const started = applySessionOperation(fresh(), { op: 'recording-start' })
    expect(started.ok).toBe(true)
    expect(started.recordingState?.status).toBe('recording')
    expect(started.session.state).toBe('recording')
    const again = applySessionOperation(started.session, { op: 'recording-start' })
    expect(again.ok).toBe(false)
    expect(again.error).toBe('already-recording')
  })

  it('drop-marker while recording lands in BOTH the recording markers and the session list', () => {
    const started = applySessionOperation(fresh(), { op: 'recording-start' }).session
    const dropped = applySessionOperation(started, { op: 'drop-marker' })
    expect(dropped.ok).toBe(true)
    expect(dropped.marker).toMatchObject({ number: 1, name: 'Marker 1' })
    expect(getRecordingState(dropped.session)?.markers).toHaveLength(1)
    expect(dropped.session.markers).toHaveLength(1)
    expect(dropped.session.markers?.[0]).toMatchObject({ title: 'Marker 1' })

    const named = applySessionOperation(dropped.session, {
      op: 'drop-marker',
      name: 'Interview starts',
    })
    expect(named.marker).toMatchObject({ number: 2, name: 'Interview starts' })
    expect(getRecordingState(named.session)?.markers).toHaveLength(2)
  })

  it('drop-marker off-record still lands in the session marker list', () => {
    const dropped = applySessionOperation(fresh(), { op: 'drop-marker' })
    expect(dropped.ok).toBe(true)
    expect(dropped.session.markers).toHaveLength(1)
    expect(getRecordingState(dropped.session)).toBeNull()
  })

  it('recording-stop persists the stopped state; unconfirmed stop hits the POD-09 guard; stop when idle is refused', () => {
    const started = applySessionOperation(fresh(), { op: 'recording-start' }).session
    const guarded = applySessionOperation(started, { op: 'recording-stop', confirmed: false })
    expect(guarded.ok).toBe(false)
    expect(guarded.error).toBe('confirm-required')
    expect(getRecordingState(guarded.session)?.status).toBe('recording')

    const stopped = applySessionOperation(started, { op: 'recording-stop' })
    expect(stopped.ok).toBe(true)
    expect(stopped.recordingState?.status).toBe('stopped')
    expect(stopped.session.state).toBe('stopped')

    const idle = applySessionOperation(fresh(), { op: 'recording-stop' })
    expect(idle.ok).toBe(false)
    expect(idle.error).toBe('not-recording')
  })

  it('recording-start in MIXER desk mode surfaces the by-design silent ISO', () => {
    const started = applySessionOperation(fresh(), { op: 'recording-start', deskMode: 'mixer' })
    expect(started.recordingState?.isoSilentByDesign).toBe(true)
    expect(started.recordingState?.isoSilentExplanation).toContain('MIXER mode')
  })
})
