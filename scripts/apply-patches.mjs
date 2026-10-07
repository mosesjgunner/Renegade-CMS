import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const getIsLockedPath = resolve('node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js')

if (existsSync(getIsLockedPath)) {
  const content = readFileSync(getIsLockedPath, 'utf8')
  const targetPattern = `if (docs.length > 0) {
    const currentEditor = docs[0].user?.value;
    const lastUpdateTime = new Date(docs[0].updatedAt).getTime();
    if (extractID(currentEditor) !== req.user.id) {
      return {
        currentEditor,
        isLocked: true,
        lastUpdateTime
      };
    }
  }`

  const replacement = `if (docs.length > 0) {
    let currentEditor = docs[0].user?.value ?? docs[0].user;
    const lastUpdateTime = new Date(docs[0].updatedAt).getTime();
    if (!currentEditor || typeof currentEditor === 'string') {
      try {
        const fullDoc = await req.payload.findByID({
          collection: 'payload-locked-documents',
          id: docs[0].id,
          depth: 1,
          overrideAccess: true,
          req,
        });
        currentEditor = fullDoc?.user?.value ?? fullDoc?.user ?? currentEditor;
      } catch {
        // Fallback
      }
    }
    const currentEditorId = currentEditor
      ? (typeof currentEditor === 'object' && currentEditor !== null ? (currentEditor.id ?? currentEditor.value) : currentEditor)
      : undefined;
    const currentUserId = req?.user?.id;

    if (currentEditorId && currentUserId && String(currentEditorId) !== String(currentUserId)) {
      return {
        currentEditor,
        isLocked: true,
        lastUpdateTime,
      };
    }
    if (!currentEditorId) {
      return {
        currentEditor: null,
        isLocked: false,
        lastUpdateTime,
      };
    }
  }`

  if (content.includes(targetPattern)) {
    writeFileSync(getIsLockedPath, content.replace(targetPattern, replacement), 'utf8')
    console.log('Applied patch to getIsLocked.js')
  }
}
