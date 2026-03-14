<template>
  <div>
    <h3 class="settings-section-title">GitHub</h3>

    <!-- Connected state -->
    <template v-if="workspace.githubUser">
      <div class="gh-connected">
        <img v-if="workspace.githubUser.avatarUrl" :src="workspace.githubUser.avatarUrl" class="gh-avatar" />
        <div class="gh-user-info">
          <span class="gh-username">{{ workspace.githubUser.name || workspace.githubUser.login }}</span>
          <span class="gh-login">@{{ workspace.githubUser.login }}</span>
        </div>
        <button class="gh-disconnect-btn" @click="handleDisconnect" :disabled="loading">
          {{ t('Disconnect') }}
        </button>
      </div>

      <!-- Repo management -->
      <div v-if="error" class="gh-error">{{ error }}</div>
      <div class="gh-section">
        <h4 class="gh-section-label">{{ t('Repository') }}</h4>

        <!-- Currently linked -->
        <template v-if="workspace.remoteUrl">
          <div class="gh-repo-card">
            <div class="gh-repo-info">
              <span class="gh-repo-name">{{ repoDisplayName }}</span>
              <a class="gh-repo-url settings-link" :href="repoHtmlUrl" @click.prevent="openInBrowser(repoHtmlUrl)">
                {{ workspace.remoteUrl }}
              </a>
            </div>
            <button class="gh-unlink-btn" @click="handleUnlink" :disabled="loading">
              {{ t('Unlink') }}
            </button>
          </div>

          <!-- Sync status -->
          <div class="gh-sync-info">
            <span class="gh-sync-dot" :class="syncDotClass"></span>
            <span class="gh-sync-text">{{ syncStatusText }}</span>
            <button v-if="workspace.syncStatus !== 'syncing'" class="gh-sync-now-btn" @click="handleSyncNow" :disabled="loading">
              {{ t('Sync Now') }}
            </button>
          </div>
        </template>

        <!-- Not linked — show options -->
        <template v-else>
          <div class="gh-link-options">
            <!-- Create new repo -->
            <div class="gh-option-card" @click="showCreate = !showCreate; showLink = false">
              <span class="gh-option-title">{{ t('Create New Repository') }}</span>
              <span class="gh-option-desc">{{ t('Create a new GitHub repo and link it to this workspace') }}</span>
            </div>
            <div v-if="showCreate" class="gh-create-form">
              <div class="key-input-row">
                <input
                  v-model="newRepoName"
                  class="key-input"
                  placeholder="repository-name"
                  @keydown.enter="handleCreate"
                />
              </div>
              <label class="gh-private-toggle">
                <button class="tool-toggle-switch" :class="{ on: newRepoPrivate }" @click="newRepoPrivate = !newRepoPrivate">
                  <span class="tool-toggle-knob"></span>
                </button>
                <span>{{ t('Private repository') }}</span>
              </label>
              <div class="keys-actions">
                <button class="key-save-btn" :disabled="loading || !newRepoName.trim()" @click="handleCreate">
                  {{ loading ? t('Creating...') : t('Create & Link') }}
                </button>
              </div>
            </div>

            <!-- Link existing repo -->
            <div class="gh-option-card" @click="handleLoadRepos">
              <span class="gh-option-title">{{ t('Link Existing Repository') }}</span>
              <span class="gh-option-desc">{{ t('Connect this workspace to one of your GitHub repos') }}</span>
            </div>
            <div v-if="showLink" class="gh-link-form">
              <div v-if="reposLoading" class="gh-loading">{{ t('Loading repositories...') }}</div>
              <div v-else-if="repos.length > 0" class="gh-repo-list">
                <div
                  v-for="repo in repos"
                  :key="repo.fullName"
                  class="gh-repo-item"
                  @click="handleLink(repo)"
                >
                  <span class="gh-repo-item-name">{{ repo.fullName }}</span>
                  <span v-if="repo.private" class="gh-repo-badge">{{ t('private') }}</span>
                </div>
              </div>
              <div v-else class="gh-loading">{{ t('No repositories found.') }}</div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Disconnected state -->
    <template v-else>
      <p class="settings-hint">{{ t('Connect your GitHub account to sync this workspace to a repository.') }}</p>

      <div v-if="error" class="gh-error">{{ error }}</div>

      <p class="gh-hint">{{ t('Altals uses an official GitHub authorization page. Most users do not need to change anything here.') }}</p>

      <div class="gh-bridge-status">
        <span class="gh-bridge-status-label">{{ t('Auth service') }}</span>
        <span class="gh-bridge-status-value">{{ githubAuthOrigin || t('Not configured') }}</span>
      </div>

      <div class="gh-bridge-section">
        <button class="gh-pat-toggle" @click="showBridgeSettings = !showBridgeSettings">
          {{ showBridgeSettings ? t('Hide') : t('Override Auth Service URL') }}
        </button>
        <div v-if="showBridgeSettings" class="gh-bridge-form">
          <p class="gh-hint">{{ t('Only change this if you are developing Altals locally or using a self-hosted auth bridge.') }}</p>
          <div class="key-input-row">
            <input
              v-model="authOriginDraft"
              class="key-input"
              type="url"
              placeholder="http://localhost:3000"
              @keydown.enter="handleSaveAuthOrigin"
            />
            <button class="key-save-btn" :disabled="loading" @click="handleSaveAuthOrigin">
              {{ t('Save Auth Service URL') }}
            </button>
          </div>
          <p class="gh-hint">{{ t('Leave blank to use the built-in default auth service.') }}</p>
        </div>
      </div>

      <!-- OAuth connect -->
      <div class="keys-actions">
        <button class="key-save-btn" :disabled="loading" @click="handleConnect">
          {{ loading ? t('Connecting...') : t('Connect GitHub Account') }}
        </button>
      </div>
      <p v-if="loading" class="gh-hint">{{ t('A browser window will open. Authorize the app on GitHub, then return to Altals.') }}</p>

      <!-- PAT fallback -->
      <div class="gh-pat-section">
        <button class="gh-pat-toggle" @click="showPat = !showPat">
          {{ showPat ? t('Hide') : t('Or use a Personal Access Token') }}
        </button>
        <div v-if="showPat" class="gh-pat-form">
          <p class="gh-hint">{{ t('Create a token at GitHub Settings → Developer Settings → Personal Access Tokens with') }} <code>repo</code> {{ t('scope.') }}</p>
          <div class="key-input-row">
            <input
              v-model="patValue"
              class="key-input"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              @keydown.enter="handlePatConnect"
            />
            <button class="key-save-btn" :disabled="!patValue.trim()" @click="handlePatConnect">
              {{ t('Connect') }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { formatRelativeFromNow, useI18n } from '../../i18n'

const workspace = useWorkspaceStore()
const { t } = useI18n()
const GITHUB_AUTH_ORIGIN_STORAGE_KEY = 'githubAuthOrigin'

const loading = ref(false)
const error = ref('')
const showPat = ref(false)
const showBridgeSettings = ref(import.meta.env.DEV)
const patValue = ref('')
const showCreate = ref(false)
const showLink = ref(false)
const newRepoName = ref('')
const newRepoPrivate = ref(true)
const repos = ref([])
const reposLoading = ref(false)
const savedGitHubAuthOrigin = ref(loadSavedGitHubAuthOrigin())
const authOriginDraft = ref(savedGitHubAuthOrigin.value || buildGitHubAuthOrigin())

function normalizeOrigin(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function buildGitHubAuthOrigin() {
  return normalizeOrigin(import.meta.env.VITE_GITHUB_AUTH_ORIGIN || (import.meta.env.DEV ? 'http://localhost:3000' : ''))
}

function loadSavedGitHubAuthOrigin() {
  try {
    return normalizeOrigin(localStorage.getItem(GITHUB_AUTH_ORIGIN_STORAGE_KEY) || '')
  } catch {
    return ''
  }
}

const repoDisplayName = computed(() => {
  const url = workspace.remoteUrl
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/)
  return match ? match[1] : url
})

const githubAuthOrigin = computed(() => normalizeOrigin(savedGitHubAuthOrigin.value || buildGitHubAuthOrigin()))

const repoHtmlUrl = computed(() => {
  const name = repoDisplayName.value
  return name.startsWith('http') ? name : `https://github.com/${name}`
})

const syncDotClass = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced': return 'good'
    case 'syncing': return 'warn'
    case 'error': case 'conflict': return 'error'
    default: return 'none'
  }
})

