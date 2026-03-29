<template>
  <div class="document-run-sidebar">
    <div v-if="!sourceFilePath" class="document-run-empty">
      <div class="document-run-empty-title">{{ t('No document selected') }}</div>
      <div class="document-run-empty-copy">
        {{ t('Open a LaTeX or Typst document to see compile status here.') }}
      </div>
    </div>

    <div v-else-if="!supportsDocumentRun" class="document-run-empty">
      <div class="document-run-empty-title">{{ t('Document run is only for LaTeX / Typst') }}</div>
      <div class="document-run-empty-copy">
        {{ t('Switch to a LaTeX or Typst source file to inspect compile status and output.') }}
      </div>
    </div>

    <div v-else class="document-run-scroll">
      <section class="document-run-hero">
        <div class="document-run-hero-top">
          <span class="document-run-chip">{{ kindLabel }}</span>
          <span class="document-run-chip is-status" :class="statusToneClass">
            {{ compileStatusLabel }}
          </span>
        </div>
        <div class="document-run-title">{{ sourceFileName }}</div>
        <div class="document-run-path" :title="sourceFilePath">{{ sourceFileShortPath }}</div>

        <div class="document-run-stat-grid">
          <div class="document-run-stat-card">
            <div class="document-run-stat-label">{{ t('Compile') }}</div>
            <div class="document-run-stat-value">{{ compileStatusLabel }}</div>
          </div>
          <div class="document-run-stat-card">
            <div class="document-run-stat-label">{{ t('Problems') }}</div>
            <div class="document-run-stat-value">{{ problemSummary }}</div>
          </div>
          <div class="document-run-stat-card">
            <div class="document-run-stat-label">{{ t('Output') }}</div>
            <div class="document-run-stat-value">{{ artifactStatusLabel }}</div>
          </div>
        </div>
      </section>

      <section class="document-run-actions">
        <UiButton
          type="button"
          variant="ghost"
          size="sm"
          class="document-run-action"
          @click="handleCompile"
        >
          {{ t('Recompile') }}
        </UiButton>
        <UiButton
          type="button"
          variant="ghost"
          size="sm"
          class="document-run-action"
          :disabled="!artifactPath"
          @click="openOutput"
        >
          {{ t('Open output') }}
        </UiButton>
        <UiButton
          type="button"
          variant="ghost"
          size="sm"
          class="document-run-action"
          @click="openCompileLog"
        >
          {{ t('Open log') }}
        </UiButton>
      </section>

      <section v-if="compileProblems.length" class="document-run-section">
        <div class="document-run-section-label">{{ t('Current compile issues') }}</div>
        <div class="document-run-problem-list">
          <div
            v-for="(problem, index) in visibleProblems"
            :key="`${problem.line || 'problem'}-${index}`"
            class="document-run-problem"
            :class="problem.severity === 'error' ? 'is-error' : 'is-warning'"
          >
            <div class="document-run-problem-head">
              <span class="document-run-problem-tone">
                {{ problem.severity === 'error' ? t('Error') : t('Warning') }}
              </span>
              <span v-if="problem.line" class="document-run-problem-line">
                {{ t('Line {line}', { line: problem.line }) }}
              </span>
            </div>
            <div class="document-run-problem-copy">
              {{ problem.message || problem.raw || t('Issue detected') }}
            </div>
          </div>
          <div
            v-if="compileProblems.length > visibleProblems.length"
            class="document-run-problem-more"
          >
            {{
              t('{count} more issues in compile output', {
                count: compileProblems.length - visibleProblems.length,
              })
            }}
          </div>
        </div>
      </section>

      <section v-else class="document-run-section">
        <div class="document-run-section-label">{{ t('Current compile issues') }}</div>
        <div class="document-run-placeholder">
          {{ t('No current compile issues.') }}
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useLatexStore } from '../../stores/latex'
import { useTypstStore } from '../../stores/typst'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { isLatex, isTypst } from '../../utils/fileTypes'
import { getDocumentWorkflowStatusTone } from '../../domains/document/documentWorkflowBuildRuntime.js'
import { shortenDocumentPath } from '../../domains/document/documentRunInspectorRuntime.js'
import { openLocalPath } from '../../services/localFileOpen.js'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  overrideActiveFile: { type: String, default: null },
})

const workflowStore = useDocumentWorkflowStore()
const editorStore = useEditorStore()
const filesStore = useFilesStore()
const latexStore = useLatexStore()
const typstStore = useTypstStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const sourceFilePath = computed(() => {
  const activePath = props.overrideActiveFile || editorStore.activeTab || ''
  if (!activePath) return ''
  return workflowStore.getSourcePathForPreview(activePath) || activePath
})

const sourceFileName = computed(
  () =>
    String(sourceFilePath.value || '')
      .split('/')
      .pop() || t('Untitled document')
)

const sourceFileShortPath = computed(() =>
  shortenDocumentPath(sourceFilePath.value, { segments: 3 })
)

const supportsDocumentRun = computed(
  () => !!sourceFilePath.value && (isLatex(sourceFilePath.value) || isTypst(sourceFilePath.value))
)

const kindLabel = computed(() => {
  if (!supportsDocumentRun.value) return ''
  return isLatex(sourceFilePath.value) ? t('LaTeX') : t('Typst')
})

const buildContext = computed(() => ({
  filesStore,
  workspace,
  latexStore,
  typstStore,
  t,
}))

const workflowUiState = computed(() => {
  if (!supportsDocumentRun.value) return null
  return workflowStore.getUiStateForFile(sourceFilePath.value, buildContext.value)
})

const compileProblems = computed(() => {
  if (!supportsDocumentRun.value) return []
  return workflowStore.getProblemsForFile(sourceFilePath.value, buildContext.value)
})

