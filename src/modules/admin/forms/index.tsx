'use client'

import {
  cloneElement,
  useId,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'

import type { SaveState } from './save-state'

/**
 * UXI-08 — shared forms / errors / save-state kit for operator surfaces.
 *
 * The standard (see docs/rc/install-ux/tasks/UXI-08.md):
 * - Every field error is linked to its field (aria-describedby +
 *   aria-invalid) and says what happened and how to fix it.
 * - A summary separates things the operator can fix (input errors,
 *   each linking to its field) from things they cannot (service
 *   failures), and announces itself with role="alert".
 * - "Saved" renders only from a server acknowledgment (useSaveState).
 * - A disabled primary action always shows its reason inline, next
 *   to the action — never tooltip-only — plus the repair when one exists.
 * - Destructive actions confirm with scope + consequence in plain
 *   language, and offer undo after completion where the surface
 *   supplies a working undo.
 */

// ---------------------------------------------------------------------------
// Field wiring helpers

export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`
}
export function fieldHintId(fieldId: string): string {
  return `${fieldId}-hint`
}

/** aria props for a control inside a FormField (or a hand-rolled field). */
export function fieldAriaProps(
  fieldId: string,
  options?: { hint?: ReactNode; error?: string | null },
): { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true } {
  const describedBy = [
    options?.hint ? fieldHintId(fieldId) : null,
    options?.error ? fieldErrorId(fieldId) : null,
  ]
    .filter(Boolean)
    .join(' ')
  return {
    id: fieldId,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(options?.error ? { 'aria-invalid': true as const } : {}),
  }
}

export function FieldError({ fieldId, message }: { fieldId: string; message: string }) {
  return (
    <p id={fieldErrorId(fieldId)} style={{ margin: '4px 0 0', fontSize: 12, color: '#b91c1c' }}>
      {message}
    </p>
  )
}

type FieldRenderProps = ReturnType<typeof fieldAriaProps>

/**
 * Label + hint + error wrapper. Children are either a render prop
 * receiving the aria wiring for the control, or a plain node (the
 * caller then applies `fieldAriaProps` itself).
 */
export function FormField({
  fieldId,
  label,
  hint,
  error,
  required,
  children,
  style,
  labelStyle,
}: {
  fieldId: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  children: ReactNode | ((props: FieldRenderProps) => ReactNode)
  style?: CSSProperties
  labelStyle?: CSSProperties
}) {
  const ariaProps = fieldAriaProps(fieldId, { hint, error })
  return (
    <div style={style}>
      <label
        htmlFor={fieldId}
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 4,
          ...labelStyle,
        }}
      >
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: '#b91c1c' }}>
            {' '}
            *
          </span>
        ) : null}
      </label>
      {typeof children === 'function' ? children(ariaProps) : children}
      {hint ? (
        <p id={fieldHintId(fieldId)} style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
          {hint}
        </p>
      ) : null}
      {error ? <FieldError fieldId={fieldId} message={error} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Problem summary

export type FormProblem =
  | {
      kind: 'input'
      /** DOM id of the field control; the summary links to it. */
      fieldId: string
      label: string
      /** What happened + the fix, in one sentence. */
      message: string
    }
  | {
      kind: 'service'
      /** What happened + the next action, in one sentence. */
      message: string
    }

export function FormStatusSummary({
  problems,
  testId,
}: {
  problems: FormProblem[]
  testId?: string
}) {
  if (!problems.length) return null
  const inputProblems = problems.filter(
    (problem): problem is Extract<FormProblem, { kind: 'input' }> => problem.kind === 'input',
  )
  const serviceProblems = problems.filter(
    (problem): problem is Extract<FormProblem, { kind: 'service' }> => problem.kind === 'service',
  )
  return (
    <>
      {inputProblems.length ? (
        <div
          role="alert"
          data-testid={testId}
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#7f1d1d',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>
            {inputProblems.length === 1
              ? '1 field needs attention'
              : `${inputProblems.length} fields need attention`}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {inputProblems.map((problem) => (
              <li key={`${problem.fieldId}:${problem.message}`}>
                <a href={`#${problem.fieldId}`} style={{ color: '#b91c1c', fontWeight: 600 }}>
                  {problem.label}
                </a>
                {': '}
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {serviceProblems.map((problem) => (
        <div
          key={problem.message}
          role="alert"
          data-testid={inputProblems.length ? undefined : testId}
          style={{
            background: '#fffbeb',
            border: '1px solid #f59e0b',
            color: '#78350f',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          <strong>Something went wrong outside this form:</strong> {problem.message}
        </div>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Save state

const SAVE_STATE_TEXT: Record<SaveState['status'], string> = {
  idle: 'Not saved yet',
  saving: 'Saving… — not saved until the server confirms',
  saved: 'Saved',
  offline: 'Offline — not saved',
  conflict: 'Not saved — changed elsewhere',
  error: 'Save failed — not saved',
}

export function SaveStateIndicator({
  state,
  onRetry,
  onResolveConflict,
  resolveConflictLabel = 'Reload to see the latest version',
}: {
  state: SaveState
  /** Shown for error/offline states when the surface can retry the same save. */
  onRetry?: () => void
  /** Shown for conflict: the call-site's compare/reload affordance. */
  onResolveConflict?: () => void
  resolveConflictLabel?: string
}) {
  if (state.status === 'idle') {
    return (
      <p
        role="status"
        aria-live="polite"
        data-save-state="idle"
        style={{ fontSize: 12, color: '#64748b' }}
      >
        {SAVE_STATE_TEXT.idle}
      </p>
    )
  }
  if (state.status === 'saved') {
    return (
      <p
        role="status"
        aria-live="polite"
        data-save-state="saved"
        style={{ fontSize: 12, color: '#15803d' }}
      >
        Saved — confirmed by the server at {new Date(state.acknowledgedAt).toLocaleTimeString()}
        {state.version !== undefined ? ` (version ${String(state.version)})` : ''}
      </p>
    )
  }
  if (state.status === 'saving') {
    return (
      <p
        role="status"
        aria-live="polite"
        data-save-state="saving"
        style={{ fontSize: 12, color: '#475569' }}
      >
        {SAVE_STATE_TEXT.saving}
      </p>
    )
  }
  const isAlert = state.status === 'conflict' || state.status === 'error'
  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live="polite"
      data-save-state={state.status}
      style={{ fontSize: 12, color: '#b91c1c' }}
    >
      <p style={{ margin: 0 }}>
        {state.status === 'offline'
          ? state.message
          : state.status === 'conflict'
            ? `This was changed somewhere else, so your save was not applied. ${state.message} Your work is still here — compare it with the latest version before retrying.`
            : `${state.message} Your work is still here — nothing was lost.`}
      </p>
      {state.status === 'conflict' && onResolveConflict ? (
        <button type="button" onClick={onResolveConflict} style={{ marginTop: 6 }}>
          {resolveConflictLabel}
        </button>
      ) : null}
      {(state.status === 'error' || state.status === 'offline') && onRetry ? (
        <button type="button" onClick={onRetry} style={{ marginTop: 6 }}>
          Retry save
        </button>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Disabled with reason

/**
 * Wraps a single primary-action element. When `disabled`, the reason
 * renders inline beside the action (never tooltip-only) and is linked
 * from the control via aria-describedby; `repair` renders the fix —
 * a link or button — right after the reason.
 */
export function DisabledWithReason({
  disabled,
  reason,
  repair,
  children,
}: {
  disabled: boolean
  reason?: string
  repair?: ReactNode
  children: ReactElement
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const reasonId = `disabled-reason-${reactId}`
  const showReason = disabled && Boolean(reason)
  const childProps = children.props as { 'aria-describedby'?: string }
  const control = showReason
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        disabled: true,
        'aria-describedby': [childProps['aria-describedby'], reasonId].filter(Boolean).join(' '),
      })
    : children
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {control}
      {showReason ? (
        <span id={reasonId} style={{ fontSize: 12, color: '#64748b' }}>
          {reason}
          {repair ? <> {repair}</> : null}
        </span>
      ) : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Destructive confirmation

/**
 * Confirmation for a destructive action, stating scope + consequence
 * in plain language before anything runs. When the surface supplies
 * `undo`, completion offers that undo inline instead of ending at the
 * pre-warning. Without `undo`, completion is stated as final.
 */
export function ConfirmDestructive({
  triggerLabel,
  scope,
  consequence,
  confirmLabel = 'Yes, do it',
  cancelLabel = 'Cancel',
  onConfirm,
  undo,
  disabled,
  defaultOpen = false,
  'aria-describedby': ariaDescribedBy,
}: {
  triggerLabel: string
  /** What will be affected, e.g. "3 selected products". */
  scope: string
  /** What happens, e.g. "They stop appearing in the store…". */
  consequence: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => Promise<void> | void
  /** A working undo for after completion, where the engine supports one. */
  undo?: { label: string; onUndo: () => Promise<void> | void }
  disabled?: boolean
  defaultOpen?: boolean
  /** Forwarded to the trigger button (DisabledWithReason links its reason this way). */
  'aria-describedby'?: string
}) {
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'busy' | 'done' | 'error'>(
    defaultOpen ? 'confirming' : 'idle',
  )
  const [error, setError] = useState('')

  if (phase === 'done') {
    return (
      <span role="status" style={{ fontSize: 13 }}>
        Done — {scope} affected.{' '}
        {undo ? (
          <button
            type="button"
            onClick={() => {
              void (async () => {
                await undo.onUndo()
                setPhase('idle')
              })()
            }}
          >
            {undo.label}
          </button>
        ) : (
          'This cannot be undone from here.'
        )}
      </span>
    )
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        onClick={() => setPhase('confirming')}
      >
        {triggerLabel}
      </button>
    )
  }

  return (
    <span
      role="alertdialog"
      aria-label={scope}
      style={{
        display: 'inline-flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        fontSize: 13,
      }}
    >
      <span>
        <strong>{scope}.</strong> {consequence}
      </span>
      <button
        type="button"
        disabled={phase === 'busy'}
        onClick={() => {
          void (async () => {
            setPhase('busy')
            setError('')
            try {
              await onConfirm()
              setPhase('done')
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'That did not complete. Nothing was changed — try again.',
              )
              setPhase('error')
            }
          })()
        }}
      >
        {phase === 'busy' ? 'Working…' : confirmLabel}
      </button>
      <button type="button" disabled={phase === 'busy'} onClick={() => setPhase('idle')}>
        {cancelLabel}
      </button>
      {phase === 'error' && error ? (
        <span role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </span>
      ) : null}
    </span>
  )
}
