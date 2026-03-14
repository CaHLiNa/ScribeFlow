import { createHmac, timingSafeEqual } from 'crypto'

const STATE_TTL_MS = 10 * 60 * 1000
const ALLOWED_TRANSPORTS = new Set(['poll', 'deep-link', 'loopback'])

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

export function createSignedOAuthState({ originalState, transport = 'poll', returnTo = '' }, config) {
  const normalizedTransport = ALLOWED_TRANSPORTS.has(transport) ? transport : 'poll'
  const secret = getStateSecret(config)
  if (!secret) {
    throw new Error('GitHub OAuth state secret is not configured')
  }

  const normalizedReturnTo = normalizedTransport === 'loopback'
    ? normalizeLoopbackReturnTo(returnTo)
    : ''

  const encodedPayload = encodePayload({
    originalState,
    transport: normalizedTransport,
    returnTo: normalizedReturnTo,
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
  const returnTo = normalizeLoopbackReturnTo(payload?.returnTo)
  if (payload.transport === 'loopback' && !returnTo) return null

  return {
    originalState: payload.originalState,
    transport: ALLOWED_TRANSPORTS.has(payload.transport) ? payload.transport : 'poll',
    issuedAt: payload.issuedAt,
    returnTo,
  }
}

export function normalizeLoopbackReturnTo(value = '') {
  try {
    const url = new URL(String(value || ''))
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== 'http:') return ''
    if (!['127.0.0.1', 'localhost'].includes(hostname)) return ''
    if (!url.port) return ''
    if (url.pathname !== '/auth/github/callback') return ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}
