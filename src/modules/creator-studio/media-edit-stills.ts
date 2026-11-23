import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import sharp from 'sharp'
import type { AppConfig } from '../core/config'
import { readBoundedUploadBody, sha256, withUploadLock } from '../media/upload-staging'
import { MediaWorkflowError, persistReviewedCreatorMedia } from '../media/workflow'
import { relationId, type SubmissionActor } from './submission-targets'
import {
  editAccessOptions,
  editUsage,
  ownEditProject,
  ownedEditSource,
} from './media-edit-projects'

export async function saveEditedStill(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  projectId: string,
  assetId: string,
  request: Request,
) {
  return withUploadLock(payload, `creator-edit:${projectId}`, async () => {
    const project = await ownEditProject(payload, actor, projectId)
    const { asset, dependency } = await ownedEditSource(payload, actor, assetId)
    if (asset.kind !== 'image') throw new MediaWorkflowError('Choose a still image.')
    const limit = Math.min(8 * 1024 * 1024, config.storage.maxUploadBytes)
    const bytes = await readBoundedUploadBody(request, limit)
    const format = new Map([
      ['image/png', 'png'],
      ['image/jpeg', 'jpeg'],
      ['image/webp', 'webp'],
    ]).get(request.headers.get('content-type') ?? '')
    if (!format) throw new MediaWorkflowError('Choose PNG, JPEG, or WebP.')
    const encoder = sharp(bytes, { limitInputPixels: 16_777_216, failOn: 'warning' }).timeout({
      seconds: 8,
    })
    const output = await (async () => {
      try {
        const metadata = await encoder.metadata()
        if (metadata.format !== format || (metadata.pages ?? 1) !== 1) throw new Error()
        return await encoder
          .toFormat(format as 'png' | 'jpeg' | 'webp')
          .toBuffer({ resolveWithObject: true })
      } catch {
        throw new MediaWorkflowError('The edited still could not be decoded.', 422)
      }
    })()
    if (output.data.length > limit) throw new MediaWorkflowError('Edited still is too large.', 413)
    const checksum = sha256(output.data)
    const source = `creator-still:${projectId}:${assetId}:${dependency.checksum}:${checksum}`
    const {
      docs: [existing],
    } = await payload.find({
      collection: 'media-assets',
      ...editAccessOptions,
      limit: 1,
      where: {
        and: [
          { site: { equals: actor.siteId } },
          { owner: { equals: actor.memberId } },
          { source: { equals: source } },
        ],
      },
    })
    let id = existing?.id
    if (!id) {
      const count = await payload.count({
        collection: 'media-assets',
        overrideAccess: true,
        where: {
          and: [
            { site: { equals: actor.siteId } },
            { owner: { equals: actor.memberId } },
            { source: { like: `creator-still:${projectId}:` } },
          ],
        },
      })
      if (count.totalDocs >= 24)
        throw new MediaWorkflowError('This project has reached its still edit limit.', 409)
      const directory = await mkdtemp(path.join(os.tmpdir(), 'renegade-edited-still-'))
      try {
        const filename = path.join(directory, 'still')
        const extension = format === 'jpeg' ? 'jpg' : format
        await writeFile(filename, output.data, { mode: 0o600 })
        const saved = await persistReviewedCreatorMedia(
          payload,
          config,
          {
            user: { member: actor.memberId },
            scope: { kind: 'site', siteId: actor.siteId },
            title: `${asset.title.slice(0, 150)} · edited still`,
            originalFilename: `still.${extension}`,
          },
          { filename, size: output.data.length, checksum },
          {
            kind: 'image',
            mimeType: `image/${format}`,
            extension,
            source,
            private: true,
            width: output.info.width,
            height: output.info.height,
          },
        )
        id = relationId(saved.id)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
    if (existing?.rightsStatus !== 'pending')
      await payload.update({
        collection: 'media-assets',
        id,
        ...editAccessOptions,
        data: { rightsStatus: 'pending' },
      })
    await editUsage(payload, actor, projectId, assetId, 'source')
    await editUsage(payload, actor, projectId, id, 'still', project.revision)
    return { id }
  })
}
