'use client'

import { useEffect, useRef, useState } from 'react'

export function StageVideo({
  stream,
  muted = false,
  label,
}: {
  stream: MediaStream | null
  muted?: boolean
  label: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])
  return (
    <video
      className="aspect-video w-full bg-slate-950"
      aria-label={label}
      playsInline
      autoPlay
      controls={!muted}
      muted={muted}
      ref={video}
    />
  )
}

export function useStageDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [microphone, setMicrophone] = useState('')
  const [camera, setCamera] = useState('')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    return () => stream?.getTracks().forEach((track) => track.stop())
  }, [stream])

  async function check() {
    setError('')
    setChecking(true)
    setStream(null)
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(microphone ? { deviceId: { exact: microphone } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          camera === 'off' || !camera
            ? false
            : camera === 'default'
              ? true
              : { deviceId: { exact: camera } },
      })
      setStream(next)
      setDevices(await navigator.mediaDevices.enumerateDevices())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Device check failed.')
    } finally {
      setChecking(false)
    }
  }
  return {
    devices,
    microphone,
    setMicrophone,
    camera,
    setCamera,
    stream,
    setStream,
    error,
    checking,
    check,
  }
}

export function StageDevices({ setup }: { setup: ReturnType<typeof useStageDevices> }) {
  return (
    <fieldset className="space-y-2" disabled={setup.checking}>
      <legend>Device check</legend>
      <label className="block">
        Microphone{' '}
        <select
          value={setup.microphone}
          onChange={(event) => {
            setup.setStream(null)
            setup.setMicrophone(event.target.value)
          }}
        >
          <option value="">System default</option>
          {setup.devices
            .filter(
              (device) =>
                device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default',
            )
            .map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        Camera{' '}
        <select
          value={setup.camera}
          onChange={(event) => {
            setup.setStream(null)
            setup.setCamera(event.target.value)
          }}
        >
          <option value="">Off</option>
          <option value="default">System default</option>
          {setup.devices
            .filter(
              (device) =>
                device.kind === 'videoinput' && device.deviceId && device.deviceId !== 'default',
            )
            .map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
        </select>
      </label>
      <button type="button" className="btn btn-secondary" onClick={() => void setup.check()}>
        {setup.checking ? 'Checking devices…' : 'Check selected devices'}
      </button>
      {setup.error && <p role="alert">{setup.error}</p>}
      {setup.stream && <p role="status">Microphone available. Use headphones to prevent echo.</p>}
      {setup.stream?.getVideoTracks().length ? (
        <StageVideo stream={setup.stream} muted label="Private camera preview" />
      ) : null}
    </fieldset>
  )
}
