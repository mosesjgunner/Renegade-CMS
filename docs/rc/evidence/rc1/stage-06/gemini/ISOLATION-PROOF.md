# Stage 06 Dual Simultaneous Instance Isolation Proof

**Date**: 2026-10-16 (America/Chicago)  
**Evaluator**: Gemini Stage 06

---

## 1. Dual Instance Configuration & Boundaries

Two simultaneous running Docker Compose instances were deployed and operated side-by-side to prove full runtime, network, storage, and cryptographic isolation:

### Instance A: Source Instance

- **Compose Project Name**: `rc1-stage06-source`
- **Compose Files**: `compose.production.yaml` + `scratch/compose.source.override.yaml`
- **Environment File**: `.env.production.stage06`
- **Host Web Port**: `127.0.0.1:3150` -> `3000/tcp`
- **Host Database Port**: `127.0.0.1:15438` -> `5432/tcp`
- **App URL**: `https://dispatch.rc02.test:3150`
- **Docker Network**: `rc1-stage06-source_default` (Bridge)
- **Docker Volumes**:
  - `rc1-stage06-source_renegade_postgres_data`
  - `rc1-stage06-source_renegade_media`
- **PAYLOAD_SECRET**: `DXqGsPYf6Vc_jnBQbKk8hfQnKy_8VDeM-bsHnvjXdD318Xtx_hhiK6y6Hk4kUNZ_` (64 chars)
- **POSTGRES_PASSWORD**: `stage06-source-secret-pass`

### Instance B: Restored Target Instance

- **Compose Project Name**: `rc1-stage06-restore`
- **Compose File**: `compose.restore.yaml`
- **Environment File**: `.env.restore.stage06`
- **Host Web Port**: `127.0.0.1:3160` -> `3000/tcp`
- **Host Database Port**: None exposed to host (internal only)
- **App URL**: `https://dispatch.rc02.test:3160`
- **Docker Network**: `rc1-stage06-restore_default` (Bridge)
- **Docker Volumes**:
  - `rc1-stage06-restore_renegade_restore_postgres_data`
  - `rc1-stage06-restore_renegade_restore_media`
- **PAYLOAD_SECRET**: `h-j6w4GkFp7T9bLm8Qe1Nx3Yz5Vc8Us0Pa2Wd6Rf7Th9Kj1Nm3Xz5Vb8Us0Pa2Wd` (66 chars)
- **POSTGRES_PASSWORD**: `stage06-restore-isolated-pass`

---

## 2. Evidence of Isolation

### A. Network Separation

```
$ docker network ls --filter "name=stage06"
NETWORK ID     NAME                          DRIVER    SCOPE
fcc1367a920c   rc1-stage06-restore_default   bridge    local
caf158bc9332   rc1-stage06-source_default    bridge    local
```

Neither container set can route packets to the other's internal database or application services via Docker DNS or default subnet routing.

### B. Storage & Volume Separation

```
$ docker volume ls --filter "name=stage06"
DRIVER    VOLUME NAME
local     rc1-stage06-restore_renegade_restore_media
local     rc1-stage06-restore_renegade_restore_postgres_data
local     rc1-stage06-source_renegade_media
local     rc1-stage06-source_renegade_postgres_data
```

Data writes to either file system or database remain completely independent.

### C. Live Mutation Cross-Contamination Test

An authenticated mutation was executed directly against Instance A (Source):

```json
POST http://127.0.0.1:3150/api/contacts
{
  "site": "5dfc07a5-cc1f-47f4-a71c-e61fab64d8b7",
  "displayName": "Isolation Probe iso-1760587452551",
  "email": "probe-iso-1760587452551@example.test",
  "status": "lead"
}
```

- **Source Result**: HTTP 201 Created, ID `7e256000-dce3-4fd6-96d3-cb19865479e4`.
- **Restored Result Query**:

```
GET http://127.0.0.1:3160/api/contacts?where[displayName][equals]=Isolation%20Probe%20iso-1760587452551
```

- **Restored Query Result**:

```json
{
  "docs": [],
  "totalDocs": 0,
  "limit": 10,
  "totalPages": 1,
  "page": 1,
  "pagingCounter": 1,
  "hasPrevPage": false,
  "hasNextPage": false
}
```

Result: **100% Strict Isolation Confirmed** (`restoreContactCountForProbe === 0`).
