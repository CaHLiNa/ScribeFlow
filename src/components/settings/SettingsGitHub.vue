<template>
  <div>
    <h3 class="settings-section-title">GitHub</h3>

    <!-- Connected state -->
    <template v-if="workspace.githubUser">
      <div class="gh-connected ui-surface-card">
        <img
          v-if="workspace.githubUser.avatarUrl"
          :src="workspace.githubUser.avatarUrl"
          class="gh-avatar"
        />
        <div class="gh-user-info">
          <span class="gh-username">{{
            workspace.githubUser.name || workspace.githubUser.login
          }}</span>
          <span class="gh-login">@{{ workspace.githubUser.login }}</span>
        </div>
        <div class="gh-account-actions">
          <UiButton
            class="gh-action-btn"
            variant="secondary"
            size="sm"
            :loading="loading && authAction === 'switch'"
            @click="handleSwitchAccount"
          >
            {{
              loading && authAction === 'switch' ? t('Switching account...') : t('Switch Account')
            }}
          </UiButton>
          <UiButton
            class="gh-action-btn"
            variant="danger"
            size="sm"
            :loading="loading && authAction === 'disconnect'"
            @click="handleDisconnect"
          >
            {{ t('Disconnect') }}
          </UiButton>
        </div>
      </div>

      <!-- Repo management -->
      <div v-if="error" class="gh-error">{{ error }}</div>
      <div class="gh-section">
        <h4 class="gh-section-label">{{ t('Repository') }}</h4>

        <!-- Currently linked -->
        <template v-if="workspace.remoteUrl">
          <div class="gh-repo-card ui-surface-card">
            <div class="gh-repo-info">
              <span class="gh-repo-name">{{ repoDisplayName }}</span>
              <a
                class="gh-repo-url settings-link"
                :href="repoHtmlUrl"
                @click.prevent="openInBrowser(repoHtmlUrl)"
              >
                {{ workspace.remoteUrl }}
              </a>
            </div>
            <UiButton
              class="gh-action-btn"
              variant="danger"
              size="sm"
              :disabled="loading"
              @click="handleUnlink"
            >
              {{ t('Unlink') }}
            </UiButton>
          </div>

          <!-- Sync status -->
          <div class="gh-sync-info">
            <span class="gh-sync-dot" :class="syncDotClass"></span>
            <span class="gh-sync-text">{{ syncStatusText }}</span>
            <UiButton
              v-if="workspace.syncStatus !== 'syncing'"
              class="gh-action-btn"
              variant="secondary"
              size="sm"
              :disabled="loading"
              @click="handleSyncNow"
            >
              {{ t('Sync Now') }}
            </UiButton>
          </div>
        </template>

        <!-- Not linked — show options -->
        <template v-else>
          <div class="gh-link-options">
            <!-- Create new repo -->
            <UiButton
              class="gh-option-card settings-choice-card"
              variant="secondary"
              size="sm"
              block
              content-mode="raw"
              @click="toggleCreateRepoForm"
            >
              <span class="settings-choice-card-copy">
                <span class="gh-option-title settings-choice-card-title">{{
                  t('Create New Repository')
                }}</span>
                <span class="gh-option-desc settings-choice-card-desc">{{
                  t('Create a new GitHub repo and link it to this workspace')
                }}</span>
              </span>
            </UiButton>
            <div v-if="showCreate" class="gh-create-form">
              <div class="key-input-row">
                <UiInput
                  v-model="newRepoName"
                  placeholder="repository-name"
                  spellcheck="false"
                  @keydown.enter="handleCreate"
                />
              </div>
              <label class="gh-private-toggle">
                <UiSwitch v-model="newRepoPrivate" :aria-label="t('Private repository')" />
                <span>{{ t('Private repository') }}</span>
              </label>
              <div class="keys-actions">
                <UiButton
                  variant="primary"
                  :disabled="loading || !newRepoName.trim()"
                  @click="handleCreate"
                >
                  {{ loading ? t('Creating...') : t('Create & Link') }}
                </UiButton>
              </div>
            </div>

            <!-- Link existing repo -->
            <UiButton
              class="gh-option-card settings-choice-card"
              variant="secondary"
              size="sm"
              block
              content-mode="raw"
              @click="handleLoadRepos"
            >
              <span class="settings-choice-card-copy">
                <span class="gh-option-title settings-choice-card-title">{{
                  t('Link Existing Repository')
                }}</span>
                <span class="gh-option-desc settings-choice-card-desc">{{
                  t('Connect this workspace to one of your GitHub repos')
                }}</span>
              </span>
            </UiButton>
            <div v-if="showLink" class="gh-link-form">
              <div v-if="reposLoading" class="gh-loading">{{ t('Loading repositories...') }}</div>
              <div v-else-if="repos.length > 0" class="gh-repo-list">
                <UiButton
                  v-for="repo in repos"
                  :key="repo.fullName"
                  class="gh-repo-item settings-list-button"
                  variant="ghost"
                  size="sm"
                  block
                  content-mode="raw"
                  @click="handleLink(repo)"
                >
                  <span class="settings-list-button-copy">
                    <span class="gh-repo-item-name">{{ repo.fullName }}</span>
                  </span>
                  <span v-if="repo.private" class="gh-repo-badge">{{ t('private') }}</span>
                </UiButton>
              </div>
              <div v-else class="gh-loading">{{ t('No repositories found.') }}</div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Disconnected state -->
    <template v-else>
      <p class="settings-hint">
        {{ t('Connect your GitHub account to sync this workspace to a repository.') }}
      </p>

      <div v-if="error" class="gh-error">{{ error }}</div>

      <p class="gh-hint">
        {{ t('Altals will open the official GitHub authorization page in your browser.') }}
      </p>

      <!-- OAuth connect -->
      <div class="keys-actions">
        <UiButton
          variant="primary"
          :loading="loading && authAction === 'connect'"
          @click="handleConnect"
        >
          {{ loading ? t('Connecting...') : t('Connect GitHub Account') }}
        </UiButton>
      </div>
      <p v-if="loading" class="gh-hint">
        {{ t('A browser window will open. Authorize the app on GitHub, then return to Altals.') }}
      </p>

      <!-- PAT fallback -->
      <div class="gh-pat-section">
        <UiButton class="gh-pat-toggle" variant="ghost" size="sm" @click="showPat = !showPat">
          {{ showPat ? t('Hide') : t('Or use a Personal Access Token') }}
        </UiButton>
        <div v-if="showPat" class="gh-pat-form">
          <p class="gh-hint">
            {{
              t(
                'Create a token at GitHub Settings → Developer Settings → Personal Access Tokens with'
              )
            }}
            <code>repo</code> {{ t('scope.') }}
          </p>
          <div class="key-input-row">
            <UiInput
              v-model="patValue"
              type="password"
              monospace
              placeholder="ghp_xxxxxxxxxxxx"
              @keydown.enter="handlePatConnect"
            />
            <UiButton
              variant="primary"
              :disabled="!patValue.trim()"
              :loading="loading && authAction === 'pat'"
              @click="handlePatConnect"
            >
              {{ t('Connect') }}
            </UiButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUxStatusStore } from '../../stores/uxStatus'
