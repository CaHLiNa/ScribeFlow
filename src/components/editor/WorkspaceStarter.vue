<template>
  <div class="workspace-starter">
    <div class="workspace-starter-scroll">
      <div class="workspace-starter-shell">
        <section class="workspace-starter-masthead">
          <div class="workspace-starter-masthead-copy">
            <div class="workspace-starter-kicker">{{ t('Document workspace') }}</div>
            <h1 class="workspace-starter-title">{{ workspaceName }}</h1>
            <p class="workspace-starter-copy">
              {{ t('A focused writing desk for Markdown, LaTeX, and Typst documents.') }}
            </p>

            <div class="workspace-starter-context-grid">
              <div class="workspace-starter-context-item">
                <div class="workspace-starter-context-label">{{ t('Workspace root') }}</div>
                <code class="workspace-starter-context-value">{{ workspacePathDisplay }}</code>
              </div>
              <div class="workspace-starter-context-item">
                <div class="workspace-starter-context-label">{{ t('Latest activity') }}</div>
                <div class="workspace-starter-context-value">{{ latestActivityLabel }}</div>
              </div>
            </div>

            <div class="workspace-starter-actions">
              <UiButton
                type="button"
                variant="primary"
                size="lg"
                class="workspace-starter-primary"
                @click="openSearch"
              >
                {{ t('Open file') }}
              </UiButton>
              <UiButton
                type="button"
                variant="secondary"
                size="lg"
                class="workspace-starter-secondary"
                @click="createNewFile('.md')"
              >
                {{ t('New document') }}
              </UiButton>
            </div>
          </div>

          <aside class="workspace-starter-overview">
            <div class="workspace-starter-section-kicker">{{ t('Workspace overview') }}</div>
            <dl class="workspace-starter-overview-grid">
              <div
                v-for="item in overviewItems"
                :key="item.key"
                class="workspace-starter-overview-item"
              >
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </aside>
        </section>

        <div class="workspace-starter-main-grid">
          <section class="workspace-starter-section">
            <div class="workspace-starter-section-head">
              <div class="workspace-starter-section-heading">
                <div class="workspace-starter-section-kicker">{{ t('Continue writing') }}</div>
                <h2 class="workspace-starter-section-title">{{ t('Recent documents') }}</h2>
              </div>
              <p class="workspace-starter-section-copy">
                {{ t('Return to the files you opened or edited most recently.') }}
              </p>
            </div>

            <div v-if="recentFiles.length" class="workspace-starter-ledger">
              <UiButton
                v-for="entry in recentFiles"
                :key="entry.path"
                type="button"
                variant="ghost"
                size="md"
                content-mode="raw"
                class="workspace-starter-ledger-row"
                @click="openFile(entry.path)"
              >
                <span class="workspace-starter-ledger-kind">{{ fileKindLabel(entry.path) }}</span>
                <span class="workspace-starter-ledger-main">
                  <span class="workspace-starter-ledger-name">{{ fileName(entry.path) }}</span>
                  <span class="workspace-starter-ledger-path">{{
                    fileDirectoryLabel(entry.path)
                  }}</span>
                </span>
                <span class="workspace-starter-ledger-time">{{
                  formatRelativeFromNow(entry.openedAt)
                }}</span>
              </UiButton>
            </div>
            <div v-else class="workspace-starter-empty">
              {{ t('No recent files yet') }}
            </div>
          </section>

          <section class="workspace-starter-section">
            <div class="workspace-starter-section-head">
              <div class="workspace-starter-section-heading">
                <div class="workspace-starter-section-kicker">{{ t('Current workspace') }}</div>
                <h2 class="workspace-starter-section-title">{{ t('Document formats') }}</h2>
              </div>
              <p class="workspace-starter-section-copy">
                {{ t('This workspace now focuses on the three core document formats.') }}
              </p>
            </div>

            <div class="workspace-starter-surface-list">
              <UiButton
                v-for="item in focusItems"
                :key="item.key"
                type="button"
                variant="ghost"
                size="md"
                content-mode="raw"
                class="workspace-starter-surface-row"
                @click="item.action"
              >
                <span class="workspace-starter-surface-main">
                  <span class="workspace-starter-surface-label">{{ item.label }}</span>
                  <span class="workspace-starter-surface-meta">{{ item.meta }}</span>
                </span>
              </UiButton>
            </div>
          </section>
        </div>

        <section class="workspace-starter-section">
          <div class="workspace-starter-section-head">
            <div class="workspace-starter-section-heading">
              <div class="workspace-starter-section-kicker">{{ t('Document workspace') }}</div>
              <h2 class="workspace-starter-section-title">{{ t('New document') }}</h2>
            </div>
            <p class="workspace-starter-section-copy">
              {{ t('Create a new Markdown, LaTeX, or Typst document inside this project.') }}
            </p>
          </div>

          <div class="workspace-starter-create-grid">
            <UiButton
              v-for="item in createItems"
              :key="item.ext"
              type="button"
              variant="ghost"
              size="md"
              content-mode="raw"
              class="workspace-starter-create-item"
              @click="createNewFile(item.ext)"
            >
              <span class="workspace-starter-create-label">{{ item.label }}</span>
              <span class="workspace-starter-create-ext">{{ item.ext }}</span>
            </UiButton>
          </div>
        </section>

        <section class="workspace-starter-section">
          <div class="workspace-starter-section-head">
            <div class="workspace-starter-section-heading">
              <div class="workspace-starter-section-kicker">{{ t('Academic starters') }}</div>
              <h2 class="workspace-starter-section-title">{{ t('Writing templates') }}</h2>
            </div>
            <p class="workspace-starter-section-copy">
              {{ t('Start from a small document template instead of an empty file.') }}
            </p>
          </div>

          <div class="workspace-starter-template-grid">
            <UiButton
              v-for="template in documentTemplates"
              :key="template.id"
              type="button"
              variant="ghost"
              size="md"
              content-mode="raw"
              class="workspace-starter-template-item"
              @click="createFromTemplate(template)"
            >
              <span class="workspace-starter-template-head">
                <span class="workspace-starter-template-label">{{ template.label }}</span>
                <span class="workspace-starter-template-ext">{{ template.ext }}</span>
              </span>
              <span class="workspace-starter-template-copy">{{ template.description }}</span>
            </UiButton>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n, formatRelativeFromNow } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import {
  WORKSPACE_STARTER_DRAFT_EXTENSIONS,
  getWorkspaceStarterDirectory,
  getWorkspaceStarterFileExtension,
  normalizeWorkspaceStarterPath,
} from '../../domains/workspace/workspaceStarterMetrics'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import { countWorkspaceFlatFilesByExtension } from '../../domains/files/workspaceSnapshotFlatFilesRuntime'

