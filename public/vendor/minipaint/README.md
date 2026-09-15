# miniPaint Vendored Distribution

- **Upstream Repository**: [https://github.com/viliusle/miniPaint](https://github.com/viliusle/miniPaint)
- **Author**: Vilius Kraujutis (ViliusL)
- **License**: MIT (see [MIT-LICENSE.txt](./MIT-LICENSE.txt))
- **Vendored Footprint**:
  - `dist/bundle.js`: Precompiled client-side bundle containing HTML5 canvas tools, filters, layers, and CSS.
  - `dist/bundle.js.LICENSE.txt`: Upstream dependency licenses.
  - `images/icons/`: Vector and bitmap tool icons.
  - `images/logo.svg`, `images/favicon.png`: Upstream brand marks.
  - `index.html`: Embedding container.

## Upstream Isolation & Replacement
This directory contains only static browser assets. It is completely isolated from Next.js build compilation, npm dependencies, and server-side logic.
Renegade CMoS interacts with miniPaint exclusively through the adapter boundary in `src/modules/media/image-editor/`.
To update or replace this editor, refresh these static files or swap the adapter implementation without modifying any core Media, storage, permissions, or versioning code.

### CMoS workspace boundary

The CMoS shell lives outside this vendor directory in `ImageEditorModal.tsx` and
`ImageEditorModal.module.css`. The small same-origin bridge at the end of
`index.html` reports canvas/history state and forwards undo/redo commands; it
does not restyle or alter the upstream `dist/bundle.js`. Keep that bridge when
refreshing the upstream entry point so CMoS can retain unsaved-change warnings,
dimensions, and native workspace controls without forking miniPaint.
