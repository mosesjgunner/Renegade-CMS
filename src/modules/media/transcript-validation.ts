import type { TranscriptSegment } from './contracts'

export const assertTranscriptSegments = (segments: readonly TranscriptSegment[]) => {
  let previousEnd = 0
  for (const segment of segments) {
    if (
      !Number.isFinite(segment.startSeconds) ||
      !Number.isFinite(segment.endSeconds) ||
      segment.startSeconds < previousEnd ||
      segment.endSeconds < segment.startSeconds
    )
      throw new Error('Transcript segments must be ordered and have non-negative durations.')
    previousEnd = segment.endSeconds
  }
}