const props = defineProps({
  paneId: { type: String, default: '' },
})

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const workspaceName = computed(() => {
  const path = normalizeWorkspaceStarterPath(workspace.path || '')
  return path ? path.split('/').pop() || path : t('Current workspace')
})

const workspacePathDisplay = computed(() =>
  normalizeWorkspaceStarterPath(workspace.path || workspaceName.value)
)

const fileCount = computed(() => filesStore.lastWorkspaceSnapshot?.flatFiles?.length || 0)
const documentCount = computed(() =>
  countWorkspaceFlatFilesByExtension(
    filesStore.lastWorkspaceSnapshot,
    WORKSPACE_STARTER_DRAFT_EXTENSIONS
  )
)

const recentFiles = computed(() => editorStore.recentFilesForEmptyState.slice(0, 5))
const latestActivityLabel = computed(() =>
  recentFiles.value[0]?.openedAt
    ? formatRelativeFromNow(recentFiles.value[0].openedAt)
    : t('No recent activity')
)

const overviewItems = computed(() => [
  { key: 'files', label: t('Files'), value: fileCount.value },
  { key: 'documents', label: t('Documents'), value: documentCount.value },
])

const createItems = computed(() => [
  { ext: '.md', label: t('Markdown') },
  { ext: '.tex', label: 'LaTeX' },
  { ext: '.typ', label: 'Typst' },
])

const documentTemplates = computed(() => listWorkspaceDocumentTemplates(t))

const focusItems = computed(() => [
  {
    key: 'markdown',
    label: t('Markdown documents'),
    meta: t('Notes, outlines, and long-form writing with inline preview.'),
    action: () => createNewFile('.md'),
  },
  {
    key: 'latex',
    label: 'LaTeX',
    meta: t('Manuscripts with compile output and PDF review in the same workspace.'),
    action: () => createNewFile('.tex'),
  },
  {
    key: 'typst',
    label: 'Typst',
    meta: t('Fast typesetting with native preview and export-ready output.'),
    action: () => createNewFile('.typ'),
  },
])

function fileName(path) {
  return normalizeWorkspaceStarterPath(path).split('/').pop() || path
}

function fileDirectoryLabel(path) {
  const directory = getWorkspaceStarterDirectory(path, workspace.path)
  return directory || t('Project root')
}