const compileStatusLabel = computed(() => {
  if (!supportsDocumentRun.value) return ''
  const statusText = workflowStore.getStatusTextForFile(sourceFilePath.value, buildContext.value)
  if (statusText) return statusText
  const phase = workflowUiState.value?.phase || 'idle'
  if (phase === 'compiling' || phase === 'rendering') return t('Compiling...')
  if (phase === 'error') return t('Compile failed')
  if (phase === 'ready') return t('Ready')
  return t('Idle')
})

const artifactPath = computed(() => {
  if (!supportsDocumentRun.value) return ''
  return workflowStore.getArtifactPathForFile(sourceFilePath.value, buildContext.value) || ''
})

const artifactStatusLabel = computed(() =>
  artifactPath.value ? t('Output ready') : t('No output yet')
)

const problemSummary = computed(() => {
  const errorCount = compileProblems.value.filter((problem) => problem.severity === 'error').length
  const warningCount = compileProblems.value.filter(
    (problem) => problem.severity !== 'error'
  ).length
  if (errorCount || warningCount) {
    return t('{errors} errors · {warnings} warnings', {
      errors: errorCount,
      warnings: warningCount,
    })
  }
  return t('No current compile issues')
})

const visibleProblems = computed(() => compileProblems.value.slice(0, 4))

const statusToneClass = computed(() => {
  const tone = getDocumentWorkflowStatusTone(workflowUiState.value)
  if (tone === 'error') return 'tone-danger'
  if (tone === 'warning') return 'tone-warning'
  if (tone === 'success') return 'tone-success'
  if (tone === 'running') return 'tone-accent'
  return 'tone-neutral'
})

async function handleCompile() {
  if (!supportsDocumentRun.value) return
  await workflowStore.runBuildForFile(sourceFilePath.value, {
    ...buildContext.value,
    workflowOnly: false,
    trigger: 'document-run-inspector',
  })
}

async function openOutput() {
  if (!artifactPath.value) return
  await openLocalPath(artifactPath.value)
}

function openCompileLog() {
  if (!supportsDocumentRun.value) return
  workflowStore.openLogForFile(sourceFilePath.value, buildContext.value)
}
</script>

<style scoped>
.document-run-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: transparent;
  color: var(--text-primary);
}

.document-run-scroll {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding: 8px 8px 12px;
  overflow-y: auto;
}

.document-run-hero,
.document-run-placeholder,
.document-run-empty {
  border: none;
  border-radius: 10px;
  background: transparent;
}

.document-run-hero {
  padding: 2px 0 8px;
  border-bottom: 0;
}

.document-run-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.document-run-title {
  margin-top: 8px;
  font-size: var(--sidebar-font-title-strong);
  line-height: 1.32;
  font-weight: 600;
  color: var(--fg-primary);
  word-break: break-word;
}

.document-run-path {
  margin-top: 5px;
  font-size: var(--sidebar-font-meta);
  line-height: 1.45;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}

.document-run-chip {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  border: none;
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  font-size: var(--ui-font-tiny);
  line-height: 1.2;
  color: var(--text-secondary);
  opacity: 0.84;
}

.tone-accent {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.tone-success {
  color: var(--success, #4ade80);
  background: color-mix(in srgb, var(--success, #4ade80) 10%, transparent);
}

.tone-warning {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}

.tone-danger {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 10%, transparent);
}

.tone-neutral {
  color: var(--fg-secondary);
}

.document-run-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.document-run-stat-card {
  min-width: 0;
  border-top: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.document-run-stat-label {
  font-size: var(--ui-font-tiny);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-muted);
  opacity: 0.72;
}

.document-run-stat-value {
  margin-top: 4px;
  font-size: var(--sidebar-font-body);
  line-height: 1.4;
  color: var(--fg-primary);
  overflow-wrap: anywhere;
}

.document-run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.document-run-action {
  flex: 1 1 calc(50% - 4px);
  min-width: 0;
  justify-content: flex-start;
  border-radius: 8px;
  color: var(--text-secondary);
  opacity: 0.72;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
}

.document-run-action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  color: var(--text-primary);
  opacity: 1;
}

.document-run-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.document-run-section-label {
  font-size: var(--ui-font-tiny);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  opacity: 0.68;
}

.document-run-empty,
.document-run-placeholder {
  padding: 8px 0;
}

.document-run-empty-title {
  font-size: var(--sidebar-font-title-strong);
  font-weight: 600;
  color: var(--text-primary);
}

.document-run-empty-copy,
.document-run-placeholder {
  margin-top: 6px;
  font-size: var(--sidebar-font-body);
  line-height: 1.55;
  color: var(--text-secondary);
}

.document-run-problem-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.document-run-problem {
  border-left: 2px solid color-mix(in srgb, var(--border) 24%, transparent);
  border-radius: 0;
  background: transparent;
  padding: 8px 0 8px 10px;
}

.document-run-problem.is-error {
  border-left-color: color-mix(in srgb, var(--error) 52%, transparent);
}

.document-run-problem.is-warning {
  border-left-color: color-mix(in srgb, var(--warning) 52%, transparent);
}

.document-run-problem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.document-run-problem-tone {
  font-size: var(--sidebar-font-meta);
  font-weight: 600;
  color: var(--text-primary);
}

.document-run-problem-line {
  font-size: var(--sidebar-font-meta);
  color: var(--text-muted);
}

.document-run-problem-copy,
.document-run-problem-more {
  margin-top: 6px;
  font-size: var(--sidebar-font-body);
  line-height: 1.5;
  color: var(--text-secondary);
}

@media (max-width: 720px) {
  .document-run-stat-grid {
    grid-template-columns: 1fr;
  }

  .document-run-action {
    flex-basis: 100%;
  }
}
</style>
