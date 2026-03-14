// GET /api/v1/auth/github/callback?code=xxx&state=xxx
// GitHub redirects here after user authorizes the OAuth app
// Exchanges the code for a GitHub access token, then either stores it for polling
// (dev) or redirects back to the desktop app via altals:// (production)

import { hashValue, setGitHubToken, markCodeUsed, isCodeUsed } from '../../../../utils/githubTokenStore.js'
import { verifySignedOAuthState } from '../../../../utils/githubOAuthState.js'

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><title>GitHub Connected</title></head>
<body style="font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1b26; color: #c0caf5;">
  <div style="text-align: center;">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ece6a" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <h2>GitHub Connected</h2>
    <p>You can close this window and return to the desktop app.</p>
  </div>
  <script>setTimeout(() => window.close(), 3000)</script>
</body>
</html>`

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildDeepLinkUrl({ state, token, error = '' }) {
  const params = new URLSearchParams({ state })
  if (token) params.set('token', token)
  if (error) params.set('error', error)
  return `altals://auth/github?${params.toString()}`
}

function buildLoopbackReturnUrl(baseUrl, { state, token, error = '' }) {
  const url = new URL(baseUrl)
  url.searchParams.set('state', state)
  if (token) url.searchParams.set('token', token)
  if (error) url.searchParams.set('error', error)
  return url.toString()
}

function buildDeepLinkHtml(url, title, message) {
  const safeUrl = url.replace(/&/g, '&amp;')
  return `<!DOCTYPE html>
<html>
<head><title>${escapeHtml(title)}</title></head>
<body style="font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1b26; color: #c0caf5;">
  <div style="text-align: center; max-width: 420px; padding: 24px;">
    <h2 style="margin: 0 0 12px;">${escapeHtml(title)}</h2>
    <p style="margin: 0 0 18px; line-height: 1.5;">${escapeHtml(message)}</p>
    <a href="${safeUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #9ece6a; color: #1a1b26; text-decoration: none; font-weight: 600;">
      Return to Altals
    </a>
  </div>
  <script>
    const target = ${JSON.stringify(url)}
    window.location.replace(target)
    setTimeout(() => { window.location.href = target }, 800)
  </script>
</body>
</html>`
}

