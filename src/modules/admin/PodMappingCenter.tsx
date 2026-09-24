'use client'

import React, { useState } from 'react'
import { COLOR_FIDELITY_DISCLAIMER } from '../commerce/print-renditions'
import type { DetailedPodMapping } from '../commerce/pod-mapping'

interface PodMappingCenterProps {
  initialMappings?: readonly DetailedPodMapping[]
  onSaveMapping?: (mapping: DetailedPodMapping) => void
}

export function PodMappingCenter({ initialMappings = [] }: PodMappingCenterProps) {
  const [mappings, setMappings] = useState<DetailedPodMapping[]>(() =>
    initialMappings.length > 0
      ? [...initialMappings]
      : [
          {
            id: 'map-sample-1',
            siteId: 'site-default',
            productId: 'prod-tee-renegade',
            variantSku: 'SHIRT-M-BLK',
            optionValues: { size: 'm', color: 'black' },
            providerKey: 'pod-emulator',
            remoteProductId: 'emu-tee-101',
            remoteVariantId: 'emu-tee-m-blk',
            printAreas: [
              {
                area: 'front',
                artworkRenditionId: 'art-front-001',
                artworkHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
                artworkRevision: 1,
                placement: { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
              },
            ],
            pinnedArtworkHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            artworkRevisionId: 'rev-front-1',
            mockupProvenance: {
              source: 'provider',
              generatedAt: new Date().toISOString(),
              url: 'https://emulator.renegade.internal/mockups/tee-m-blk.png',
            },
            snapshot: {
              costMinor: '1250',
              currency: 'USD',
              available: true,
              observedAt: new Date().toISOString(),
            },
            reviewStatus: 'approved',
            reviewedBy: 'merch_lead',
            reviewedAt: new Date().toISOString(),
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
  )

  const [selectedId, setSelectedId] = useState<string>(mappings[0]?.id ?? '')
  const [remapModalOpen, setRemapModalOpen] = useState(false)
  const [remapJustification, setRemapJustification] = useState('')
  const [reviewerName, setReviewerName] = useState('shop_operator')

  const activeMapping = mappings.find((m) => m.id === selectedId)

  const handleApprove = (id: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              reviewStatus: 'approved',
              reviewedBy: reviewerName,
              reviewedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : m,
      ),
    )
  }

  const handleReject = (id: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              reviewStatus: 'rejected',
              reviewedBy: reviewerName,
              reviewedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : m,
      ),
    )
  }

  const handleDeliberateRemap = () => {
    if (!remapJustification.trim() || !activeMapping) return
    setMappings((prev) =>
      prev.map((m) =>
        m.id === activeMapping.id
          ? {
              ...m,
              version: m.version + 1,
              reviewStatus: 'pending',
              reviewNotes: `Remap by ${reviewerName}: ${remapJustification}`,
              updatedAt: new Date().toISOString(),
            }
          : m,
      ),
    )
    setRemapModalOpen(false)
    setRemapJustification('')
  }

  return (
    <div
      style={{
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
          Print-on-Demand Mapping Center
        </h1>
        <p style={{ color: '#666', margin: '0 0 16px 0' }}>
          Govern catalog variant mappings, pinned print renditions, placement bounds, and cost
          snapshots.
        </p>
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            padding: '12px 16px',
            color: '#92400e',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠️</span>
          <span>{COLOR_FIDELITY_DISCLAIMER}</span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>
        {/* Mapping list */}
        <aside
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
            background: '#fafafa',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Mapped SKUs</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {mappings.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px',
                  borderRadius: '6px',
                  border: m.id === selectedId ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  background: m.id === selectedId ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{m.variantSku}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Provider: {m.providerKey} • v{m.version}
                </div>
                <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background:
                        m.reviewStatus === 'approved'
                          ? '#dcfce7'
                          : m.reviewStatus === 'rejected'
                            ? '#fee2e2'
                            : '#fef3c7',
                      color:
                        m.reviewStatus === 'approved'
                          ? '#166534'
                          : m.reviewStatus === 'rejected'
                            ? '#991b1b'
                            : '#92400e',
                    }}
                  >
                    {m.reviewStatus.toUpperCase()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Detail View */}
        {activeMapping ? (
          <main
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '24px',
              background: '#ffffff',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                  {activeMapping.variantSku}
                </h2>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  Mapping ID: {activeMapping.id} • Version: {activeMapping.version}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setRemapModalOpen(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  🔄 Deliberate Remap
                </button>
                {activeMapping.reviewStatus !== 'approved' && (
                  <button
                    onClick={() => handleApprove(activeMapping.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#16a34a',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                    }}
                  >
                    ✓ Approve Mapping
                  </button>
                )}
                {activeMapping.reviewStatus !== 'rejected' && (
                  <button
                    onClick={() => handleReject(activeMapping.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #f87171',
                      background: '#fee2e2',
                      color: '#991b1b',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    ✕ Reject
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '24px',
              }}
            >
              <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '6px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  Provider & Catalog Alignment
                </h3>
                <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                  <div>
                    <strong>Provider:</strong> {activeMapping.providerKey}
                  </div>
                  <div>
                    <strong>Remote Product ID:</strong> {activeMapping.remoteProductId}
                  </div>
                  <div>
                    <strong>Remote Variant ID:</strong> {activeMapping.remoteVariantId}
                  </div>
                  <div>
                    <strong>Option Values:</strong>{' '}
                    {Object.entries(activeMapping.optionValues)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')}
                  </div>
                </div>
              </div>

              <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '6px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  Cost Snapshot & Availability
                </h3>
                <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                  <div>
                    <strong>Provider Base Cost:</strong>{' '}
                    {(Number(activeMapping.snapshot.costMinor) / 100).toFixed(2)}{' '}
                    {activeMapping.snapshot.currency}
                  </div>
                  <div>
                    <strong>Stock Availability:</strong>{' '}
                    <span
                      style={{ color: activeMapping.snapshot.available ? '#16a34a' : '#dc2626' }}
                    >
                      {activeMapping.snapshot.available ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>
                  <div>
                    <strong>Observed At:</strong>{' '}
                    {new Date(activeMapping.snapshot.observedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Print Areas */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                Print Areas & Pinned Artwork
              </h3>
              {activeMapping.printAreas.map((area, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '16px',
                    marginBottom: '12px',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                      Area: {area.area}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      Rendition: {area.artworkRenditionId} (rev {area.artworkRevision})
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.5' }}>
                    <div>
                      <strong>Placement Bounds:</strong> {area.placement.widthMm}mm ×{' '}
                      {area.placement.heightMm}mm (Top: {area.placement.topMm}mm, Left:{' '}
                      {area.placement.leftMm}mm)
                    </div>
                    <div
                      style={{
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        marginTop: '4px',
                      }}
                    >
                      <strong>SHA-256 Hash:</strong> {area.artworkHash}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Provenance */}
            <div
              style={{
                borderTop: '1px solid #e5e7eb',
                paddingTop: '16px',
                fontSize: '12px',
                color: '#6b7280',
              }}
            >
              <div>
                <strong>Mockup Provenance:</strong> Generated by{' '}
                {activeMapping.mockupProvenance.source} on{' '}
                {new Date(activeMapping.mockupProvenance.generatedAt).toLocaleString()}
              </div>
              {activeMapping.reviewedBy && (
                <div>
                  <strong>Last Review:</strong> {activeMapping.reviewStatus} by{' '}
                  {activeMapping.reviewedBy} at{' '}
                  {new Date(activeMapping.reviewedAt!).toLocaleString()}
                </div>
              )}
              {activeMapping.reviewNotes && (
                <div>
                  <strong>Review Notes:</strong> {activeMapping.reviewNotes}
                </div>
              )}
            </div>
          </main>
        ) : (
          <div>Select a mapping from the sidebar</div>
        )}
      </div>

      {/* Deliberate Remap Modal */}
      {remapModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              padding: '24px',
              borderRadius: '8px',
              width: '480px',
              maxWidth: '90vw',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
              Deliberate Re-Map Review
            </h3>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              Re-mapping will increment the mapping version to v{(activeMapping?.version ?? 0) + 1}{' '}
              and return its status to pending review. Existing sold orders retain their immutable
              sold snapshot and will NOT be modified.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  marginBottom: '4px',
                }}
              >
                Reviewer / Operator Name:
              </label>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  marginBottom: '4px',
                }}
              >
                Business Justification for Remap:
              </label>
              <textarea
                rows={3}
                value={remapJustification}
                onChange={(e) => setRemapJustification(e.target.value)}
                placeholder="e.g. Switched supplier blank to premium ringspun cotton; updated placement coordinates."
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setRemapModalOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '4px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeliberateRemap}
                disabled={!remapJustification.trim()}
                style={{
                  padding: '8px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  background: remapJustification.trim() ? '#2563eb' : '#93c5fd',
                  color: '#ffffff',
                  cursor: remapJustification.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Confirm Remap
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
