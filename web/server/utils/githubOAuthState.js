import { createHmac, timingSafeEqual } from 'crypto'

const STATE_TTL_MS = 10 * 60 * 1000
const ALLOWED_TRANSPORTS = new Set(['poll', 'deep-link'])

function getStateSecret(config) {
  return String(config.githubClientSecret || config.githubClientId || '')
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodePayload(encoded) {
  const raw = Buffer.from(encoded, 'base64url').toString('utf8')
  return JSON.parse(raw)
}

function signPayload(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

export function createSignedOAuthState({ originalState, transport = 'poll' }, config) {
  const normalizedTransport = ALLOWED_TRANSPORTS.has(transport) ? transport : 'poll'
  const secret = getStateSecret(config)
  if (!secret) {
    throw new Error('GitHub OAuth state secret is not configured')
  }

  const encodedPayload = encodePayload({
    originalState,
    transport: normalizedTransport,
    issuedAt: Date.now(),
  })

  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`
}

export function verifySignedOAuthState(signedState, config) {
  const [encodedPayload, signature, ...rest] = String(signedState || '').split('.')
  if (!encodedPayload || !signature || rest.length > 0) return null

  const secret = getStateSecret(config)
  if (!secret) return null

  const expectedSignature = signPayload(encodedPayload, secret)
  const providedBytes = Buffer.from(signature, 'utf8')
  const expectedBytes = Buffer.from(expectedSignature, 'utf8')
  if (providedBytes.length !== expectedBytes.length) return null
  if (!timingSafeEqual(providedBytes, expectedBytes)) return null

  let payload
  try {
    payload = decodePayload(encodedPayload)
  } catch {
    return null
  }

  if (typeof payload?.originalState !== 'string' || !payload.originalState) return null
  if (typeof payload?.issuedAt !== 'number') return null
  if (Date.now() - payload.issuedAt > STATE_TTL_MS) return null
  if (payload.issuedAt > Date.now() + 60_000) return null

  return {
    originalState: payload.originalState,
    transport: ALLOWED_TRANSPORTS.has(payload.transport) ? payload.transport : 'poll',
    issuedAt: payload.issuedAt,
  }
}
