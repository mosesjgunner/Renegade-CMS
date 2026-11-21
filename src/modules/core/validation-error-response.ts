import type { AfterErrorHook } from 'payload'

/**
 * RC3-03 / F1 — restore per-field validation errors to REST responses.
 *
 * Payload's `formatErrors` attaches a ValidationError's per-field list
 * (`data.errors[]` with `path` + `message`) to the response only when
 * the thrown error is an `instanceof` the formatter's own
 * ValidationError class. In this build's module graph that identity
 * check fails (the config is bundled into more than one module graph —
 * the same build shape Performance lane 08 measured), so every
 * validation failure reaches the admin as `{ errors: [{ message }] }`:
 * prose naming the field, but no field path for the form to render
 * against. The editor can only toast it; no field error, no
 * aria-invalid, no focus target (RC2-FIXALL-DEBT23 finding F1).
 *
 * This root `afterError` hook repairs the serialization at the seam
 * Payload provides for it: when the original error is a
 * ValidationError carrying a per-field list and the formatted result
 * lost that list, the result is rebuilt in exactly the shape
 * `formatErrors` would have produced.
 *
 * Detection cannot use class identity (that check is the broken one)
 * or the class name either: the production bundle minifies class
 * names, and the server's own error log shows the thrown error
 * arriving with `name: "s"` (measured, RC3-03). What survives is the
 * error's structural fingerprint, which is also what the response
 * consumer keys on: an operational 400 whose `data.errors` is a
 * non-empty list of `{ path, message }` entries. Everything else is
 * left untouched: authentication/authorization errors keep their
 * semantics and internal errors keep their generic public response.
 */

type ErrorResultLike = {
  errors: Array<{
    data?: Record<string, unknown>
    message?: string
    name?: string
  }>
}

type ValidationErrorLike = {
  data?: { errors?: unknown }
  isOperational?: unknown
  message?: unknown
  name?: unknown
  status?: unknown
}

/**
 * The per-field list when every entry carries a path and a message —
 * the shape Payload's validator produces and the admin form consumes.
 */
const fieldErrorList = (error: ValidationErrorLike): Array<Record<string, unknown>> | null => {
  const list = error.data?.errors
  if (!Array.isArray(list) || list.length === 0) return null
  const everyEntryShaped = list.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { path?: unknown }).path === 'string' &&
      (entry as { path: string }).path.length > 0 &&
      typeof (entry as { message?: unknown }).message === 'string',
  )
  return everyEntryShaped ? (list as Array<Record<string, unknown>>) : null
}

const isValidationErrorShaped = (error: ValidationErrorLike): boolean => {
  if (!fieldErrorList(error)) return false
  // Unminified graphs keep the class name; the production bundle does
  // not, so there the operational-400 fingerprint decides.
  if (error.name === 'ValidationError') return true
  return error.status === 400 && error.isOperational === true
}

/**
 * The restored response, or undefined when the result must pass
 * through unchanged: not validation-shaped, no per-field list to
 * restore, or the list already survived formatting.
 */
export function restoreValidationFieldErrors(
  error: unknown,
  result: ErrorResultLike | undefined,
): ErrorResultLike | undefined {
  if (!result || typeof error !== 'object' || error === null) return undefined
  const candidate = error as ValidationErrorLike
  if (!isValidationErrorShaped(candidate)) return undefined
  const alreadyStructured = (result.errors ?? []).some((entry) =>
    Array.isArray((entry?.data as { errors?: unknown } | undefined)?.errors),
  )
  if (alreadyStructured) return undefined
  return {
    errors: [
      {
        name: 'ValidationError',
        data: candidate.data as Record<string, unknown>,
        message: typeof candidate.message === 'string' ? candidate.message : '',
      },
    ],
  }
}

export const restoreValidationFieldErrorsHook: AfterErrorHook = ({ error, result }) => {
  const restored = restoreValidationFieldErrors(error, result as ErrorResultLike | undefined)
  return restored ? { response: restored } : undefined
}
