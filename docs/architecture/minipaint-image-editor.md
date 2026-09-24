# CMoS Native Image Editor Architecture & Integration Note

## 1. Integration Boundary

The Renegade CMoS Native Image Editor integrates upstream **miniPaint** behind a clean, provider-agnostic component and adapter boundary.

- **Admin Host Shell**: Media Library (`MediaLibraryClient.tsx`, `MediaCommandCenter.tsx`) and asset detail view (`MediaEditActionField.tsx`) render an **Edit Image** action for image assets.
- **CMoS Modal Component**: `ImageEditorModal.tsx` owns the native CMoS admin shell, toolbar, dimensions display, filename editor, save options (Save version vs Save As), format selection (PNG/JPEG/WebP), dirty-state tracking, and leave warning dialogs.
- **Engine Adapter Contract**: `ImageEditorAdapter` (`src/modules/media/image-editor/contracts.ts`) defines the neutral boundary methods: `attach()`, `loadImage()`, `exportImage()`, `exportProject()`, `isDirty()`, `undo()`, `redo()`, `getDimensions()`, `getActiveLayerImage()`, `insertLayer()`, `replaceActiveLayer()`, and `destroy()`.
- **miniPaint Adapter**: `MiniPaintAdapter` (`src/modules/media/image-editor/minipaint-adapter.ts`) implements `ImageEditorAdapter`. It coordinates between the CMoS host and the miniPaint iframe using same-origin DOM fast-paths and postMessage fallback bridges.
- **Vendored Distribution**: The upstream miniPaint release stays self-contained in `public/vendor/minipaint/` outside the Next.js module bundle. MIT licensing attribution (`MIT-LICENSE.txt`) and upstream documentation (`README.md`) are maintained directly with the vendored assets.

## 2. Asset Loading Flow

1. The host passes the selected CMoS `ImageEditorAsset` (id, title, delivery URL, MIME type, siteId, dimensions) to `ImageEditorModal`.
2. The modal mounts the isolated iframe pointing to `/vendor/minipaint/index.html`.
3. The adapter attaches to the iframe and validates the asset:
   - MIME validation: Rejects non-raster media and explicitly blocks vector graphics (`image/svg+xml`) to prevent script execution vulnerabilities.
   - Dimension check: Enforces the 50 megapixel decompression limit (`MAX_IMAGE_EDITOR_PIXELS = 50_000_000`) matching the CMoS Media processor.
   - Same-origin URL verification: Ensures delivery URLs originate from the current host.
4. The adapter fetches asset bytes from `/media/:id` as a Blob/ObjectURL or delivers the verified URL across the bridge.
5. In miniPaint, an image layer is inserted, the canvas is resized to the asset's exact natural dimensions, and the initial history is established as clean (`dirty: false`).

## 3. Save Flow: Save Version vs Save As

The editor exports the canvas as a standard `image/png`, `image/jpeg`, or `image/webp` `Blob` using canvas export utilities.

### Path A: Save Version (`mode: 'all-usages'`)

- Dispatches `PUT /api/media/:id` with `multipart/form-data` containing the new image file, site ID, title, and provenance reason (`Edited in miniPaint: ...`).
- Invokes the existing CMoS Media `replaceMedia()` workflow:
  - Generates a new media asset document in the storage layer.
  - Recalculates dimensions, file size, MIME type, and `sha256:` content checksum.
  - Automatically enqueues required thumbnail and responsive variant generation.
  - Establishes a version entry in `media-asset-versions` referencing the prior asset.
  - Sets `replaceGloballyWith` on the prior asset so existing articles and references resolve to the updated version without breaking URLs or foreign keys.
  - Preserves the original asset record for rollbacks and auditability.

### Path B: Save As (`mode: 'new-asset'`)

- Dispatches `POST /api/media/upload` with `multipart/form-data`.
- Invokes the existing CMoS Media `uploadMedia()` workflow:
  - Creates a new independent media asset with sanitized title and filename.
  - Uses configured storage adapters (local filesystem or S3-compatible bucket).
  - Enforces site ownership and editorial permissions.

