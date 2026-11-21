import { ValidationError } from 'payload'
import { describe, expect, it } from 'vitest'

import { restoreValidationFieldErrors } from '../../src/modules/core/validation-error-response'

/**
 * RC3-03 / F1: Payload's formatErrors only attaches a ValidationError's
 * per-field list when its `instanceof` check passes, and in this
 * build's module graph it does not — responses arrive as prose only.
 * The afterError repair rebuilds the exact shape formatErrors would
 * have produced, and leaves every other error untouched.
 */
describe('restoreValidationFieldErrors', () => {
  const proseOnlyResult = { errors: [{ message: 'The following field is invalid: title' }] }

  it('restores the per-field list for a real Payload ValidationError', () => {
    const error = new ValidationError({
      errors: [{ message: 'This field is required.', path: 'title' }],
    } as never)
    const restored = restoreValidationFieldErrors(error, proseOnlyResult)
    expect(restored?.errors).toHaveLength(1)
    expect(restored?.errors[0]?.name).toBe('ValidationError')
    expect(restored?.errors[0]?.message).toContain('title')
    const data = restored?.errors[0]?.data as { errors: Array<{ path: string }> }
    expect(data.errors.map((entry) => entry.path)).toEqual(['title'])
  })

  it('restores nested paths verbatim', () => {
    const error = new ValidationError({
      errors: [{ message: 'This field is required.', path: 'correctionNotices.0.label' }],
    } as never)
    const restored = restoreValidationFieldErrors(error, proseOnlyResult)
    const data = restored?.errors[0]?.data as { errors: Array<{ path: string }> }
    expect(data.errors[0]?.path).toBe('correctionNotices.0.label')
  })

  it('restores the production-bundle shape, where the class name is minified away', () => {
    // Measured on the RC3-03 rig: the served production build logs the
    // thrown ValidationError with `name: "s"` — Turbopack minifies the
    // class name ExtendableError derives `name` from. The structural
    // fingerprint (operational 400 + path/message field list) remains.
    const minified = Object.assign(new Error('The following field is invalid: Content Type'), {
      name: 's',
      status: 400,
      isOperational: true,
      isPublic: true,
      data: {
        collection: 'content',
        errors: [
          { label: 'Content Type', message: 'This field is required.', path: 'contentType' },
        ],
      },
    })
    const restored = restoreValidationFieldErrors(minified, proseOnlyResult)
    const data = restored?.errors[0]?.data as { errors: Array<{ path: string }> }
    expect(data.errors.map((entry) => entry.path)).toEqual(['contentType'])
  })

  it('requires the operational marker when the class name is absent', () => {
    const unmarked = Object.assign(new Error('invalid'), {
      name: 's',
      status: 400,
      data: { errors: [{ message: 'This field is required.', path: 'title' }] },
    })
    expect(restoreValidationFieldErrors(unmarked, proseOnlyResult)).toBeUndefined()
    const wrongStatus = Object.assign(new Error('invalid'), {
      name: 's',
      status: 422,
      isOperational: true,
      data: { errors: [{ message: 'This field is required.', path: 'title' }] },
    })
    expect(restoreValidationFieldErrors(wrongStatus, proseOnlyResult)).toBeUndefined()
    const entryMissingMessage = Object.assign(new Error('invalid'), {
      name: 's',
      status: 400,
      isOperational: true,
      data: { errors: [{ path: 'title' }] },
    })
    expect(restoreValidationFieldErrors(entryMissingMessage, proseOnlyResult)).toBeUndefined()
  })

  it('leaves non-validation errors untouched', () => {
    const apiError = Object.assign(new Error('You do not have permission.'), {
      name: 'APIError',
      status: 403,
      data: { errors: [{ path: 'title', message: 'nope' }] },
    })
    expect(restoreValidationFieldErrors(apiError, proseOnlyResult)).toBeUndefined()
    expect(restoreValidationFieldErrors(new Error('boom'), proseOnlyResult)).toBeUndefined()
  })

  it('leaves a result that already carries field data untouched', () => {
    const error = new ValidationError({
      errors: [{ message: 'This field is required.', path: 'title' }],
    } as never)
    const structured = {
      errors: [
        {
          name: 'ValidationError',
          data: { errors: [{ path: 'title', message: 'This field is required.' }] },
          message: 'The following field is invalid: title',
        },
      ],
    }
    expect(restoreValidationFieldErrors(error, structured)).toBeUndefined()
  })

  it('does nothing without a field list carrying a path', () => {
    const noData = Object.assign(new Error('invalid'), { name: 'ValidationError' })
    expect(restoreValidationFieldErrors(noData, proseOnlyResult)).toBeUndefined()
    const noPaths = Object.assign(new Error('invalid'), {
      name: 'ValidationError',
      data: { errors: [{ message: 'no path here' }] },
    })
    expect(restoreValidationFieldErrors(noPaths, proseOnlyResult)).toBeUndefined()
    const empty = Object.assign(new Error('invalid'), {
      name: 'ValidationError',
      data: { errors: [] },
    })
    expect(restoreValidationFieldErrors(empty, proseOnlyResult)).toBeUndefined()
  })

  it('does nothing without a result (GraphQL context)', () => {
    const error = new ValidationError({
      errors: [{ message: 'This field is required.', path: 'title' }],
    } as never)
    expect(restoreValidationFieldErrors(error, undefined)).toBeUndefined()
  })
})
