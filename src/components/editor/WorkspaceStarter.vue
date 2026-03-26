<template>
  <div class="workspace-starter">
    <div class="workspace-starter-scroll">
      <div class="workspace-starter-shell">
        <section class="workspace-starter-masthead">
          <div class="workspace-starter-masthead-copy">
            <div class="workspace-starter-kicker">{{ t('Research dashboard') }}</div>
            <h1 class="workspace-starter-title">{{ workspaceName }}</h1>
            <p class="workspace-starter-copy">
              {{ t('A focused project desk for drafting, computation, references, and review.') }}
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
                {{ t('New draft') }}
              </UiButton>
            </div>
          </div>

          <aside class="workspace-starter-overview">
            <div class="workspace-starter-section-kicker">{{ t('Project overview') }}</div>
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
                <div class="workspace-starter-section-kicker">{{ t('Continue working') }}</div>
                <h2 class="workspace-starter-section-title">{{ t('Recent materials') }}</h2>
              </div>
              <p class="workspace-starter-section-copy">
                {{ t('Return to the files you were reading, drafting, or running most recently.') }}
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
                <h2 class="workspace-starter-section-title">{{ t('Research workbenches') }}</h2>
              </div>
              <p class="workspace-starter-section-copy">
                {{
                  t('Move between literature and AI support without leaving the project workflow.')
                }}
              </p>
            </div>

            <div class="workspace-starter-surface-list">
              <UiButton
                v-for="item in surfaceItems"
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
              <div class="workspace-starter-section-kicker">{{ t('Project workspace') }}</div>
              <h2 class="workspace-starter-section-title">{{ t('Start new work') }}</h2>
            </div>
            <p class="workspace-starter-section-copy">
              {{
                t('Create a draft, manuscript, notebook, or analysis script inside this project.')
              }}
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
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n, formatRelativeFromNow } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import {
  WORKSPACE_STARTER_COMPUTATION_EXTENSIONS,
  WORKSPACE_STARTER_DRAFT_EXTENSIONS,
  countWorkspaceStarterFilesByExtension,
  getWorkspaceStarterDirectory,
  getWorkspaceStarterFileExtension,
  normalizeWorkspaceStarterPath,
} from '../../domains/workspace/workspaceStarterMetrics'

const props = defineProps({
  paneId: { type: String, default: '' },
})

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const workspaceName = computed(() => {
  const path = normalizeWorkspaceStarterPath(workspace.path || '')
  return path ? path.split('/').pop() || path : t('Current workspace')
})

const workspacePathDisplay = computed(() =>
  normalizeWorkspaceStarterPath(workspace.path || workspaceName.value)
)

const fileCount = computed(() => filesStore.flatFiles.length)
const draftCount = computed(() =>
  countWorkspaceStarterFilesByExtension(filesStore.flatFiles, WORKSPACE_STARTER_DRAFT_EXTENSIONS)
)
const computationCount = computed(() =>
  countWorkspaceStarterFilesByExtension(
    filesStore.flatFiles,
    WORKSPACE_STARTER_COMPUTATION_EXTENSIONS
  )
)
const referenceCount = computed(() => referencesStore.refCount || 0)

const recentFiles = computed(() => editorStore.recentFilesForEmptyState.slice(0, 5))
const latestActivityLabel = computed(() =>
  recentFiles.value[0]?.openedAt
    ? formatRelativeFromNow(recentFiles.value[0].openedAt)
    : t('No recent activity')
)

const overviewItems = computed(() => [
  { key: 'files', label: t('Files'), value: fileCount.value },
  { key: 'drafts', label: t('Drafts'), value: draftCount.value },
  { key: 'computation', label: t('Computation'), value: computationCount.value },
  { key: 'references', label: t('References'), value: referenceCount.value },
])

const createItems = computed(() => [
  { ext: '.md', label: t('Markdown') },
  { ext: '.tex', label: 'LaTeX' },
  { ext: '.typ', label: 'Typst' },
  { ext: '.ipynb', label: t('Jupyter notebook') },
  { ext: '.py', label: 'Python' },
  { ext: '.r', label: t('R Script') },
])

const surfaceItems = computed(() => [
  {
    key: 'library',
    label: t('Library'),
    meta: t('Manage references and project citations.'),
    action: () => workspace.openLibrarySurface(),
  },
  {
    key: 'ai',
    label: t('AI'),
    meta: t('Open long-form AI workflows and research assistance.'),
    action: () => workspace.openAiSurface(),
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
    case '.ipynb':
      return t('Jupyter notebook')
    case '.py':
      return 'Python'
    case '.r':
      return t('R Script')
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
</script>

<style scoped>
.workspace-starter {
  display: flex;
  height: 100%;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-secondary) 90%, var(--accent) 2%) 0,
    var(--bg-primary) 240px
  );
  container-type: inline-size;
}

