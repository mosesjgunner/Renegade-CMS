/**
 * POD-06 — Podcast Studio capture layer (POD-REQ-16/17/18).
 * Pure cores first, thin browser adapters last — adapters are UNVERIFIED
 * against real browsers/devices until the rig tests in the POD-06 handoff run.
 */
export * from './capture'
export * from './devices'
export * from './journal'
export * from './levels'
export * from './normalize'
export * from './upload-bridge'
// POD-23: `./upload-transport` (the server-only `createMediaUploadTransport`
// factory) is deliberately NOT exported here — this barrel must stay free of
// value imports into the Payload/media server graph so browser-reachable
// importers of the bridge never trace into `sharp`/`fs`. Server callers
// import `capture/upload-transport` directly.
export * from './capture-session'
