import type { Payload, PayloadRequest } from 'payload'

/** Bind Local API reads, writes and queued jobs to one actual database transaction. */
export function transactionPayload(payload: Payload, req: PayloadRequest): Payload {
  const operations = new Set([
    'find',
    'findByID',
    'count',
    'create',
    'update',
    'delete',
    'findGlobal',
    'updateGlobal',
  ])
  const jobs = new Proxy(payload.jobs, {
    get(target, property) {
      const value = Reflect.get(target, property)
      if (property === 'queue')
        return (input: Record<string, unknown>) => value.call(target, { ...input, req })
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return new Proxy(payload, {
    get(target, property) {
      if (property === 'jobs') return jobs
      const value = Reflect.get(target, property)
      if (typeof value !== 'function') return value
      if (!operations.has(String(property))) return value.bind(target)
      return (input: Record<string, unknown>) =>
        value.call(target, {
          ...input,
          req: { ...req, ...((input.req as object) ?? {}), transactionID: req.transactionID },
        })
    },
  })
}