import { formatRelativeFromNow, useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const uxStatusStore = useUxStatusStore()
const { t } = useI18n()

const loading = ref(false)
const error = ref('')
const authAction = ref('idle')
const showPat = ref(false)
const patValue = ref('')
const showCreate = ref(false)
const showLink = ref(false)
const newRepoName = ref('')
const newRepoPrivate = ref(true)
const repos = ref([])
const reposLoading = ref(false)

onMounted(async () => {
  clearLegacyGitHubAuthOrigin()
  loading.value = true
  try {
    await workspace.ensureGitHubInitialized({ localOnly: true })
  } catch (e) {
    console.warn('[github] Deferred init failed:', e)
  } finally {
    loading.value = false
  }
})

function normalizeOrigin(value = '') {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

function buildGitHubAuthOrigin() {
  return normalizeOrigin(import.meta.env.VITE_GITHUB_AUTH_ORIGIN || '')
}

function clearLegacyGitHubAuthOrigin() {
  try {
    localStorage.removeItem('githubAuthOrigin')
  } catch {
    // Ignore storage cleanup failures.
  }
}

function isLocalhostOrigin(value = '') {
  return /^https?:\/\/(localhost|127(?:\.\d+){3})(:\d+)?$/i.test(String(value || ''))
}

function getGitHubAuthTransport() {
  if (isLocalhostOrigin(githubAuthOrigin.value)) return 'poll'
  // Loopback is more reliable for packaged desktop builds, especially on
  // Windows where deep links arrive via a new process unless single-instance
  // forwarding is wired up explicitly.
  return 'loopback'
}

let nativeWindowHandle = null

async function focusAltalsWindow() {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return
  try {
    if (!nativeWindowHandle) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      nativeWindowHandle = getCurrentWindow()
    }

    await nativeWindowHandle.show().catch(() => {})
    await nativeWindowHandle.setFocus().catch(() => {})
  } catch {
    // Ignore window focus failures outside the desktop shell.
  }
}

const repoDisplayName = computed(() => {
  const url = workspace.remoteUrl
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/)
  return match ? match[1] : url
})

