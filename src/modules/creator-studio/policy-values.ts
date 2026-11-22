export const creatorCapabilities = [
  'media.upload',
  'media.edit-own',
  'media.publish-own',
  'media.submit',
  'portfolio.manage-own',
  'live.host',
  'live.join-stage',
  'room.moderate-own',
  'provider.connect',
  'commerce.manage-own',
  'space.manage-own',
  'content.draft-own',
] as const

export const creatorQuotaKeys = [
  'bytes',
  'uploadCount',
  'concurrentRecordings',
  'processingMinutes',
  'liveMinutes',
  'audienceCap',
  'exportJobs',
  'retentionDays',
] as const
