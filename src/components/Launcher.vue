<template>
  <div class="launcher">
    <div class="launcher-shell">
      <section class="launcher-hero ui-surface-card">
        <div class="launcher-kicker">{{ t('Academic writing workspace') }}</div>
        <div class="launcher-brand-row">
          <div class="launcher-logo">A</div>
          <div class="launcher-brand-copy">
            <h1 class="launcher-title">Altals</h1>
            <p class="launcher-tagline">
              {{ t('Markdown, LaTeX, and Typst in one local-first project workspace.') }}
            </p>
          </div>
        </div>

        <div class="launcher-principles">
          <div class="launcher-principle">
            <span class="launcher-principle-label">{{ t('Draft') }}</span>
            <span class="launcher-principle-copy">
              {{ t('Edit notes, papers, and source files in one project tree.') }}
            </span>
          </div>
          <div class="launcher-principle">
            <span class="launcher-principle-label">{{ t('Build') }}</span>
            <span class="launcher-principle-copy">
              {{ t('Preview and compile documents without leaving the workspace.') }}
            </span>
          </div>
          <div class="launcher-principle">
            <span class="launcher-principle-label">{{ t('Protect') }}</span>
            <span class="launcher-principle-copy">
              {{ t('Keep local save points, history, and project context close at hand.') }}
            </span>
          </div>
        </div>

        <div class="launcher-actions">
          <button class="launcher-btn primary" @click="$emit('open-folder')">
            <span>{{ t('Open project folder') }}</span>
            <kbd class="ui-kbd">{{ modKey }}+O</kbd>
          </button>
          <button class="launcher-btn secondary" @click="showClone = true">
            {{ t('Clone repository') }}
          </button>
        </div>

        <p v-if="!showClone" class="launcher-hint">
          {{ t('Start from a local workspace or clone an existing writing project.') }}
        </p>

        <div v-if="showClone" class="launcher-clone-form ui-surface-card">
          <div class="launcher-clone-heading">{{ t('Clone a Git repository into a local workspace') }}</div>
          <input
            ref="urlInputRef"
            v-model="cloneUrl"
            class="launcher-input"
            placeholder="https://github.com/user/repo.git"
            spellcheck="false"
            @keydown.enter="doClone"
            @keydown.escape="cancelClone"
          />
          <div class="launcher-clone-actions">
            <button
              class="launcher-btn primary small"
              :disabled="!cloneUrl.trim() || cloning"
              @click="doClone"
            >
              {{ cloning ? t('Cloning...') : t('Clone repository') }}
            </button>
            <button class="launcher-btn-text" :disabled="cloning" @click="cancelClone">
              {{ t('Cancel') }}
            </button>
          </div>
          <div v-if="cloneError" class="launcher-error">{{ cloneError }}</div>
        </div>
      </section>

      <aside class="launcher-recents ui-surface-card">
        <div class="launcher-recents-header">
          <div>
            <div class="launcher-recents-kicker">{{ t('Continue writing') }}</div>
            <h2 class="launcher-recents-title">{{ t('Recent workspaces') }}</h2>
          </div>
          <div class="launcher-recents-count">{{ recents.length }}</div>
        </div>

        <div v-if="recents.length" class="launcher-recent-list">
          <button
            v-for="r in recents"
            :key="r.path"
            class="launcher-recent"
            @click="$emit('open-workspace', r.path)"
          >
            <span class="launcher-recent-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
              </svg>
            </span>
            <span class="launcher-recent-text">
              <span class="launcher-recent-name">{{ r.name }}</span>
              <span class="launcher-recent-path">{{ shortenPath(r.path) }}</span>
            </span>
            <span class="launcher-recent-meta">{{ t('Open') }}</span>
            <span
              class="launcher-recent-remove"
              :title="t('Remove from recent')"
              @click.stop="removeRecent(r.path)"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </button>
        </div>

        <div v-else class="launcher-empty-state">
          <div class="launcher-empty-title">{{ t('No recent workspace yet') }}</div>
          <p class="launcher-empty-copy">
            {{ t('Open a project folder to start your first local writing workspace.') }}
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../stores/workspace'
import { modKey } from '../platform'
import { useI18n } from '../i18n'

const emit = defineEmits(['open-folder', 'open-workspace'])

const workspace = useWorkspaceStore()
const { t } = useI18n()
const recents = computed(() => workspace.getRecentWorkspaces())

const showClone = ref(false)
const cloneUrl = ref('')
const cloning = ref(false)
const cloneError = ref('')
const urlInputRef = ref(null)

watch(showClone, (val) => {
  if (val) {
    cloneError.value = ''
    nextTick(() => urlInputRef.value?.focus())
  }
})

function cancelClone() {
  showClone.value = false
  cloneUrl.value = ''
  cloneError.value = ''
}

function repoNameFromUrl(url) {
  const cleaned = url.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  return cleaned.split('/').pop() || 'project'
}

async function doClone() {
  const url = cloneUrl.value.trim()
  if (!url || cloning.value) return

  cloneError.value = ''

  const { homeDir } = await import('@tauri-apps/api/path')
  const home = await homeDir()
  const parentDir = await open({
    directory: true,
    multiple: false,
    title: t('Clone into...'),
    defaultPath: home,
  })
  if (!parentDir) return

  const repoName = repoNameFromUrl(url)
  const targetPath = `${parentDir}/${repoName}`

  cloning.value = true
  try {
    if (url.includes('github.com')) {
      await workspace.ensureGitHubInitialized()
    }

    if (workspace.githubToken?.token && url.includes('github.com')) {
      await invoke('git_clone_authenticated', { url, targetPath, token: workspace.githubToken.token })
    } else {
      await invoke('git_clone', { url, targetPath })
    }
    cancelClone()
    emit('open-workspace', targetPath)
  } catch (e) {
    cloneError.value = String(e).replace(/^Error:\s*/i, '')
  } finally {
    cloning.value = false
  }
}