function buildLoopbackHtml(url, title, message) {
  const safeUrl = url.replace(/&/g, '&amp;')
  return `<!DOCTYPE html>
<html>
<head><title>${escapeHtml(title)}</title></head>
<body style="font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1b26; color: #c0caf5;">
  <div style="text-align: center; max-width: 460px; padding: 24px;">
    <h2 style="margin: 0 0 12px;">${escapeHtml(title)}</h2>
    <p style="margin: 0 0 18px; line-height: 1.5;">${escapeHtml(message)}</p>
    <p style="margin: 0 0 20px; line-height: 1.5; color: #a9b1d6;">
      Altals should finish connecting in a moment. If it does not, click the button below once.
    </p>
    <a href="${safeUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #9ece6a; color: #1a1b26; text-decoration: none; font-weight: 600;">
      Retry Local Callback
    </a>
  </div>
  <script>
    const target = ${JSON.stringify(url)}
    let attempts = 0
    let delivered = false
    let topLevelNavigated = false

    function withCacheBust(urlValue) {
      const next = new URL(urlValue)
      next.searchParams.set('_ts', String(Date.now()))
      return next.toString()
    }

    function markDelivered() {
      delivered = true
    }

    function navigateTopLevel() {
      if (delivered || topLevelNavigated) return
      topLevelNavigated = true
      window.location.assign(withCacheBust(target))
    }

    function deliverToLoopback() {
      if (attempts >= 6 || delivered) return
      attempts += 1

      const nextTarget = withCacheBust(target)

      try {
        fetch(nextTarget, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
        })
          .then(() => { markDelivered() })
          .catch(() => {})
      } catch {}

      try {
        const img = new Image()
        img.style.display = 'none'
        img.src = nextTarget
        document.body.appendChild(img)
        setTimeout(() => img.remove(), 5000)
      } catch {}

      try {
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = nextTarget
        iframe.onload = () => { markDelivered() }
        document.body.appendChild(iframe)
        setTimeout(() => iframe.remove(), 5000)
      } catch {}
    }

    deliverToLoopback()
    setTimeout(deliverToLoopback, 250)
    setTimeout(deliverToLoopback, 1000)
    setTimeout(navigateTopLevel, 1500)
    setTimeout(deliverToLoopback, 2500)
    setTimeout(navigateTopLevel, 3500)
  </script>
</body>
</html>`
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const {
    code,
    state: signedState,
    error: githubError,
    error_description: githubErrorDescription,
  } = query
  const config = useRuntimeConfig()

  if (!signedState) {
    setResponseStatus(event, 400)
    return { error: 'Missing state' }
  }

  const verifiedState = verifySignedOAuthState(signedState, config)
  if (!verifiedState) {
    setResponseStatus(event, 403)
    return { error: 'Invalid or expired OAuth state. Please try connecting again.' }
  }

  const { originalState, transport, returnTo } = verifiedState

  if (githubError) {
    const message = String(githubErrorDescription || githubError)
    if (transport === 'deep-link') {
      setHeader(event, 'Cache-Control', 'no-store')
      setHeader(event, 'Content-Type', 'text/html')
      return buildDeepLinkHtml(
        buildDeepLinkUrl({ state: originalState, error: message }),
        'GitHub Authorization Canceled',
        'Return to Altals to retry the connection.'
      )
    }
    if (transport === 'loopback' && returnTo) {
      setHeader(event, 'Cache-Control', 'no-store')
      setHeader(event, 'Content-Type', 'text/html')
      return buildLoopbackHtml(
        buildLoopbackReturnUrl(returnTo, { state: originalState, error: message }),
        'GitHub Authorization Canceled',
        'Return to Altals to retry the connection.'
      )
    }

    setResponseStatus(event, 400)
    return { error: message }
  }

  if (!code) {
    setResponseStatus(event, 400)
    return { error: 'Missing code' }
  }

  // Guard against double-hit (browser can fire callback twice)
  // This is only a best-effort optimization; GitHub also rejects reused codes.
  if (isCodeUsed(code)) {
    setHeader(event, 'Content-Type', 'text/html')
    return SUCCESS_HTML
  }

  markCodeUsed(code)

  // Exchange code for GitHub access token
  let ghToken
  try {
    const response = await $fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: {
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
      },
    })

    if (response.error) {
      setResponseStatus(event, 400)
      return { error: response.error_description || response.error }
    }

    ghToken = response.access_token
  } catch (e) {
    setResponseStatus(event, 500)
    return { error: 'Failed to exchange code with GitHub' }
  }

  if (!ghToken) {
    setResponseStatus(event, 400)
    return { error: 'No access token received from GitHub' }
  }

  if (transport === 'deep-link') {
    setHeader(event, 'Cache-Control', 'no-store')
    setHeader(event, 'Content-Type', 'text/html')
    return buildDeepLinkHtml(
      buildDeepLinkUrl({ state: originalState, token: ghToken }),
      'GitHub Connected',
      'Altals is ready to finish connecting your GitHub account.'
    )
  }
  if (transport === 'loopback' && returnTo) {
    setHeader(event, 'Cache-Control', 'no-store')
    setHeader(event, 'Content-Type', 'text/html')
    return buildLoopbackHtml(
      buildLoopbackReturnUrl(returnTo, { state: originalState, token: ghToken }),
      'GitHub Connected',
      'Altals is ready to finish connecting your GitHub account.'
    )
  }

  // Fetch GitHub user info
  let ghUser
  try {
    ghUser = await $fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${ghToken}`,
        'Accept': 'application/vnd.github+json',
      },
    })
  } catch {
    ghUser = {}
  }

  // Store in memory for desktop polling (2 min TTL, one-time read)
  // Use the original state (what the desktop client knows) for the hash
  const stateHash = hashValue(originalState)
  setGitHubToken(stateHash, {
    token: ghToken,
    login: ghUser.login,
    name: ghUser.name,
    email: ghUser.email,
    id: ghUser.id,
    avatarUrl: ghUser.avatar_url,
  })

  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Content-Type', 'text/html')
  return SUCCESS_HTML
})