const githubAuthOrigin = computed(() => buildGitHubAuthOrigin())

const repoHtmlUrl = computed(() => {
  const name = repoDisplayName.value
  return name.startsWith('http') ? name : `https://github.com/${name}`
})

const syncDotClass = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced':
      return 'good'
    case 'syncing':
      return 'warn'
    case 'error':
    case 'conflict':
      return 'error'
    default:
      return 'none'
  }
})

const syncStatusText = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced':
      if (workspace.lastSyncTime) {
        return t('Synced {when}', { when: formatRelativeFromNow(workspace.lastSyncTime) })
      }
      return t('Synced')
    case 'syncing':
      return t('Syncing...')
    case 'conflict':
      return t('Conflict - saved to branch {branch}', { branch: workspace.syncConflictBranch })
    case 'error':
      return workspace.syncError || t('Sync error')
    case 'idle':
      return t('Ready')
    default:
      return t('Not connected')
  }
})

async function ensureGitHubSyncAvailable() {
  const { ensureGitHubSyncReady } = await import('../../services/environmentPreflight.js')
  return ensureGitHubSyncReady()
}

async function openInBrowser(url) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch {
    // Ignore shell open failures in settings surface.
  }
}

function resetConnectionForms() {
  showPat.value = false
  patValue.value = ''
  showCreate.value = false
  showLink.value = false
  repos.value = []
}

function toggleCreateRepoForm() {
  showCreate.value = !showCreate.value
  showLink.value = false
}

