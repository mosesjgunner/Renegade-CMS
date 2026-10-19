import { createLocalReq, type Payload } from 'payload'
import { transactionPayload } from '../core/transaction-payload'

/** Atomically persist release scheduling and its worker job, or email rows and their jobs. */
export async function releaseTransaction<T>(payload: Payload, action: (tx: Payload) => Promise<T>) {
  // Unit doubles have no database. Actual adapters must provide transactions.
  if (!payload.db) return action(payload)
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Release operation requires transactional storage.')
  const req = await createLocalReq({}, payload)
  req.transactionID = transactionID
  try {
    const result = await action(transactionPayload(payload, req))
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
