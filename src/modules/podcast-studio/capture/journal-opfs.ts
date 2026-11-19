/**
 * POD-06 — Chunk journal BROWSER STORAGE ADAPTER (thin): OPFS + IndexedDB.
 *
 * Implements the journal core's `ChunkStorage` interface with the
 * tech-research §7 split: chunk BYTES live as files in the Origin Private
 * File System (fast sequential binary I/O), while MANIFESTS (small text)
 * live in an IndexedDB object store. All journal policy — write order,
 * checksums, recovery rules — lives in `journal.ts`; this file only moves
 * bytes.
 *
 * UNVERIFIED: no real browser OPFS / IndexedDB was exercised in POD-06.
 * OPFS durability, quota and eviction behaviour (especially Safari) stay
 * UNVERIFIED — browser storage is a buffer, never the archive (the upload
 * bridge is part of the recording feature for exactly that reason).
 */

import type { ChunkStorage } from './journal'

// Minimal structural types for the OPFS surface this adapter uses, so the
// file does not depend on a specific TypeScript DOM lib version.
type OpfsFileHandle = {
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>
    close(): Promise<void>
  }>
}
type OpfsDirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  keys(): AsyncIterable<string>
}

const rootDirectory = async (): Promise<OpfsDirectoryHandle> => {
  const storage = navigator.storage as unknown as {
    getDirectory(): Promise<OpfsDirectoryHandle>
  }
  const root = await storage.getDirectory()
  return root.getDirectoryHandle('podcast-studio-recordings', { create: true })
}

const recordingDirectory = async (
  recordingId: string,
  create = false,
): Promise<OpfsDirectoryHandle> => {
  const root = await rootDirectory()
  return root.getDirectoryHandle(recordingId, { create })
}

// --- IndexedDB manifest store (minimal promise wrapper) ---------------------

const DB_NAME = 'podcast-studio-capture'
const MANIFEST_STORE = 'manifests'

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(MANIFEST_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const idbGet = async (key: string): Promise<string | null> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(MANIFEST_STORE, 'readonly').objectStore(MANIFEST_STORE).get(key)
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

const idbPut = async (key: string, value: string): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(MANIFEST_STORE, 'readwrite')
      .objectStore(MANIFEST_STORE)
      .put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const idbDelete = async (key: string): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(MANIFEST_STORE, 'readwrite')
      .objectStore(MANIFEST_STORE)
      .delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const idbKeys = async (): Promise<string[]> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(MANIFEST_STORE, 'readonly')
      .objectStore(MANIFEST_STORE)
      .getAllKeys()
    request.onsuccess = () => resolve((request.result as string[]).map(String))
    request.onerror = () => reject(request.error)
  })
}

// --- ChunkStorage over OPFS (chunks) + IndexedDB (manifests) ----------------

const chunkFileName = (index: number): string => `chunk-${String(index).padStart(4, '0')}.pcm`

export class OpfsChunkStorage implements ChunkStorage {
  async putChunk(recordingId: string, index: number, bytes: Uint8Array): Promise<void> {
    const directory = await recordingDirectory(recordingId, true)
    const handle = await directory.getFileHandle(chunkFileName(index), { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
  }

  async getChunk(recordingId: string, index: number): Promise<Uint8Array | null> {
    try {
      const directory = await recordingDirectory(recordingId)
      const handle = await directory.getFileHandle(chunkFileName(index))
      const file = await handle.getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch {
      return null
    }
  }

  async listChunks(recordingId: string): Promise<number[]> {
    try {
      const directory = await recordingDirectory(recordingId)
      const indexes: number[] = []
      for await (const name of directory.keys()) {
        const match = /^chunk-(\d+)\.pcm$/.exec(name)
        if (match) indexes.push(Number(match[1]))
      }
      return indexes.sort((a, b) => a - b)
    } catch {
      return []
    }
  }

  async getManifest(recordingId: string): Promise<string | null> {
    return idbGet(recordingId)
  }

  async putManifest(recordingId: string, text: string): Promise<void> {
    await idbPut(recordingId, text)
  }

  async listRecordings(): Promise<string[]> {
    return idbKeys()
  }

  async deleteRecording(recordingId: string): Promise<void> {
    await idbDelete(recordingId)
    try {
      const root = await rootDirectory()
      await root.removeEntry(recordingId, { recursive: true })
    } catch {
      // Directory may not exist; the manifest deletion already unlists it.
    }
  }
}
