# CMoS Image Editor Architecture

## Integration boundary

Media Library and asset detail actions open `ImageEditorModal`. The modal owns the CMoS workspace, save controls, navigation warning, and responsive shell. It talks to the vendor-neutral `ImageEditorAdapter` contract in `src/modules/media/image-editor/contracts.ts`; `MiniPaintAdapter` is the current implementation. The miniPaint distribution stays in `public/vendor/minipaint/`, outside the Next.js module graph, with its MIT license and dependency notices alongside it.

## Asset loading

The Media view passes the selected asset's stable ID, site, MIME type, metadata, dimensions, and delivery URL to the modal. The adapter attaches to the same-origin miniPaint iframe and loads the delivered bytes into a new editor layer. The CMoS `/media/:id` route remains responsible for delivery and visibility policy; storage keys never reach the browser editor.

## Save flow

The editor exports a PNG, JPEG, or WebP `Blob`. **Save version** sends it to `PUT /api/media/:id`, which calls the existing `replaceMedia` workflow and records a replacement/version relation while preserving the prior asset. The workflow inspects bytes, computes metadata and checksum, uses the configured storage adapter, and schedules generated variants. Usage resolution follows the replacement relation so content references remain usable. **Save As** sends the export to `POST /api/media/upload`, creating an independent asset through the existing upload workflow. Both paths require the existing staff permission and site scope checks. The routes reject oversized requests from a declared Content-Length early; the workflow also enforces the configured byte limit after parsing.

## Upstream isolation

Only `MiniPaintAdapter` knows miniPaint's globals and iframe message protocol. CMoS styling overrides live in `public/vendor/minipaint/cmos-overrides.css`; the upstream bundle is not cosmetically forked. Updating or replacing miniPaint should change the static vendor distribution and adapter, while leaving Media storage, permissions, and versioning intact. Preserve `MIT-LICENSE.txt` and bundled dependency notices on updates.

## Future AI extension boundary

`ImageEditorExtensionAction` and `ImageEditorExtensionContext` let a future host register actions without adding provider concepts or credentials to Media or miniPaint. An action can call a CMoS AI Runtime supplied by the host and insert a returned image through the adapter's optional `insertLayer` method, after which ordinary CMoS save/version workflows apply. The editor has no provider router, credentials, billing, or user-facing AI actions today.