const syncStatusText = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced':
      if (workspace.lastSyncTime) {
        return t('Synced {when}', { when: formatRelativeFromNow(workspace.lastSyncTime) })
      }
      return t('Synced')
    case 'syncing': return t('Syncing...')
    case 'conflict': return t('Conflict - saved to branch {branch}', { branch: workspace.syncConflictBranch })
    case 'error': return workspace.syncError || t('Sync error')
    case 'idle': return t('Ready')
    default: return t('Not connected')
  }
})

async function openInBrowser(url) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch {}
}

async function handleConnect() {
  error.value = ''
  loading.value = true
  try {
    if (!githubAuthOrigin.value) {
      error.value = t('GitHub sign-in is not configured in this build yet. Please use a release with a configured auth service, or connect with a Personal Access Token.')
      loading.value = false
      return
    }

    const { open } = await import('@tauri-apps/plugin-shell')

    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    const state = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')

    await open(`${githubAuthOrigin.value}/api/v1/auth/github/connect?state=${state}`)

    // Poll for the GitHub token after the OAuth callback stores it.
    const tokenData = await pollForGitHubToken(state)
    if (tokenData?.token) {
      await workspace.connectGitHub(tokenData)
    } else {
      error.value = t('Connection timed out. Please try again.')
    }
  } catch (e) {
    console.error('[github] Connect failed:', e)
    error.value = String(e.message || e)
  }
  loading.value = false
}