async function startGitHubOAuth(options = {}) {
  const allowExisting = options.allowExisting === true
  const prompt = String(options.prompt || '').trim()
  error.value = ''
  loading.value = true
  authAction.value = allowExisting ? 'switch' : 'connect'
  let deepLinkWaiter = null
  let loopbackWaiter = null
  try {
    const existing = await workspace.ensureGitHubInitialized()
    if (!allowExisting && (existing?.token || workspace.githubToken?.token)) {
      return
    }

    if (!githubAuthOrigin.value) {
      error.value = t(
        'GitHub sign-in is not configured in this build yet. Please use a release with a configured auth service, or connect with a Personal Access Token.'
      )
      return
    }

    const { open } = await import('@tauri-apps/plugin-shell')

    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    const state = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
    const transport = getGitHubAuthTransport()
    let returnTo = ''

    if (transport === 'deep-link') {
      const { createGitHubAuthDeepLinkWaiter } = await import('../../services/githubAuthDeepLink')
      deepLinkWaiter = await createGitHubAuthDeepLinkWaiter(state)
    } else if (transport === 'loopback') {
      const { createGitHubAuthLoopbackWaiter } = await import('../../services/githubAuthLoopback')
      loopbackWaiter = await createGitHubAuthLoopbackWaiter()
      returnTo = loopbackWaiter.returnTo
    }

    const params = new URLSearchParams({ state, transport })
    if (returnTo) params.set('return_to', returnTo)
    if (prompt) params.set('prompt', prompt)

    await open(`${githubAuthOrigin.value}/api/v1/auth/github/connect?${params.toString()}`)

    const tokenData =
      transport === 'deep-link'
        ? await deepLinkWaiter?.promise
        : transport === 'loopback'
          ? await loopbackWaiter?.promise
          : await pollForGitHubToken(state)

    if (tokenData?.token) {
      await workspace.connectGitHub(tokenData)
      resetConnectionForms()
      await focusAltalsWindow()
    } else {
      error.value = t('Connection timed out. Please try again.')
    }
  } catch (e) {
    deepLinkWaiter?.cancel?.()
    loopbackWaiter?.cancel?.()
    console.error('[github] Connect failed:', e)
    error.value = String(e.message || e)
  } finally {
    authAction.value = 'idle'
    loading.value = false
  }
}

async function handleConnect() {
  await startGitHubOAuth()
}

async function handleSwitchAccount() {
  await startGitHubOAuth({
    allowExisting: true,
    prompt: 'select_account',
  })
}

async function pollForGitHubToken(state) {
  if (!githubAuthOrigin.value) return null

  const url = `${githubAuthOrigin.value}/api/v1/auth/github/poll`

  for (let i = 0; i < 150; i++) {
    // 5 min timeout (150 * 2s)
    await new Promise((r) => setTimeout(r, 2000))
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
    } catch {
      // Keep polling until timeout when the auth service is temporarily unavailable.
    }
  }
  return null
}

async function handlePatConnect() {
  error.value = ''
  loading.value = true
  authAction.value = 'pat'
  try {
    await workspace.connectGitHub({ token: patValue.value.trim() })
    resetConnectionForms()
  } catch (e) {
    error.value = e.message || t('Invalid token')
  } finally {
    authAction.value = 'idle'
    loading.value = false
  }
}

async function handleDisconnect() {
  loading.value = true
  authAction.value = 'disconnect'
  try {
    await workspace.disconnectGitHub()
    resetConnectionForms()
  } finally {
    authAction.value = 'idle'
    loading.value = false
  }
}

