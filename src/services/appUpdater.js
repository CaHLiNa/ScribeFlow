import { getVersion } from '@tauri-apps/api/app'
const RELEASES_URL = 'https://github.com/CaHLiNa/Altals/releases'
const RELEASES_LATEST_API_URL = 'https://api.github.com/repos/CaHLiNa/Altals/releases/latest'

function normalizeVersionSegment(value = '') {
  const parsed = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeComparableVersion(version = '') {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
}

export function compareVersions(currentVersion = '', nextVersion = '') {
  const current = normalizeComparableVersion(currentVersion).split('.')
  const next = normalizeComparableVersion(nextVersion).split('.')
  const length = Math.max(current.length, next.length)
  for (let index = 0; index < length; index += 1) {
    const left = normalizeVersionSegment(current[index])
    const right = normalizeVersionSegment(next[index])
    if (left === right) continue
    return left < right ? -1 : 1
  }
  return 0
}

export async function getAppVersion() {
  try {
    return await getVersion()
  } catch {
    return '0.0.0'
  }
}

export async function checkForAppUpdates(currentVersion = '') {
  const response = await fetch(RELEASES_LATEST_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}`)
  }

  const payload = await response.json()
  const latestVersion = String(payload?.tag_name || payload?.name || '').trim()
  if (!latestVersion) {
    throw new Error('Latest release version is unavailable.')
  }

  return {
    latestVersion,
    releaseUrl: String(payload?.html_url || RELEASES_URL),
    publishedAt: payload?.published_at || '',
    hasUpdate:
      !!currentVersion && compareVersions(currentVersion, latestVersion) < 0,
  }
}

export async function openReleasesPage(url = RELEASES_URL) {
  const targetUrl = String(url || RELEASES_URL)
  if (typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    window.open(targetUrl, '_blank', 'noopener')
    return
  }
  const { open } = await import('@tauri-apps/plugin-shell')
  await open(targetUrl)
}
