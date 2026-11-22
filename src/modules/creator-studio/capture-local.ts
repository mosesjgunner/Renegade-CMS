import type { CaptureChunk, CaptureManifest } from './capture-contract'

type LocalTake = { scope: string; manifest: CaptureManifest; count: number }
type LocalChunk = CaptureChunk & { key: string }

export function openCaptureJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('renegade-creator-recordings', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('takes', { keyPath: 'manifest.key' }).createIndex('scope', 'scope')
      db.createObjectStore('chunks', { keyPath: ['key', 'index'] }).createIndex('key', 'key')
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Recording storage is busy in another tab.'))
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

function commit(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Recording storage transaction aborted.'))
  })
}

export function writeLocalTake(db: IDBDatabase, take: LocalTake, chunk?: CaptureChunk) {
  let tx: IDBTransaction
  const stores = chunk ? ['takes', 'chunks'] : ['takes']
  try {
    tx = db.transaction(stores, 'readwrite', { durability: 'strict' })
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    tx = db.transaction(stores, 'readwrite')
  }
  const complete = commit(tx)
  if (chunk) tx.objectStore('chunks').add({ ...chunk, key: take.manifest.key })
  tx.objectStore('takes').put(take)
  return complete
}

function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function listLocalTakes(db: IDBDatabase, scope: string): Promise<LocalTake[]> {
  return result(db.transaction('takes').objectStore('takes').index('scope').getAll(scope))
}

export function readLocalChunk(
  db: IDBDatabase,
  key: string,
  index: number,
): Promise<LocalChunk | undefined> {
  return result(db.transaction('chunks').objectStore('chunks').get([key, index]))
}

export function deleteLocalTake(db: IDBDatabase, key: string) {
  const tx = db.transaction(['takes', 'chunks'], 'readwrite')
  const complete = commit(tx)
  tx.objectStore('takes').delete(key)
  tx.objectStore('chunks').delete(IDBKeyRange.bound([key, 0], [key, Number.MAX_SAFE_INTEGER]))
  return complete
}
