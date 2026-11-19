/**
 * Podcast Studio contracts (POD-00) — versioned schemas shared by every
 * later prompt in the Native Podcast Studio program.
 *
 * Plain TypeScript types plus runtime `parseX()` / `assertX()` validators
 * that throw `Error`, following `src/modules/media/contracts.ts`. No zod.
 * All parsers preserve unknown fields, so parse -> serialize round trips
 * are lossless for the prototype fixtures they were derived from.
 */
export * from './session'
export * from './edl'
export * from './track-manifest'
export * from './bundle'
