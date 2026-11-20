import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  classifySaveFailure,
  initialSaveState,
  SaveConflictError,
  saveHttpError,
  saveStateReducer,
  type SaveState,
} from '@/modules/admin/forms/save-state'
import {
  ConfirmDestructive,
  DisabledWithReason,
  FormField,
  FormStatusSummary,
  SaveStateIndicator,
} from '@/modules/admin/forms'

function saving(attempt = 1): SaveState {
  return saveStateReducer(initialSaveState, { type: 'SAVE_START', at: 1000 + attempt })
}

describe('UXI-08 save-state machine', () => {
  it('starts idle, with no acknowledged save', () => {
    expect(initialSaveState).toEqual({ status: 'idle' })
  })

  it('reaches saved only through SAVE_ACK while a save is in flight', () => {
    const acked = saveStateReducer(saving(), { type: 'SAVE_ACK', at: 2000, version: 3 })
    expect(acked).toEqual({ status: 'saved', acknowledgedAt: 2000, version: 3 })
  })

  it('INVARIANT: SAVE_ACK from idle is ignored — no saved state without an in-flight save', () => {
    expect(saveStateReducer(initialSaveState, { type: 'SAVE_ACK', at: 2000 })).toEqual({
      status: 'idle',
    })
  })

  it('INVARIANT: a stale second SAVE_ACK after completion cannot re-stamp the save time', () => {
    const acked = saveStateReducer(saving(), { type: 'SAVE_ACK', at: 2000 })
    expect(saveStateReducer(acked, { type: 'SAVE_ACK', at: 9999 })).toEqual(acked)
  })

  it('INVARIANT: starting a new save leaves the saved state immediately', () => {
    const acked = saveStateReducer(saving(), { type: 'SAVE_ACK', at: 2000 })
    const next = saveStateReducer(acked, { type: 'SAVE_START', at: 3000 })
    expect(next.status).toBe('saving')
  })

  it('failure lands in error, from which a retry can save', () => {
    const failed = saveStateReducer(saving(), {
      type: 'SAVE_ERROR',
      message: 'Database unavailable. Try again.',
    })
    expect(failed).toEqual({
      status: 'error',
      message: 'Database unavailable. Try again.',
      retryable: true,
    })
    const retried = saveStateReducer(saveStateReducer(failed, { type: 'SAVE_START', at: 4000 }), {
      type: 'SAVE_ACK',
      at: 5000,
    })
    expect(retried.status).toBe('saved')
  })

  it('failure events outside an in-flight save are ignored', () => {
    expect(saveStateReducer(initialSaveState, { type: 'SAVE_ERROR', message: 'nope' })).toEqual({
      status: 'idle',
    })
    expect(saveStateReducer(initialSaveState, { type: 'SAVE_CONFLICT', message: 'nope' })).toEqual({
      status: 'idle',
    })
  })

  it('409 lands in conflict with the server version', () => {
    const conflicted = saveStateReducer(saving(), {
      type: 'SAVE_CONFLICT',
      message: 'The item has been updated by another user.',
      serverVersion: 7,
    })
    expect(conflicted).toEqual({
      status: 'conflict',
      message: 'The item has been updated by another user.',
      serverVersion: 7,
    })
  })

  it('offline lands in offline, distinct from error', () => {
    const offline = saveStateReducer(saving(), {
      type: 'SAVE_OFFLINE',
      at: 2500,
      message: 'You appear to be offline.',
    })
    expect(offline.status).toBe('offline')
  })

  it('RESET returns to idle', () => {
    const acked = saveStateReducer(saving(), { type: 'SAVE_ACK', at: 2000 })
    expect(saveStateReducer(acked, { type: 'RESET' })).toEqual({ status: 'idle' })
  })
})

describe('UXI-08 classifySaveFailure', () => {
  it('classifies an HTTP 409 error as conflict', () => {
    const failure = classifySaveFailure(saveHttpError(409, 'Sequence mismatch.'), {
      online: true,
    })
    expect(failure.kind).toBe('conflict')
    expect(failure.message).toBe('Sequence mismatch.')
  })

  it('classifies SaveConflictError as conflict and keeps the server version', () => {
    const failure = classifySaveFailure(new SaveConflictError('Changed elsewhere.', 12), {
      online: true,
    })
    expect(failure).toMatchObject({ kind: 'conflict', serverVersion: 12 })
  })

  it('classifies a network failure while offline as offline, not error', () => {
    const failure = classifySaveFailure(new TypeError('Failed to fetch'), { online: false })
    expect(failure.kind).toBe('offline')
    expect(failure.message).toContain('offline')
  })

  it('classifies other failures as error with the original message', () => {
    const failure = classifySaveFailure(new Error('Database unavailable.'), { online: true })
    expect(failure).toEqual({ kind: 'error', message: 'Database unavailable.' })
  })

  it('conflict wins over offline (a 409 is a definitive server answer)', () => {
    const failure = classifySaveFailure(saveHttpError(409, 'Conflict.'), { online: false })
    expect(failure.kind).toBe('conflict')
  })
})

