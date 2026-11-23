import type { LiveConnection } from './provider'

function gatherIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout)
      peer.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => {
      if (peer.iceGatheringState === 'complete') finish()
    }
    const timeout = setTimeout(finish, 5000)
    peer.addEventListener('icegatheringstatechange', check)
  })
}

export async function publishWhip(stream: MediaStream, connection: LiveConnection) {
  const peer = new RTCPeerConnection({ iceServers: connection.iceServers })
  const endpoint = new URL(connection.whipUrl, location.origin)
  const headers = new Headers(
    connection.authorization ? { Authorization: connection.authorization } : {},
  )
  let session: URL | null = null
  const close = async () => {
    peer.close()
    if (session)
      await fetch(session, {
        method: 'DELETE',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined)
  }
  try {
    for (const track of stream.getTracks()) {
      const transceiver = peer.addTransceiver(track, { streams: [stream], direction: 'sendonly' })
      const mime = track.kind === 'video' ? 'video/H264' : 'audio/opus'
      const codecs = RTCRtpSender.getCapabilities(track.kind)?.codecs.filter(
        (codec) => codec.mimeType.toLowerCase() === mime.toLowerCase(),
      )
      if (!codecs?.length) throw new Error(`Your browser cannot publish ${mime}.`)
      transceiver.setCodecPreferences(codecs)
      if (track.kind === 'video') {
        const parameters = transceiver.sender.getParameters()
        parameters.encodings[0].maxBitrate = 2_500_000
        await transceiver.sender.setParameters(parameters)
      }
    }
    await peer.setLocalDescription(await peer.createOffer())
    await gatherIce(peer)
    headers.set('Content-Type', 'application/sdp')
    const answer = await fetch(endpoint, {
      method: 'POST',
      body: peer.localDescription?.sdp,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (answer.status !== 201) throw new Error('The media service declined the connection.')
    const remote = answer.headers.get('location')
    if (remote) {
      const next = new URL(remote, endpoint)
      if (next.origin === endpoint.origin) session = next
    }
    await peer.setRemoteDescription({ type: 'answer', sdp: await answer.text() })
    return { peer, close }
  } catch (error) {
    await close()
    throw error
  }
}