function shortenPath(fullPath) {
  const home = fullPath.match(/^\/Users\/[^/]+/)
  if (home) return fullPath.replace(home[0], '~')
  return fullPath
}

function removeRecent(path) {
  workspace.removeRecent(path)
}
</script>

<style scoped>
.launcher {
  flex: 1;
  overflow: auto;
  padding: var(--space-5);
}

.launcher-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr);
  gap: var(--space-5);
  width: min(100%, var(--shell-hero-width));
  min-height: 100%;
  margin: 0 auto;
  align-items: stretch;
}

.launcher-hero,
.launcher-recents {
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface);
  box-shadow: var(--shell-shadow-soft);
  backdrop-filter: blur(18px);
}

.launcher-hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: 32px;
  justify-content: center;
}

.launcher-kicker,
.launcher-recents-kicker {
  font-size: var(--ui-font-micro);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.launcher-brand-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.launcher-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 92%, white 8%), var(--accent-secondary));
  color: white;
  font-size: var(--ui-font-hero-sm);
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.launcher-brand-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.launcher-title {
  margin: 0;
  font-family: 'Crimson Text', 'Lora', Georgia, serif;
  font-size: var(--ui-font-hero-md);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.launcher-tagline {
  max-width: 580px;
  margin: 0;
  font-size: var(--ui-font-display);
  line-height: var(--line-height-relaxed);
  color: var(--text-secondary);
}

.launcher-principles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.launcher-principle {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--shell-radius-sm);
  background: color-mix(in srgb, var(--shell-muted-surface) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--shell-border) 72%, transparent);
}

.launcher-principle-label {
  font-size: var(--ui-font-caption);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.launcher-principle-copy {
  font-size: var(--ui-font-label);
  line-height: var(--line-height-regular);
  color: var(--text-muted);
}

.launcher-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.launcher-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid transparent;
  font: inherit;
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition:
    transform 140ms ease,
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
}

.launcher-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.launcher-btn.primary {
  background: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 80%, white 20%);
  color: white;
}

.launcher-btn.primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 88%, white 12%);
}

.launcher-btn.secondary {
  background: color-mix(in srgb, var(--surface-raised) 84%, transparent);
  border-color: var(--shell-border);
  color: var(--text-secondary);
}

.launcher-btn.secondary:hover:not(:disabled) {
  border-color: var(--shell-border-strong);
  color: var(--text-primary);
}

.launcher-btn.small {
  min-height: 34px;
  padding: 0 14px;
  font-size: var(--ui-font-label);
}

.launcher-btn:disabled,
.launcher-btn-text:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.launcher-btn-text {
  border: none;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--ui-font-label);
  cursor: pointer;
}

.launcher-btn-text:hover:not(:disabled) {
  color: var(--text-primary);
}

.launcher-hint {
  margin: 0;
  font-size: var(--ui-font-label);
  line-height: var(--line-height-regular);
  color: var(--text-muted);
}

.launcher-clone-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--shell-radius-sm);
  background: color-mix(in srgb, var(--shell-accent-surface) 52%, var(--shell-surface));
  border: 1px solid var(--shell-accent-border);
}

.launcher-clone-heading {
  font-size: var(--ui-font-label);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}

.launcher-input {
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--shell-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-base) 82%, transparent);
  color: var(--text-primary);
}

.launcher-input:focus-visible {
  outline: none;
  border-color: var(--shell-accent-border);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.launcher-clone-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.launcher-error {
  font-size: var(--ui-font-caption);
  color: var(--error);
}

.launcher-recents {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: 24px;
}

.launcher-recents-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.launcher-recents-title {
  margin: 4px 0 0;
  font-size: var(--ui-font-display-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.launcher-recents-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--shell-accent-surface) 72%, transparent);
  color: var(--accent);
  font-size: var(--ui-font-caption);
  font-weight: var(--font-weight-semibold);
}

.launcher-recent-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.launcher-recent {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-muted) 70%, transparent);
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition:
    transform 140ms ease,
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.launcher-recent:hover {
  transform: translateY(-1px);
  border-color: var(--shell-border-strong);
  background: color-mix(in srgb, var(--surface-hover) 78%, transparent);
  color: var(--text-primary);
}

.launcher-recent-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--shell-accent-surface) 56%, transparent);
  color: var(--accent);
}

.launcher-recent-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.launcher-recent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-medium);
}

.launcher-recent-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
}

.launcher-recent-meta {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
}

.launcher-recent-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  color: var(--text-muted);
}

.launcher-recent-remove:hover {
  background: color-mix(in srgb, var(--error) 12%, transparent);
  color: var(--error);
}

.launcher-empty-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2);
  border: 1px dashed var(--shell-border);
  border-radius: 16px;
  padding: 22px;
  background: color-mix(in srgb, var(--surface-muted) 48%, transparent);
}

.launcher-empty-title {
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.launcher-empty-copy {
  margin: 0;
  font-size: var(--ui-font-label);
  line-height: var(--line-height-regular);
  color: var(--text-muted);
}

@media (max-width: 980px) {
  .launcher-shell {
    grid-template-columns: 1fr;
  }

  .launcher-principles {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .launcher {
    padding: var(--space-4);
  }

  .launcher-hero,
  .launcher-recents {
    padding: 20px;
  }

  .launcher-brand-row {
    align-items: flex-start;
  }

  .launcher-title {
    font-size: var(--ui-font-hero-sm);
  }

  .launcher-tagline {
    font-size: var(--ui-font-body);
  }

  .launcher-recent {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .launcher-recent-meta {
    display: none;
  }
}
</style>