describe('UXI-08 form kit components', () => {
  it('FormField links label, hint and error to the control via aria', () => {
    const html = renderToStaticMarkup(
      <FormField
        fieldId="subject"
        label="Subject Line"
        hint="Shown in inboxes."
        error="Subject is empty — add a subject line, then save again."
      >
        {(props) => <input type="text" {...props} />}
      </FormField>,
    )
    expect(html).toContain('for="subject"')
    expect(html).toContain('id="subject"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="subject-hint subject-error"')
    expect(html).toContain('id="subject-error"')
    expect(html).toContain('Subject is empty — add a subject line, then save again.')
  })

  it('FormField without an error does not mark the control invalid', () => {
    const html = renderToStaticMarkup(
      <FormField fieldId="subject" label="Subject Line">
        {(props) => <input type="text" {...props} />}
      </FormField>,
    )
    expect(html).not.toContain('aria-invalid')
    expect(html).not.toContain('-error')
  })

  it('FormStatusSummary links input errors to fields and separates service failures', () => {
    const html = renderToStaticMarkup(
      <FormStatusSummary
        problems={[
          {
            kind: 'input',
            fieldId: 'subject',
            label: 'Subject Line',
            message: 'Subject is empty — add a subject line, then save again.',
          },
          { kind: 'service', message: 'The mail service did not answer. Try again in a moment.' },
        ]}
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('1 field needs attention')
    expect(html).toContain('href="#subject"')
    expect(html).toContain('Something went wrong outside this form:')
    expect(html).toContain('The mail service did not answer.')
  })

  it('FormStatusSummary renders nothing when there are no problems', () => {
    expect(renderToStaticMarkup(<FormStatusSummary problems={[]} />)).toBe('')
  })

  it('SaveStateIndicator says Saved only for the saved state, with the ack time', () => {
    const saved = renderToStaticMarkup(
      <SaveStateIndicator state={{ status: 'saved', acknowledgedAt: 2000, version: 3 }} />,
    )
    expect(saved).toContain('data-save-state="saved"')
    expect(saved).toContain('confirmed by the server')
    expect(saved).toContain('version 3')

    const idle = renderToStaticMarkup(<SaveStateIndicator state={{ status: 'idle' }} />)
    expect(idle).toContain('Not saved yet')
    expect(idle).not.toContain('confirmed by the server')

    const savingHtml = renderToStaticMarkup(
      <SaveStateIndicator state={{ status: 'saving', attempt: 1, startedAt: 1000 }} />,
    )
    expect(savingHtml).toContain('not saved until the server confirms')
  })

  it('SaveStateIndicator conflict state explains and keeps the work', () => {
    const html = renderToStaticMarkup(
      <SaveStateIndicator
        state={{ status: 'conflict', message: 'Sequence mismatch.', serverVersion: 7 }}
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('changed somewhere else')
    expect(html).toContain('Your work is still here')
  })

  it('DisabledWithReason renders the reason inline and links it to the disabled control', () => {
    const html = renderToStaticMarkup(
      <DisabledWithReason disabled reason="Select at least one product first.">
        <button type="button">Archive selected</button>
      </DisabledWithReason>,
    )
    expect(html).toContain('disabled')
    expect(html).toContain('Select at least one product first.')
    expect(html).toMatch(/aria-describedby="disabled-reason-[^"]+"/)
    expect(html).toMatch(/id="disabled-reason-[^"]+"/)
  })

  it('DisabledWithReason renders no reason when the action is enabled', () => {
    const html = renderToStaticMarkup(
      <DisabledWithReason disabled={false} reason="Select at least one product first.">
        <button type="button">Archive selected</button>
      </DisabledWithReason>,
    )
    expect(html).not.toContain('Select at least one product first.')
    expect(html).not.toContain('disabled')
  })

  it('ConfirmDestructive states scope and consequence before confirming', () => {
    const html = renderToStaticMarkup(
      <ConfirmDestructive
        triggerLabel="Archive selected"
        scope="2 selected products"
        consequence="They stop appearing in the store."
        onConfirm={() => undefined}
        defaultOpen
      />,
    )
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('2 selected products')
    expect(html).toContain('They stop appearing in the store.')
    expect(html).toContain('Yes, do it')
    expect(html).toContain('Cancel')
  })

  it('ConfirmDestructive closed state is just the trigger', () => {
    const html = renderToStaticMarkup(
      <ConfirmDestructive
        triggerLabel="Archive selected"
        scope="2 selected products"
        consequence="They stop appearing in the store."
        onConfirm={() => undefined}
      />,
    )
    expect(html).toContain('Archive selected')
    expect(html).not.toContain('alertdialog')
  })
})