function fileKindLabel(path) {
  const extension = getWorkspaceStarterFileExtension(path)
  switch (extension) {
    case '.md':
      return t('Markdown')
    case '.tex':
      return 'LaTeX'
    case '.typ':
      return 'Typst'
    default:
      return extension ? extension.slice(1).toUpperCase() : 'FILE'
  }
}

function openSearch() {
  window.dispatchEvent(new CustomEvent('app:focus-search'))
}

function openFile(path) {
  if (!path) return
  if (props.paneId) editorStore.setActivePane(props.paneId)
  editorStore.openFile(path)
}

async function createNewFile(ext) {
  if (!workspace.path) return
  if (props.paneId) editorStore.setActivePane(props.paneId)

  const baseName = 'untitled'
  let name = `${baseName}${ext}`
  let counter = 2

  while (true) {
    const fullPath = `${workspace.path}/${name}`
    try {
      const exists = await invoke('path_exists', { path: fullPath })
      if (!exists) break
    } catch {
      break
    }
    name = `${baseName}-${counter}${ext}`
    counter += 1
  }

  const created = await filesStore.createFile(workspace.path, name)
  if (created) {
    editorStore.openFile(created)
  }
}

async function createFromTemplate(template) {
  if (!workspace.path || !template?.filename) return
  if (props.paneId) editorStore.setActivePane(props.paneId)

  let name = template.filename
  let counter = 2
  const dotIndex = template.filename.lastIndexOf('.')
  const baseName = dotIndex > 0 ? template.filename.slice(0, dotIndex) : template.filename
  const suffix = dotIndex > 0 ? template.filename.slice(dotIndex) : ''

  while (true) {
    const fullPath = `${workspace.path}/${name}`
    try {
      const exists = await invoke('path_exists', { path: fullPath })
      if (!exists) break
    } catch {
      break
    }
    name = `${baseName}-${counter}${suffix}`
    counter += 1
  }

  const created = await filesStore.createFile(workspace.path, name, {
    initialContent: template.content || '',
  })
  if (created) {
    editorStore.openFile(created)
  }
}
</script>

<style scoped>
.workspace-starter {
  display: flex;
  height: 100%;
  background: transparent;
  container-type: inline-size;
}

.workspace-starter-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 20px,
    black calc(100% - 20px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 20px,
    black calc(100% - 20px),
    transparent 100%
  );
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.workspace-starter-shell {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 36px 30px 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  box-sizing: border-box;
}

.workspace-starter-masthead {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(240px, 0.78fr);
  gap: 30px;
  align-items: start;
}

.workspace-starter-masthead-copy {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 0 0;
}

.workspace-starter-kicker,
.workspace-starter-section-kicker,
.workspace-starter-context-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
  opacity: 0.9;
}

.workspace-starter-title,
.workspace-starter-section-title {
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-starter-title {
  font-size: clamp(2rem, 4.6cqi, 3.15rem);
  line-height: 1.04;
}

.workspace-starter-copy,
.workspace-starter-section-copy {
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.62;
  color: var(--text-secondary);
}

.workspace-starter-copy {
  max-width: 50ch;
}

.workspace-starter-context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.workspace-starter-context-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--shell-border) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--shell-muted-surface) 78%, transparent);
}

.workspace-starter-context-value {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

code.workspace-starter-context-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.84rem;
}

.workspace-starter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}

.workspace-starter-primary,
.workspace-starter-secondary,
.workspace-starter-ledger-row,
.workspace-starter-surface-row,
.workspace-starter-create-item {
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.workspace-starter-primary,
.workspace-starter-secondary {
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 10px;
}

.workspace-starter-primary {
  border-color: color-mix(in srgb, var(--button-primary-bg) 72%, var(--border));
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 14px 26px color-mix(in srgb, black 12%, transparent);
}

.workspace-starter-primary:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--button-primary-bg-hover) 72%, var(--border));
  background: var(--button-primary-bg-hover);
}

.workspace-starter-secondary {
  border-color: color-mix(in srgb, var(--shell-border) 76%, transparent);
  background: color-mix(in srgb, var(--shell-muted-surface) 72%, transparent);
  color: var(--text-secondary);
}

.workspace-starter-secondary:hover:not(:disabled) {
  border-color: var(--chrome-reveal);
  background: color-mix(in srgb, var(--shell-muted-surface) 92%, transparent);
  color: var(--text-primary);
}

.workspace-starter-overview,
.workspace-starter-section {
  border: 1px solid color-mix(in srgb, var(--shell-border) 78%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--shell-surface) 94%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--fg-primary) 4%, transparent),
    0 12px 24px color-mix(in srgb, black 6%, transparent);
}

