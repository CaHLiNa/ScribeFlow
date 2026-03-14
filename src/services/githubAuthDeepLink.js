const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function parseGitHubAuthDeepLink(urlValue = '') {
  try {
    const url = new URL(urlValue)
    if (url.protocol !== 'altals:') return null

    const route = `${url.hostname}${url.pathname}`.replace(/\/+$/, '')
    if (route !== 'auth/github') return null

    const state = url.searchParams.get('state') || ''
    const token = url.searchParams.get('token') || ''
    const error = url.searchParams.get('error') || ''
    if (!state) return null

    return { state, token, error }
  } catch {
    return null
  }
}

function matchDeepLink(urls, expectedState) {
  for (const urlValue of urls || []) {
    const parsed = parseGitHubAuthDeepLink(urlValue)
    if (!parsed) continue
    if (expectedState && parsed.state !== expectedState) continue
    return parsed
  }
  return null
}

export async function createGitHubAuthDeepLinkWaiter(expectedState, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')

  let settled = false
  let timeoutId = null
  let unlisten = null
  let resolveWaiter
  let rejectWaiter

  const promise = new Promise((resolve, reject) => {
    resolveWaiter = resolve
    rejectWaiter = reject
  })

  function cleanup() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (unlisten) {
      const fn = unlisten
      unlisten = null
      try { fn() } catch {}
    }
  }

  function finishWithResult(result) {
    if (settled) return
    settled = true
    cleanup()
    resolveWaiter(result)
  }

  function finishWithError(error) {
    if (settled) return
    settled = true
    cleanup()
    rejectWaiter(error instanceof Error ? error : new Error(String(error || 'Deep link failed')))
  }

  function handleUrls(urls) {
    const matched = matchDeepLink(urls, expectedState)
    if (!matched) return false
    if (matched.error) {
      finishWithError(new Error(matched.error))
    } else if (matched.token) {
      finishWithResult({ token: matched.token })
    } else {
      return false
    }
    return true
  }

  try {
    unlisten = await onOpenUrl((urls) => {
      handleUrls(urls)
    })

    if (!handleUrls(await getCurrent())) {
      timeoutId = setTimeout(() => {
        finishWithError(new Error('GitHub deep link timed out'))
      }, timeoutMs)
    }
  } catch (error) {
    finishWithError(error)
  }

  return {
    promise,
    cancel() {
      if (settled) return
      settled = true
      cleanup()
    },
  }
}
