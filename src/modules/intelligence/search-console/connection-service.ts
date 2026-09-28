/**
 * Site-Scoped Search Console Connection & Lifecycle Management
 *
 * Handles site-scoped connect, disconnect, delete/purge policies,
 * credential protection, and sync state monitoring.
 */

import { maskCredential } from './client'
import type {
  SearchConsoleAuthType,
  SearchConsolePerformanceRecord,
  SearchConsoleSyncProgress,
  SiteSearchConsoleConnection,
} from './contracts'

// In-memory persistent connection and performance store per site
const connectionsStore = new Map<string, SiteSearchConsoleConnection>()
const performanceStore = new Map<string, SearchConsolePerformanceRecord[]>()
const syncProgressStore = new Map<string, SearchConsoleSyncProgress>()

export interface ConnectSearchConsoleInput {
  siteId: string
  propertyUrl: string
  authType: SearchConsoleAuthType
  credentials: {
    clientEmail?: string
    privateKey?: string
    apiKey?: string
    accessToken?: string
  }
  syncWindowDays?: number
  retainedDataPolicy?: 'retain_on_disconnect' | 'purge_on_disconnect'
  connectedBy?: string
}

export class SearchConsoleConnectionService {
  /**
   * Retrieves current connection status for a site.
   */
  static getConnection(siteId: string): SiteSearchConsoleConnection | null {
    return connectionsStore.get(siteId) || null
  }

  /**
   * Retrieves active sync progress if currently running or last completed.
   */
  static getSyncProgress(siteId: string): SearchConsoleSyncProgress | null {
    return syncProgressStore.get(siteId) || null
  }

  /**
   * Connects a site to Google Search Console with masked credential storage.
   */
  static connectSite(input: ConnectSearchConsoleInput): SiteSearchConsoleConnection {
    if (!input.siteId || !input.propertyUrl) {
      throw new Error('siteId and propertyUrl are required to connect Google Search Console.')
    }

    const maskedCreds = maskCredential(input.credentials)
    const now = new Date().toISOString()

    const connection: SiteSearchConsoleConnection = {
      siteId: input.siteId,
      propertyUrl: input.propertyUrl,
      authType: input.authType,
      credentialMasked: maskedCreds,
      status: 'connected',
      connectedAt: now,
      lastSyncAt: null,
      lastError: null,
      syncWindowDays: input.syncWindowDays || 28,
      retainedDataPolicy: input.retainedDataPolicy || 'retain_on_disconnect',
    }

    connectionsStore.set(input.siteId, connection)
    return connection
  }

  /**
   * Disconnects Search Console from a site.
   * Based on retainedDataPolicy, optionally purges raw performance records or preserves them for trend history.
   */
  static disconnectSite(
    siteId: string,
    options?: { purgeData?: boolean },
  ): { success: boolean; dataPurged: boolean; connection: SiteSearchConsoleConnection | null } {
    const existing = connectionsStore.get(siteId)
    if (!existing) {
      return { success: false, dataPurged: false, connection: null }
    }

    const shouldPurge = options?.purgeData ?? existing.retainedDataPolicy === 'purge_on_disconnect'
    if (shouldPurge) {
      performanceStore.delete(siteId)
    }

    const updated: SiteSearchConsoleConnection = {
      ...existing,
      status: 'disconnected',
      credentialMasked: 'Disconnected (Credentials Cleared)',
      lastError: null,
    }

    connectionsStore.set(siteId, updated)
    return { success: true, dataPurged: shouldPurge, connection: updated }
  }

  /**
   * Fully deletes connection settings and records for a site.
   */
  static deleteConnection(siteId: string): boolean {
    connectionsStore.delete(siteId)
    performanceStore.delete(siteId)
    syncProgressStore.delete(siteId)
    return true
  }

  /**
   * Stores ingested performance records for a site.
   */
  static savePerformanceRecords(siteId: string, records: SearchConsolePerformanceRecord[]): void {
    const existing = performanceStore.get(siteId) || []
    // Deduplicate by record ID (date:pageUrl:query)
    const map = new Map<string, SearchConsolePerformanceRecord>()
    for (const r of existing) map.set(r.id, r)
    for (const r of records) map.set(r.id, r)

    performanceStore.set(siteId, Array.from(map.values()))

    // Update connection lastSyncAt
    const conn = connectionsStore.get(siteId)
    if (conn) {
      conn.lastSyncAt = new Date().toISOString()
      conn.status = 'connected'
      conn.lastError = null
      connectionsStore.set(siteId, conn)
    }
  }

  /**
   * Retrieves all ingested performance records for a site.
   */
  static getPerformanceRecords(siteId: string): SearchConsolePerformanceRecord[] {
    return performanceStore.get(siteId) || []
  }

  /**
   * Updates sync progress state.
   */
  static updateSyncProgress(progress: SearchConsoleSyncProgress): void {
    syncProgressStore.set(progress.siteId, progress)

    const conn = connectionsStore.get(progress.siteId)
    if (conn) {
      conn.status = progress.status
      if (progress.error) {
        conn.lastError = progress.error
      }
      connectionsStore.set(progress.siteId, conn)
    }
  }

  /**
   * Resets all in-memory stores (used in unit test setups).
   */
  static _resetForTesting(): void {
    connectionsStore.clear()
    performanceStore.clear()
    syncProgressStore.clear()
  }
}