.workspace-starter-overview {
  padding: 22px;
}

.workspace-starter-overview-grid {
  margin: 14px 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  border-top: 1px solid color-mix(in srgb, var(--shell-border) 62%, transparent);
}

.workspace-starter-overview-item {
  padding: 14px 0 0;
  border-bottom: none;
}

.workspace-starter-overview-item:nth-child(odd) {
  padding-right: 0;
}

.workspace-starter-overview-item:nth-child(even) {
  padding-left: 0;
  border-left: none;
}

.workspace-starter-overview-item dt {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.workspace-starter-overview-item dd {
  margin: 6px 0 0;
  font-size: 1.5rem;
  line-height: 1.05;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-starter-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.42fr) minmax(280px, 0.9fr);
  gap: 30px;
  align-items: start;
}

.workspace-starter-section {
  padding: 22px;
}

.workspace-starter-section-head {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}

.workspace-starter-section-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workspace-starter-section-title {
  font-size: 1.18rem;
  line-height: 1.2;
}

.workspace-starter-ledger,
.workspace-starter-surface-list {
  display: flex;
  flex-direction: column;
}

.workspace-starter-ledger-row,
.workspace-starter-surface-row {
  width: 100%;
  padding: 12px 12px;
  border: 1px solid color-mix(in srgb, var(--shell-border) 48%, transparent);
  border-radius: 10px;
  border-top: 1px solid transparent;
  background: color-mix(in srgb, var(--shell-muted-surface) 56%, transparent);
  text-align: left;
}

.workspace-starter-ledger-row:first-child,
.workspace-starter-surface-row:first-child {
  border-top: 1px solid transparent;
}

.workspace-starter-ledger-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.workspace-starter-surface-row {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.workspace-starter-ledger-row:hover,
.workspace-starter-surface-row:hover,
.workspace-starter-create-item:hover,
.workspace-starter-template-item:hover {
  border-color: var(--chrome-reveal);
  background: color-mix(in srgb, var(--shell-muted-surface) 86%, transparent);
}

.workspace-starter-ledger-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 999px;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
  background: color-mix(in srgb, var(--shell-accent-surface) 92%, transparent);
  box-sizing: border-box;
}

.workspace-starter-ledger-main,
.workspace-starter-surface-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.workspace-starter-ledger-name,
.workspace-starter-surface-label,
.workspace-starter-create-label {
  font-size: 0.92rem;
  line-height: 1.35;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-starter-ledger-path,
.workspace-starter-ledger-time,
.workspace-starter-surface-meta,
.workspace-starter-create-ext,
.workspace-starter-empty {
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.workspace-starter-ledger-path,
.workspace-starter-surface-meta {
  overflow-wrap: anywhere;
}

.workspace-starter-ledger-time {
  flex-shrink: 0;
}

.workspace-starter-empty {
  padding: 8px 0 0;
}

.workspace-starter-create-grid,
.workspace-starter-template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.workspace-starter-create-item,
.workspace-starter-template-item {
  min-height: 58px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--shell-border) 56%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--shell-muted-surface) 58%, transparent);
  display: flex;
  gap: 12px;
  text-align: left;
}

.workspace-starter-create-item {
  align-items: flex-end;
  justify-content: space-between;
}

.workspace-starter-template-item {
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
}

.workspace-starter-template-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.workspace-starter-template-label {
  font-size: 0.92rem;
  line-height: 1.35;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-starter-create-ext,
.workspace-starter-template-ext {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  text-transform: lowercase;
}

.workspace-starter-template-copy {
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-muted);
}

@container (max-width: 980px) {
  .workspace-starter-shell {
    padding: 24px 18px 32px;
  }

  .workspace-starter-masthead,
  .workspace-starter-main-grid {
    grid-template-columns: 1fr;
  }

  .workspace-starter-overview-grid,
  .workspace-starter-create-grid,
  .workspace-starter-template-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 720px) {
  .workspace-starter-shell {
    padding: 18px 14px 26px;
    gap: 20px;
  }

  .workspace-starter-context-grid,
  .workspace-starter-overview-grid,
  .workspace-starter-create-grid,
  .workspace-starter-template-grid {
    grid-template-columns: 1fr;
  }

  .workspace-starter-overview-item:nth-child(even) {
    padding-left: 0;
    border-left: none;
  }

  .workspace-starter-ledger-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .workspace-starter-ledger-time {
    padding-left: 0;
  }
}
</style>