async function handleLoadRepos() {
  showLink.value = !showLink.value
  showCreate.value = false
  if (!showLink.value) return

  reposLoading.value = true
  try {
    await workspace.ensureGitHubInitialized()
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
  const statusId = uxStatusStore.show(t('Linking repository...'), {
    type: 'info',
    duration: 0,
  })
  try {
    await workspace.ensureGitHubInitialized()
    const { createGitHubRepo } = await import('../../services/githubSync')
    const repo = await createGitHubRepo(
      workspace.githubToken.token,
      newRepoName.value.trim(),
      newRepoPrivate.value
    )
    await workspace.linkRepo(repo.cloneUrl)
    showCreate.value = false
    newRepoName.value = ''
    uxStatusStore.update(statusId, t('Repository linked'), {
      type: 'success',
      duration: 3000,
    })
  } catch (e) {
    const message = String(e?.message || e || t('Failed to link repository'))
    const translated = t(message)
    error.value = translated === message ? message : translated
    console.error('[github] Create repo failed:', e)
    uxStatusStore.update(statusId, error.value, {
      type: 'error',
      duration: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function handleLink(repo) {
  loading.value = true
  error.value = ''
  const statusId = uxStatusStore.show(t('Linking repository...'), {
    type: 'info',
    duration: 0,
  })
  try {
    await workspace.linkRepo(repo.cloneUrl)
    showLink.value = false
    uxStatusStore.update(statusId, t('Repository linked'), {
      type: 'success',
      duration: 3000,
    })
  } catch (e) {
    const message = String(e?.message || e || t('Failed to link repository'))
    const translated = t(message)
    error.value = translated === message ? message : translated
    uxStatusStore.update(statusId, error.value, {
      type: 'error',
      duration: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function handleUnlink() {
  loading.value = true
  await workspace.unlinkRepo()
  loading.value = false
}

async function handleSyncNow() {
  error.value = ''
  if (!(await ensureGitHubSyncAvailable())) {
    return
  }
  loading.value = true
  const statusId = uxStatusStore.show(t('Syncing with GitHub...'), {
    type: 'info',
    duration: 0,
  })
  try {
    await workspace.ensureGitHubInitialized()
    const result = await workspace.syncNow()
    if (result?.ok) {
      uxStatusStore.update(statusId, t('Synced with GitHub'), {
        type: 'success',
        duration: 3000,
      })
    } else if (workspace.syncStatus === 'conflict') {
      uxStatusStore.update(statusId, t('Sync conflict needs attention'), {
        type: 'warning',
        duration: 5000,
      })
    } else if (workspace.syncStatus === 'error') {
      uxStatusStore.update(statusId, workspace.syncError || t('Sync failed. Click for details.'), {
        type: 'error',
        duration: 5000,
      })
    } else {
      uxStatusStore.update(statusId, t('GitHub sync finished'), {
        type: 'success',
        duration: 3000,
      })
    }
  } catch (e) {
    error.value = String(e?.message || e || '')
    uxStatusStore.update(statusId, error.value || t('Sync failed. Click for details.'), {
      type: 'error',
      duration: 5000,
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.gh-connected {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  margin-bottom: var(--space-5);
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
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.gh-login {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
}

.gh-account-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.gh-action-btn {
  flex-shrink: 0;
}

.gh-section {
  margin-top: 4px;
}

.gh-section-label {
  font-size: var(--ui-font-label);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-3);
}

.gh-repo-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
}

.gh-repo-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.gh-repo-name {
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.gh-repo-url {
  font-size: var(--ui-font-caption);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-sync-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
}

.gh-sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gh-sync-dot.good {
  background: var(--success);
}
.gh-sync-dot.warn {
  background: var(--warning);
}
.gh-sync-dot.error {
  background: var(--error);
}
.gh-sync-dot.none {
  background: var(--fg-muted);
  opacity: 0.4;
}

.gh-sync-text {
  flex: 1;
}

.gh-link-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.gh-option-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}

.gh-option-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
}

.gh-option-card:focus-visible,
.gh-repo-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.gh-option-title {
  display: block;
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.gh-option-desc {
  display: block;
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  margin-top: 2px;
}

.gh-create-form,
.gh-link-form {
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  margin-top: -8px;
  background: var(--surface-base);
}

.gh-private-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  font-size: var(--ui-font-label);
  color: var(--text-secondary);
  cursor: pointer;
}

.gh-repo-list {
  max-height: 200px;
  overflow-y: auto;
}

.gh-repo-item {
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  text-align: left;
}

.gh-repo-item:hover {
  background: var(--surface-hover);
}

.gh-repo-item-name {
  font-size: var(--ui-font-label);
  color: var(--text-secondary);
}

.gh-repo-badge {
  font-size: var(--ui-font-fine);
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--surface-muted);
  color: var(--text-muted);
}

.gh-loading {
  padding: 8px 0;
  font-size: var(--ui-font-label);
  color: var(--text-muted);
}

.gh-error {
  margin-bottom: var(--space-3);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--error) 12%, transparent);
  color: var(--error);
  font-size: var(--ui-font-caption);
}

.gh-hint {
  margin-top: var(--space-3);
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  line-height: var(--line-height-regular);
}

.gh-hint code {
  background: var(--surface-muted);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: var(--ui-font-micro);
}

.gh-pat-section {
  margin-top: var(--space-5);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-4);
}

.gh-pat-toggle {
  padding: 0;
}

.gh-pat-form {
  margin-top: var(--space-3);
}
</style>