## 4. Upstream miniPaint Isolation

- **Zero Core Forking for Cosmetics**: miniPaint core logic is untouched for presentation. Custom visual tuning is scoped to `public/vendor/minipaint/cmos-overrides.css`.
- **Encapsulated Protocols**: Only `MiniPaintAdapter` interacts with miniPaint window globals (`Layers`, `Actions`, `State`, `FileSave`). If miniPaint is upgraded or replaced by another editor (e.g. Photopea or an in-house engine), only the adapter implementation changes.
- **MIT License Preservation**: `public/vendor/minipaint/MIT-LICENSE.txt` and copyright notices for Vilius Kraujutis (ViliusL) are strictly preserved.

## 5. Security & Reliability Audit Summary

- **XSS & SVG Isolation**: SVG assets are blocked from opening in the raster editor canvas. Image bytes are rendered inside an isolated canvas context.
- **Malicious Filenames**: Filenames are sanitized via `sanitizeImageFilename()`: path traversals (`../`), null bytes, control codes, and Windows/Unix reserved characters are stripped.
- **Decompression Bomb Protection**: Asset dimensions and natural image dimensions are capped at 50,000,000 pixels.
- **Upload Limits & MIME Validation**: Server routes enforce `appConfig.storage.maxUploadBytes` and content length headers before ingestion.
- **Unsaved Edits Protection**: Standard `beforeunload` event and in-app `Discard unsaved edits?` modal dialog prevent accidental navigation data loss.
- **Keyboard & Accessibility**: Full keyboard support (Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, Esc close dialog) with ARIA dialog roles and visible focus indicators.

## 6. Future AI Extension Boundary (MED-EXT-05)

The CMoS image editor includes an extension boundary allowing future AI capabilities to plug in seamlessly without architectural refactoring.

### Supported Future AI Actions

The `ImageEditorAIActionType` abstraction natively supports:

1. `generative-fill`: Inpainting within an active selection or mask.
2. `remove-object`: Content-aware object erasing.
3. `replace-background`: Background segmentation and replacement.
4. `expand-outpaint`: Generative boundary extension beyond current dimensions.
5. `generate-variation`: Semantic variations of the active image layer.
6. `restyle`: Style transfer based on prompt or style reference.
7. `generate-image`: Text-to-image layer generation into the canvas.

### Expected Future Flow

```
┌───────────────────────┐
│ CMoS Image Editor     │  (ImageEditorModal / MiniPaintAdapter)
└───────────┬───────────┘
            │ 1. Invokes action.run(context)
            ▼
┌───────────────────────┐
│ Editor AI Action      │  (Generic descriptor with requirements)
└───────────┬───────────┘
            │ 2. Dispatches prompt / image bytes
            ▼
┌───────────────────────┐
│ CMoS AI Runtime       │  (Future host module)
└───────────┬───────────┘
            │ 3. Provider Router
            ▼
┌───────────────────────┐
│ Provider (Gemini etc) │  (Backend server-side only)
└───────────┬───────────┘
            │ 4. Returns image / layer bytes
            ▼
┌───────────────────────┐
│ Adapter Canvas Bridge │  (adapter.insertLayer / replaceActiveLayer)
└───────────┬───────────┘
            │ 5. User inspects & adjusts in miniPaint
            ▼
┌───────────────────────┐
│ CMoS Save / Version   │  (PUT /api/media/:id or POST /api/media/upload)
└───────────────────────┘
```

### Strict Non-Functional Rules Maintained:

- **No Provider Credentials in Editor**: No API keys, secret tokens, or provider endpoints exist in client components.
- **No Provider-Specific Schemas**: Media collections remain 100% agnostic to AI vendor representations.
- **No AI Billing in Media**: Token counting and billing reside entirely in future AI runtime services.
- **No Fake/Stub UI**: When no extensions are registered, no placeholder or fake AI buttons are shown in the editor shell.
- **Decoupled Registry**: Extensions register through `registerImageEditorExtension()` and clean up on unmount.
