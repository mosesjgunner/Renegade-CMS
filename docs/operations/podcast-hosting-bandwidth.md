# Self-Hosted Podcast Hosting & Bandwidth Architecture

## 1. Overview & Zero-SaaS Guarantee

Renegade CMS provides an autonomous, standards-compliant podcast publishing architecture with **zero dependency on third-party SaaS hosting platforms** (such as Libsyn, Transistor, Megaphone, or Podbean) and **zero mandatory third-party web players** (such as Spotify or Apple embeds).

All podcast shows, episodes, audio assets, transcripts, chapter markers, and syndication feeds are stored in your self-hosted database and media storage (local filesystem or S3-compatible object store), delivered directly through your configured canonical origin (`APP_URL`).

---

## 2. Bandwidth & Storage Capacity Planning

Because podcast episodes are progressive-download media files, self-hosted operators must provision adequate bandwidth or configure a content delivery network (CDN) / caching reverse proxy in front of the origin.

### File Sizing Formulas

$$\text{File Size (MB)} = \frac{\text{Bitrate (kbps)} \times \text{Duration (seconds)}}{8 \times 1,024}$$

| Audio Format                       | Bitrate  | Sample Rate | Size per 30 min | Size per 60 min | Size per 90 min |
| :--------------------------------- | :------- | :---------- | :-------------- | :-------------- | :-------------- |
| **Spoken Word (Mono)**             | 96 kbps  | 44.1 kHz    | ~21.1 MB        | ~42.2 MB        | ~63.3 MB        |
| **Standard Speech (Joint Stereo)** | 128 kbps | 44.1 kHz    | ~28.1 MB        | ~56.3 MB        | ~84.4 MB        |
| **Music / Rich Audio (Stereo)**    | 192 kbps | 44.1 kHz    | ~42.2 MB        | ~84.4 MB        | ~126.6 MB       |

### Monthly Egress Estimations (1-hour episode @ 128 kbps = ~56 MB)

- **1,000 monthly downloads:** ~56 GB egress
- **5,000 monthly downloads:** ~280 GB egress
- **10,000 monthly downloads:** ~560 GB egress
- **50,000 monthly downloads:** ~2.8 TB egress
- **100,000 monthly downloads:** ~5.6 TB egress

---

## 3. Byte-Range Delivery (HTTP 206 Partial Content)

Podcast client applications (Apple Podcasts, Overcast, Pocket Casts, Spotify, Downcast, AntennaPod) **strictly require HTTP byte-range request support**.

### Why Range Requests are Mandatory:

1. **Progressive Playback & Scrubbing:** Listeners scrubbing to minute 25 request `Range: bytes=23592960-` without downloading the preceding 23 MB.
2. **Resuming Interrupted Cellular Downloads:** Mobile devices frequently pause and resume downloads across cellular cell towers or Wi-Fi transitions.
3. **Head Request Probe:** Feed aggregators send `HEAD` or small `Range: bytes=0-1` requests to verify file size and MIME headers before downloading.

### Implementation in Renegade CMS:

- The media endpoint (`/media/:id`) inspects `Range: bytes=start-end`.
- Returns **HTTP 206 Partial Content** with:
  - `Accept-Ranges: bytes`
  - `Content-Range: bytes {start}-{end}/{total}`
  - `Content-Length: {chunkLength}`
  - `Content-Type: audio/mpeg` (or `audio/wav`, `audio/mp4`)
- When no range is requested, returns **HTTP 200 OK** with full byte length and `Accept-Ranges: bytes`.
- Out-of-bounds requests return **HTTP 416 Range Not Satisfiable** with `Content-Range: bytes */{total}`.

---

## 4. Feed Polling & Conditional Caching (HTTP 304)

Podcast directories (Apple Podcasts, Podcast Index, Spotify, Pocket Casts) employ automated crawlers that poll podcast RSS feeds (`/podcasts/:slug/feed.xml`) every **5 to 15 minutes** per show.

### Polling Impact & Mitigation:

- Without caching, 20 aggregator crawlers polling every 5 minutes generate ~5,760 database queries per day for an idle feed.
- Renegade CMS computes a deterministic SHA-256 `ETag` of the syndicated XML body:
  - Supports `If-None-Match` request header.
  - Returns **HTTP 304 Not Modified** with zero body bytes when unchanged.
  - Sets `Cache-Control: public, max-age=300, stale-while-revalidate=600`.
  - Upstream edge CDNs (Cloudflare, Fastly, AWS CloudFront) or reverse proxies (Nginx, Caddy) cache and serve the 304 responses, eliminating 99.8% of origin CPU and database load.

---

## 5. Reverse Proxy & CDN Configuration Guidance

To serve high-volume podcasts from a single small VPS without SaaS:

### Caddy Example

```caddy
example.com {
    reverse_proxy localhost:3000 {
        header_up Host {upstream_hostport}
        header_up X-Forwarded-Host {host}
    }
}
```

### Nginx Example

Ensure Nginx does not buffer or strip range headers for media routes:

```nginx
location /media/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
    proxy_http_version 1.1;
    proxy_cache_bypass $http_upgrade;

    # Enable proxy byte-range slicing if caching large files at edge
    proxy_cache_valid 200 206 304 30d;
}
```

### Cloudflare / Edge CDN

- **Cache Rules:** Create a rule for `/media/*` with Cache Status: Eligible, Respect Origin Cache-Control Headers.
- **Byte Range Caching:** Cloudflare Enterprise or standard caching automatically handles byte range requests when `Accept-Ranges: bytes` is returned by the origin.
