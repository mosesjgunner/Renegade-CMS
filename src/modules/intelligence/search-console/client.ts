/**
 * Google Search Console API Client & Credential Protection
 *
 * Implements site-scoped authentication, credential masking, pagination,
 * rate limit handling (HTTP 429 / 503) with exponential backoff & jitter,
 * and retry logic.
 */

import { createHash } from 'node:crypto'
import type { SearchConsoleIngestOptions, SearchConsolePerformanceRecord } from './contracts'

export type SearchConsoleRawRow = {
  keys: string[] // e.g. [date, page, query]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type SearchConsoleApiResponse = {
  rows?: SearchConsoleRawRow[]
  responseAggregationType?: string
}

export interface SearchConsoleClientConfig {
  siteUrl: string
  authType: 'service_account' | 'oauth' | 'api_key'
  credentials: {
    clientEmail?: string
    privateKey?: string
    apiKey?: string
    accessToken?: string
  }
  maxRetries?: number
  initialBackoffMs?: number
  maxBackoffMs?: number
  fetchFn?: typeof fetch
}

/**
 * Masks credentials so sensitive keys/tokens are never exposed in logs or client-facing responses.
 */
export function maskCredential(credentialInput: {
  clientEmail?: string
  privateKey?: string
  apiKey?: string
  accessToken?: string
}): string {
  if (credentialInput.clientEmail) {
    const parts = credentialInput.clientEmail.split('@')
    const user = parts[0] || 'service-account'
    const domain = parts[1] || 'iam.gserviceaccount.com'
    const maskedUser = user.length > 4 ? `${user.slice(0, 3)}***` : '***'
    return `Service Account: ${maskedUser}@${domain} (Private Key: [SECURED])`
  }

  if (credentialInput.apiKey) {
    const key = credentialInput.apiKey
    return `API Key: ${key.slice(0, 4)}...${key.slice(-4)}`
  }

  if (credentialInput.accessToken) {
    return 'OAuth 2.0 Token: bearer_token_configured (expires/rotates)'
  }

  return 'Unconfigured'
}

export class GoogleSearchConsoleClient {
  private siteUrl: string
  private authType: 'service_account' | 'oauth' | 'api_key'
  private credentials: SearchConsoleClientConfig['credentials']
  private maxRetries: number
  private initialBackoffMs: number
  private maxBackoffMs: number
  private fetchFn: typeof fetch

  constructor(config: SearchConsoleClientConfig) {
    this.siteUrl = config.siteUrl
    this.authType = config.authType
    this.credentials = config.credentials
    this.maxRetries = config.maxRetries ?? 3
    this.initialBackoffMs = config.initialBackoffMs ?? 500
    this.maxBackoffMs = config.maxBackoffMs ?? 8000
    this.fetchFn = config.fetchFn ?? fetch
  }

  getMaskedCredentials(): string {
    return maskCredential(this.credentials)
  }

  /**
   * Executes a paginated query against the Search Analytics API with rate-limit handling and retries.
   */
  async querySearchAnalytics(
    options: SearchConsoleIngestOptions,
    customFetchHandler?: (
      requestBody: Record<string, unknown>,
      startRow: number,
    ) => Promise<SearchConsoleApiResponse>,
  ): Promise<{
    records: SearchConsolePerformanceRecord[]
    totalRows: number
    batchesCount: number
    rateLimitDelaysMs: number
  }> {
    const records: SearchConsolePerformanceRecord[] = []
    const rowLimit = Math.min(options.rowLimit || 5000, 25000)
    let startRow = options.startRow || 0
    let hasMore = true
    let batchesCount = 0
    let rateLimitDelaysMs = 0

    while (hasMore) {
      batchesCount++
      const body = {
        startDate: options.startDate,
        endDate: options.endDate,
        dimensions: options.dimensions || ['date', 'page', 'query'],
        rowLimit,
        startRow,
      }

      let response: SearchConsoleApiResponse
      let attempt = 0
      let success = false
      let lastError: Error | null = null

      while (attempt <= this.maxRetries && !success) {
        try {
          if (customFetchHandler) {
            response = await customFetchHandler(body, startRow)
          } else {
            response = await this.executeHttpQuery(body)
          }
          success = true
        } catch (err: unknown) {
          attempt++
          lastError = err instanceof Error ? err : new Error(String(err))
          const isRateLimit =
            lastError.message.includes('429') ||
            lastError.message.toLowerCase().includes('rate limit') ||
            lastError.message.toLowerCase().includes('quota')
          const isServerUnavailable =
            lastError.message.includes('503') || lastError.message.includes('500')

          if ((isRateLimit || isServerUnavailable) && attempt <= this.maxRetries) {
            // Exponential backoff with jitter
            const backoff = Math.min(
              this.initialBackoffMs * Math.pow(2, attempt - 1) + Math.random() * 200,
              this.maxBackoffMs,
            )
            rateLimitDelaysMs += backoff
            await new Promise((resolve) => setTimeout(resolve, backoff))
          } else {
            throw lastError
          }
        }
      }

      const rows = response!.rows || []
      if (rows.length === 0) {
        hasMore = false
        break
      }

      for (const row of rows) {
        // keys format depends on dimensions: [date, page, query]
        const date = row.keys[0] || options.startDate
        const pageUrl = row.keys[1] || ''
        const query = row.keys[2] || ''

        records.push({
          id: `gsc-${createHash('sha256').update(`${date}:${pageUrl}:${query}`).digest('hex').slice(0, 24)}`,
          siteId: this.siteUrl,
          date,
          pageUrl,
          query,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: Number(row.ctr.toFixed(4)),
          position: Number(row.position.toFixed(1)),
        })
      }

      if (rows.length < rowLimit) {
        hasMore = false
      } else {
        startRow += rows.length
      }
    }

    return {
      records,
      totalRows: records.length,
      batchesCount,
      rateLimitDelaysMs,
    }
  }

  private async executeHttpQuery(body: Record<string, unknown>): Promise<SearchConsoleApiResponse> {
    const encodedSite = encodeURIComponent(this.siteUrl)
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    if (this.credentials.accessToken) {
      headers['Authorization'] = `Bearer ${this.credentials.accessToken}`
    } else if (this.credentials.apiKey) {
      headers['X-Goog-Api-Key'] = this.credentials.apiKey
    }

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(
        `Google Search Console API error (${res.status}): ${errText || res.statusText}`,
      )
    }

    return (await res.json()) as SearchConsoleApiResponse
  }
}