.workspace-starter-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.workspace-starter-shell {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 34px 30px 44px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.workspace-starter-masthead {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.86fr);
  gap: 22px;
  align-items: start;
}

.workspace-starter-masthead-copy {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 6px 0 2px;
}

.workspace-starter-kicker,
.workspace-starter-section-kicker,
.workspace-starter-context-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.workspace-starter-title,
.workspace-starter-section-title {
  margin: 0;
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
  font-weight: 600;
  color: var(--fg-primary);
}

.workspace-starter-title {
  font-size: clamp(2.15rem, 5cqi, 3.4rem);
  line-height: 1.02;
}

.workspace-starter-copy,
.workspace-starter-section-copy {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.65;
  color: var(--fg-secondary);
}

.workspace-starter-copy {
  max-width: 56ch;
}

.workspace-starter-context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 4px;
}

.workspace-starter-context-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
}

.workspace-starter-context-value {
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.55;
  color: var(--fg-primary);
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
  margin-top: 2px;
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
  font-size: 0.95rem;
  font-weight: 600;
}

.workspace-starter-overview,
.workspace-starter-section {
  border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--bg-secondary) 74%, var(--bg-primary));
}

.workspace-starter-overview {
  padding: 18px 18px 12px;
}

.workspace-starter-overview-grid {
  margin: 12px 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
}

.workspace-starter-overview-item {
  padding: 14px 12px 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
}

.workspace-starter-overview-item:nth-child(odd) {
  padding-right: 16px;
}

.workspace-starter-overview-item:nth-child(even) {
  padding-left: 16px;
  border-left: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
}

.workspace-starter-overview-item dt {
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.workspace-starter-overview-item dd {
  margin: 10px 0 0;
  font-size: 1.95rem;
  line-height: 1;
  font-weight: 600;
  color: var(--fg-primary);
}

.workspace-starter-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.42fr) minmax(280px, 0.9fr);
  gap: 20px;
  align-items: start;
}

.workspace-starter-section {
  padding: 18px 18px 16px;
}

.workspace-starter-section-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.workspace-starter-section-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workspace-starter-section-title {
  font-size: 1.38rem;
  line-height: 1.15;
}

.workspace-starter-ledger,
.workspace-starter-surface-list {
  display: flex;
  flex-direction: column;
}

.workspace-starter-ledger-row,
.workspace-starter-surface-row {
  width: 100%;
  padding: 12px 0;
  border: none;
  border-radius: 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: transparent;
  text-align: left;
}

.workspace-starter-ledger-row:first-child,
.workspace-starter-surface-row:first-child {
  border-top: none;
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
.workspace-starter-create-item:hover {
  background: color-mix(in srgb, var(--bg-hover) 42%, transparent);
}

.workspace-starter-ledger-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 76px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 999px;
  font-size: 0.73rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-muted);
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
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
  font-size: 0.98rem;
  line-height: 1.35;
  font-weight: 600;
  color: var(--fg-primary);
}

.workspace-starter-ledger-path,
.workspace-starter-ledger-time,
.workspace-starter-surface-meta,
.workspace-starter-create-ext,
.workspace-starter-empty {
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--fg-muted);
}

.workspace-starter-ledger-path,
.workspace-starter-surface-meta {
  overflow-wrap: anywhere;
}

.workspace-starter-ledger-time {
  flex-shrink: 0;
}

.workspace-starter-empty {
  padding: 8px 0 2px;
}

.workspace-starter-create-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-left: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
}

.workspace-starter-create-item {
  min-height: 74px;
  padding: 14px 16px;
  border: none;
  border-radius: 0;
  border-right: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: transparent;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}

.workspace-starter-create-ext {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  text-transform: lowercase;
}

@container (max-width: 980px) {
  .workspace-starter-shell {
    padding: 26px 20px 34px;
  }

  .workspace-starter-masthead,
  .workspace-starter-main-grid {
    grid-template-columns: 1fr;
  }

  .workspace-starter-overview-grid,
  .workspace-starter-create-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 720px) {
  .workspace-starter-shell {
    padding: 20px 14px 28px;
    gap: 16px;
  }

  .workspace-starter-context-grid,
  .workspace-starter-overview-grid,
  .workspace-starter-create-grid {
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