async function pollForGitHubToken(state) {
  if (!githubAuthOrigin.value) return null

  const url = `${githubAuthOrigin.value}/api/v1/auth/github/poll`

  for (let i = 0; i < 150; i++) { // 5 min timeout (150 * 2s)
    await new Promise(r => setTimeout(r, 2000))
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      })
      if (!response.ok) continue
      const parsed = await response.json()
      if (parsed.pending) continue
      if (parsed.token) return parsed
    } catch {}
  }
  return null
}

function handleSaveAuthOrigin() {
  const normalized = normalizeOrigin(authOriginDraft.value)
  savedGitHubAuthOrigin.value = normalized
  authOriginDraft.value = normalized || buildGitHubAuthOrigin()
  try {
    if (normalized) {
      localStorage.setItem(GITHUB_AUTH_ORIGIN_STORAGE_KEY, normalized)
    } else {
      localStorage.removeItem(GITHUB_AUTH_ORIGIN_STORAGE_KEY)
    }
  } catch {}
  error.value = ''
}

async function handlePatConnect() {
  error.value = ''
  loading.value = true
  try {
    await workspace.connectGitHub({ token: patValue.value.trim() })
    patValue.value = ''
    showPat.value = false
  } catch (e) {
    error.value = e.message || t('Invalid token')
  }
  loading.value = false
}

async function handleDisconnect() {
  loading.value = true
  await workspace.disconnectGitHub()
  loading.value = false
}

async function handleLoadRepos() {
  showLink.value = !showLink.value
  showCreate.value = false
  if (!showLink.value) return

  reposLoading.value = true
  try {
    const { listGitHubRepos } = await import('../../services/githubSync')
    repos.value = await listGitHubRepos(workspace.githubToken.token)
  } catch (e) {
    error.value = e.message || t('Failed to load repos')
  }
  reposLoading.value = false
}

async function handleCreate() {
  if (!newRepoName.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const { createGitHubRepo } = await import('../../services/githubSync')
    const repo = await createGitHubRepo(workspace.githubToken.token, newRepoName.value.trim(), newRepoPrivate.value)
    await workspace.linkRepo(repo.cloneUrl)
    showCreate.value = false
    newRepoName.value = ''
  } catch (e) {
    error.value = String(e.message || e)
    console.error('[github] Create repo failed:', e)
  }
  loading.value = false
}

