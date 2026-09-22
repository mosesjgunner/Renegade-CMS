'use client'

/** Browser-only WebAuthn conversion boundary. The server remains the authority for RP ID, origin, challenge, and counters. */
function bytes(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)).buffer as ArrayBuffer
}

function base64url(value: ArrayBuffer | null): string | undefined {
  if (!value) return undefined
  let binary = ''
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function registrationOptions(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const user = options.user as Record<string, string>
  return {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: bytes(String(options.challenge)),
    user: { id: bytes(user.id), name: user.name, displayName: user.displayName },
    excludeCredentials: (
      options.excludeCredentials as Array<Record<string, unknown>> | undefined
    )?.map(
      (credential) =>
        ({
          ...credential,
          id: bytes(String(credential.id)),
        }) as unknown as PublicKeyCredentialDescriptor,
    ),
  }
}

function authenticationOptions(
  options: Record<string, unknown>,
): PublicKeyCredentialRequestOptions {
  return {
    ...(options as unknown as PublicKeyCredentialRequestOptions),
    challenge: bytes(String(options.challenge)),
    allowCredentials: (options.allowCredentials as Array<Record<string, unknown>> | undefined)?.map(
      (credential) =>
        ({
          ...credential,
          id: bytes(String(credential.id)),
        }) as unknown as PublicKeyCredentialDescriptor,
    ),
  }
}

export async function createMemberPasskey(options: Record<string, unknown>) {
  const credential = (await navigator.credentials.create({
    publicKey: registrationOptions(options),
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('No passkey was created.')
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: base64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: base64url(response.clientDataJSON),
      attestationObject: base64url(response.attestationObject),
      transports: response.getTransports?.(),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  }
}

export async function getMemberPasskey(options: Record<string, unknown>) {
  const credential = (await navigator.credentials.get({
    publicKey: authenticationOptions(options),
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('No passkey was selected.')
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: base64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: base64url(response.clientDataJSON),
      authenticatorData: base64url(response.authenticatorData),
      signature: base64url(response.signature),
      userHandle: base64url(response.userHandle),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  }
}