async function handleLink(repo) {
  loading.value = true
  error.value = ''
  try {
    await workspace.linkRepo(repo.cloneUrl)
    showLink.value = false
  } catch (e) {
    error.value = e.message || t('Failed to link repository')
  }
  loading.value = false
}

async function handleUnlink() {
  loading.value = true
  await workspace.unlinkRepo()
  loading.value = false
}

async function handleSyncNow() {
  loading.value = true
  await workspace.syncNow()
  loading.value = false
}
</script>

<style scoped>
.gh-connected {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  margin-bottom: 20px;
}

.gh-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.gh-user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.gh-username {
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-primary);
}

.gh-login {
  font-size: 11px;
  color: var(--fg-muted);
}

.gh-disconnect-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: none;
  color: var(--fg-muted);
  font-size: 11px;
  cursor: pointer;
}

.gh-disconnect-btn:hover {
  border-color: var(--error);
  color: var(--error);
}

.gh-section {
  margin-top: 4px;
}

.gh-bridge-section {
  margin: 16px 0;
}

.gh-bridge-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  margin-bottom: 12px;
}

.gh-bridge-status-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--fg-muted);
}

.gh-bridge-status-value {
  font-size: 12px;
  color: var(--fg-primary);
  word-break: break-all;
}

.gh-bridge-form {
  margin-top: 10px;
}

.gh-section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.gh-repo-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
}

.gh-repo-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.gh-repo-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-primary);
}

.gh-repo-url {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-unlink-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: none;
  color: var(--fg-muted);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
}

.gh-unlink-btn:hover {
  border-color: var(--error);
  color: var(--error);
}

.gh-sync-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 11px;
  color: var(--fg-muted);
}

.gh-sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gh-sync-dot.good { background: var(--success); }
.gh-sync-dot.warn { background: var(--warning); }
.gh-sync-dot.error { background: var(--error); }
.gh-sync-dot.none { background: var(--fg-muted); opacity: 0.4; }

.gh-sync-text {
  flex: 1;
}

.gh-sync-now-btn {
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: none;
  color: var(--fg-secondary);
  font-size: 11px;
  cursor: pointer;
}

.gh-sync-now-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.gh-link-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-primary);
}

.gh-option-card {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.gh-option-card:hover {
  border-color: var(--accent);
}

.gh-option-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-primary);
}

.gh-option-desc {
  display: block;
  font-size: 11px;
  color: var(--fg-muted);
  margin-top: 2px;
}

.gh-create-form, .gh-link-form {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 6px 6px;
  margin-top: -8px;
  background: var(--bg-primary);
}

.gh-private-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--fg-secondary);
  cursor: pointer;
}

.gh-repo-list {
  max-height: 200px;
  overflow-y: auto;
}

.gh-repo-item {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.gh-repo-item:hover {
  background: var(--bg-hover);
}

.gh-repo-item-name {
  font-size: 12px;
  color: var(--fg-secondary);
}

.gh-repo-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  color: var(--fg-muted);
}

.gh-loading {
  padding: 8px 0;
  font-size: 12px;
  color: var(--fg-muted);
}

.gh-error {
  margin-bottom: 12px;
  padding: 6px 10px;
  border-radius: 5px;
  background: rgba(247, 118, 142, 0.1);
  color: var(--error);
  font-size: 11px;
}

.gh-hint {
  margin-top: 10px;
  font-size: 11px;
  color: var(--fg-muted);
  line-height: 1.5;
}

.gh-hint code {
  background: var(--bg-tertiary);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

.gh-pat-section {
  margin-top: 20px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.gh-pat-toggle {
  font-size: 12px;
  color: var(--fg-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.gh-pat-toggle:hover {
  color: var(--fg-secondary);
}

.gh-pat-form {
  margin-top: 10px;
}
</style>
