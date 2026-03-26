<template>
  <div class="document-run-sidebar">
    <div v-if="!sourceFilePath" class="document-run-empty">
      <div class="document-run-empty-title">{{ t('No document selected') }}</div>
      <div class="document-run-empty-copy">
        {{ t('Open a TeX or Typst document to run compile diagnosis and fixes here.') }}
      </div>
    </div>

    <div v-else-if="!supportsDocumentRun" class="document-run-empty">
      <div class="document-run-empty-title">{{ t('Document run is only for TeX / Typst') }}</div>
      <div class="document-run-empty-copy">
        {{ t('Switch to a TeX or Typst source file to keep compile diagnosis and fixes inside the document workflow.') }}
      </div>
    </div>

    <div v-else class="document-run-scroll">
      <section class="document-run-hero">
        <div class="document-run-hero-top">
          <span class="document-run-chip">{{ kindLabel }}</span>
          <span class="document-run-chip is-status" :class="statusToneClass">
            {{ aiStatusLabel }}
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
            <div class="document-run-stat-label">{{ t('Problem summary') }}</div>
            <div class="document-run-stat-value">{{ problemSummary }}</div>
          </div>
          <div class="document-run-stat-card">
            <div class="document-run-stat-label">{{ t('AI status') }}</div>
            <div class="document-run-stat-value">{{ aiStatusLabel }}</div>
          </div>
        </div>
      </section>

      <section class="document-run-actions">
        <UiButton
          type="button"
          variant="secondary"
          size="sm"
          class="document-run-action"
          @click="handleCompile"
        >
          {{ t('Recompile') }}
        </UiButton>
        <UiButton
          type="button"
          variant="secondary"
          size="sm"
          class="document-run-action"
          :loading="launchingAction === 'diagnose'"
          @click="handleDiagnose"
        >
          {{ t('AI diagnose') }}
        </UiButton>
        <UiButton
          type="button"
          variant="primary"
          size="sm"
          class="document-run-action"
          :loading="launchingAction === 'fix'"
          @click="handleFix"
        >
          {{ t('AI fix') }}
        </UiButton>
        <UiButton
          v-if="latestSessionId"
          type="button"
          variant="ghost"
          size="sm"
          class="document-run-action"
          @click="openFullThread"
        >
          {{ t('Open full thread') }}
        </UiButton>
      </section>

      <section v-if="workflowHeader" class="document-run-section">
        <div class="document-run-section-label">{{ t('Workflow state') }}</div>
        <div class="document-run-summary-card">
          <div class="document-run-summary-top">
            <div class="document-run-summary-title">{{ workflowHeader.templateLabel }}</div>
            <span class="document-run-chip is-quiet" :class="statusToneClass">
              {{ latestRunStatusLabel }}
            </span>
          </div>
          <div class="document-run-summary-pills">
            <span class="document-run-pill">
              {{ t('Current step') }} · {{ workflowHeader.currentStepLabel || t('Waiting to start') }}
            </span>
            <span class="document-run-pill">
              {{ t('{count} artifacts', { count: workflowHeader.artifactCount }) }}
            </span>
          </div>
        </div>
      </section>

      <section v-if="pendingCheckpoint" class="document-run-section">
        <div class="document-run-section-label">{{ t('Decision needed') }}</div>
        <AiWorkflowCheckpointCard
          :workflow="latestRun"
          :checkpoint="pendingCheckpoint"
          :session-id="latestSessionId"
          surface="pane"
          compact
        />
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
            <div class="document-run-problem-copy">{{ problem.message || problem.raw || t('Issue detected') }}</div>
          </div>
          <div v-if="compileProblems.length > visibleProblems.length" class="document-run-problem-more">
            {{ t('{count} more issues in compile output', { count: compileProblems.length - visibleProblems.length }) }}
          </div>
        </div>
      </section>

      <section v-if="artifactCards.length" class="document-run-section">
        <div class="document-run-section-label">{{ t('Latest output') }}</div>
        <div class="document-run-result-list">
          <article
            v-for="card in artifactCards"
            :key="card.id"
            class="document-run-result-card"
            :class="`tone-${card.tone}`"
          >
            <div class="document-run-result-top">
              <span class="document-run-chip is-quiet">{{ card.badge }}</span>
            </div>

            <div class="document-run-result-title">{{ card.title }}</div>
            <div v-if="card.summary" class="document-run-result-summary">{{ card.summary }}</div>

            <div v-if="card.meta.length" class="document-run-meta-list">
              <div
                v-for="(meta, index) in card.meta"
                :key="`${card.id}-meta-${index}`"
                class="document-run-meta-row"
                :title="meta.title || meta.value"
              >
                <span class="document-run-meta-label">{{ meta.label }}</span>
                <span class="document-run-meta-value" :class="{ 'is-long': meta.long }">{{ meta.value }}</span>
              </div>
            </div>

            <div v-if="card.items.length" class="document-run-inline-list">
              <div
                v-for="item in card.items"
                :key="item.id"
                class="document-run-inline-item"
                :class="`tone-${item.tone || 'neutral'}`"
              >
                <div class="document-run-inline-title">{{ item.title }}</div>
                <div v-if="item.body" class="document-run-inline-copy">{{ item.body }}</div>
              </div>
            </div>

            <div v-if="card.moreCount" class="document-run-result-more">{{ card.moreLabel }}</div>

            <details
              v-if="card.detailsAvailable"
              class="document-run-details"
              @toggle="handleArtifactDetailsToggle(card.id, $event)"
            >
              <summary class="document-run-details-summary">{{ card.detailsLabel }}</summary>
              <pre v-if="isArtifactDetailsOpen(card.id)" class="document-run-details-body">
                {{ getArtifactDetails(card) }}
              </pre>
            </details>
          </article>
        </div>
        <div v-if="hiddenArtifactCount" class="document-run-result-more">
          {{ t('{count} older outputs hidden in sidebar', { count: hiddenArtifactCount }) }}
        </div>
      </section>

      <section v-else class="document-run-section">
        <div class="document-run-section-label">{{ t('Latest output') }}</div>
        <div class="document-run-placeholder">
          {{ t('Run AI diagnose or AI fix to keep the workflow state, approvals, and outcomes here.') }}
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAiArtifactsStore } from '../../stores/aiArtifacts'
import { useAiWorkflowRunsStore } from '../../stores/aiWorkflowRuns'
import { useChatStore } from '../../stores/chat'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useLatexStore } from '../../stores/latex'
import { useReferencesStore } from '../../stores/references'
import { useTypstStore } from '../../stores/typst'
import { useWorkspaceStore } from '../../stores/workspace'
import { continueAiToWorkbench } from '../../services/ai/launch'
import { useI18n } from '../../i18n'
import { isLatex, isTypst } from '../../utils/fileTypes'
import {
  buildDocumentRunArtifactCards,
  shortenDocumentPath,
} from '../../domains/document/documentRunInspectorRuntime.js'
import {
  describeWorkflowHeader,
  getPendingCheckpoint,
} from '../ai/workflowUi.js'
import AiWorkflowCheckpointCard from '../ai/AiWorkflowCheckpointCard.vue'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  overrideActiveFile: { type: String, default: null },
})

const aiArtifacts = useAiArtifactsStore()
const aiWorkflowRuns = useAiWorkflowRunsStore()
const chatStore = useChatStore()
const workflowStore = useDocumentWorkflowStore()
const editorStore = useEditorStore()
const filesStore = useFilesStore()
const latexStore = useLatexStore()
const referencesStore = useReferencesStore()
const typstStore = useTypstStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const launchingAction = ref('')
const expandedArtifactDetails = ref({})
const MAX_VISIBLE_ARTIFACTS = 2

const sourceFilePath = computed(() => {
  const activePath = props.overrideActiveFile || editorStore.activeTab || ''
  if (!activePath) return ''
  return workflowStore.getSourcePathForPreview(activePath) || activePath
})

const sourceFileName = computed(() => (
  String(sourceFilePath.value || '').split('/').pop() || t('Untitled document')
))

const sourceFileShortPath = computed(() => shortenDocumentPath(sourceFilePath.value, { segments: 3 }))

const supportsDocumentRun = computed(() => (
  !!sourceFilePath.value && (isLatex(sourceFilePath.value) || isTypst(sourceFilePath.value))
))

const kindLabel = computed(() => {
  if (!supportsDocumentRun.value) return ''
  return isLatex(sourceFilePath.value) ? t('LaTeX') : t('Typst')
})

const buildContext = computed(() => ({
  filesStore,
  workspace,
  latexStore,
  typstStore,
  referencesStore,
  t,
}))

const statusText = computed(() => {
  if (!supportsDocumentRun.value) return ''
  return workflowStore.getStatusTextForFile(sourceFilePath.value, buildContext.value)
})

const compileStatusLabel = computed(() => statusText.value || t('Idle'))

const compileProblems = computed(() => {
  if (!supportsDocumentRun.value) return []
  return workflowStore.getProblemsForFile(sourceFilePath.value, buildContext.value)
})

const problemSummary = computed(() => {
  const errorCount = compileProblems.value.filter((problem) => problem.severity === 'error').length
  const warningCount = compileProblems.value.filter((problem) => problem.severity !== 'error').length
  if (errorCount || warningCount) {
    return t('{errors} errors · {warnings} warnings', {
      errors: errorCount,
      warnings: warningCount,
    })
  }
  return t('No current compile issues')
})

const visibleProblems = computed(() => compileProblems.value.slice(0, 4))

const latestRun = computed(() => {
  if (!sourceFilePath.value) return null
  return aiWorkflowRuns.findLatestRunForFile(sourceFilePath.value, {
    templateIdPrefix: 'compile.tex-typ',
  })
})

const workflowHeader = computed(() => describeWorkflowHeader(latestRun.value))

const latestSessionId = computed(() => {
  const runId = latestRun.value?.run?.id || ''
  return runId ? aiWorkflowRuns.getSessionIdForRun(runId) || '' : ''
})

const latestSession = computed(() => (
  latestSessionId.value
    ? chatStore.sessions.find((session) => session.id === latestSessionId.value) || null
    : null
))

const latestSessionStatus = computed(() => {
  if (!latestSessionId.value) return ''
  const liveChat = chatStore.getChatInstance(latestSessionId.value)
  const liveStatus = liveChat?.state?.statusRef?.value || ''
  if (liveStatus) return liveStatus
  return String(latestSession.value?.status || '')
})

const sessionArtifacts = computed(() => (
  latestSessionId.value
    ? aiArtifacts.artifactsForSession(latestSessionId.value).slice().reverse()
    : []
))

const workflowArtifacts = computed(() => (
  Array.isArray(latestRun.value?.run?.artifacts) ? latestRun.value.run.artifacts.slice().reverse() : []
))

const latestArtifacts = computed(() => (
  sessionArtifacts.value.length ? sessionArtifacts.value : workflowArtifacts.value
))

const visibleArtifacts = computed(() => latestArtifacts.value.slice(0, MAX_VISIBLE_ARTIFACTS))

const hiddenArtifactCount = computed(() => (
  Math.max(0, latestArtifacts.value.length - visibleArtifacts.value.length)
))

const artifactCards = computed(() => buildDocumentRunArtifactCards(visibleArtifacts.value, { t }))

const pendingCheckpoint = computed(() => getPendingCheckpoint(latestRun.value))

const latestRunStatusLabel = computed(() => {
  const liveStatus = latestSessionStatus.value
  if (liveStatus === 'submitted' || liveStatus === 'streaming') return t('AI running')
  if (liveStatus === 'error') return t('AI failed')
  const status = String(latestRun.value?.run?.status || '')
  if (!status) return ''
  if (status === 'waiting_user') return t('Waiting for approval')
  if (status === 'running') return t('AI running')
  if (status === 'completed') return t('AI completed')
  if (status === 'failed') return t('AI failed')
  return t('AI planned')
})

const aiStatusLabel = computed(() => latestRunStatusLabel.value || t('No AI run yet'))

const statusToneClass = computed(() => {
  const label = latestRunStatusLabel.value
  if (!label) return 'tone-neutral'
  if (label === t('AI failed')) return 'tone-danger'
  if (label === t('Waiting for approval')) return 'tone-warning'
  if (label === t('AI completed')) return 'tone-success'
  return 'tone-accent'
})

watch(visibleArtifacts, () => {
  expandedArtifactDetails.value = {}
})

async function handleCompile() {
  if (!supportsDocumentRun.value) return
  await workflowStore.runBuildForFile(sourceFilePath.value, {
    ...buildContext.value,
    workflowOnly: false,
    trigger: 'document-run-inspector',
  })
}

async function launchDocumentRun(kind) {
  if (!supportsDocumentRun.value || launchingAction.value) return
  launchingAction.value = kind
  workspace.setRightSidebarPanel('document-run')
  workspace.openRightSidebar()
  try {
    if (kind === 'fix') {
      await workflowStore.launchWorkflowFixWithAiForFile(sourceFilePath.value, {
        chatStore,
        modelId: workspace.selectedModelId || null,
        source: 'document-run-inspector',
        entryContext: 'document-run-inspector',
      })
      return
    }

    await workflowStore.launchWorkflowDiagnoseWithAiForFile(sourceFilePath.value, {
      chatStore,
      modelId: workspace.selectedModelId || null,
      source: 'document-run-inspector',
      entryContext: 'document-run-inspector',
    })
  } finally {
    launchingAction.value = ''
  }
}

async function handleDiagnose() {
  await launchDocumentRun('diagnose')
}

async function handleFix() {
  await launchDocumentRun('fix')
}

function openFullThread() {
  if (!latestSessionId.value) return
  continueAiToWorkbench({
    editorStore,
    sessionId: latestSessionId.value,
  })
}

function isArtifactDetailsOpen(cardId) {
  return expandedArtifactDetails.value[cardId] === true
}

function handleArtifactDetailsToggle(cardId, event) {
  expandedArtifactDetails.value = {
    ...expandedArtifactDetails.value,
    [cardId]: event?.target?.open === true,
  }
}

function getArtifactDetails(card) {
  const index = Number(card?.detailsSourceIndex)
  if (!Number.isInteger(index) || index < 0) return ''
  return String(visibleArtifacts.value[index]?.body || '')
}
</script>

<style scoped>
.document-run-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary);
  color: var(--fg-primary);
}

.document-run-scroll {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 12px 12px 14px;
  overflow-y: auto;
}

.document-run-hero,
.document-run-summary-card,
.document-run-result-card,
.document-run-placeholder,
.document-run-empty {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 72%, var(--bg-primary));
}

.document-run-hero {
  padding: 12px;
}

.document-run-hero-top,
.document-run-summary-top,
.document-run-result-top {
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

.document-run-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.document-run-section-label {
  font-size: var(--sidebar-font-kicker);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.document-run-chip,
.document-run-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  font-size: var(--sidebar-font-meta);
  line-height: 1.2;
  color: var(--fg-secondary);
}

.document-run-chip.is-status,
.document-run-chip.is-quiet {
  flex-shrink: 0;
}

.tone-accent {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
}

.tone-success {
  color: var(--success, #4ade80);
  border-color: color-mix(in srgb, var(--success, #4ade80) 24%, var(--border));
  background: color-mix(in srgb, var(--success, #4ade80) 8%, var(--bg-primary));
}

.tone-warning {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 24%, var(--border));
  background: color-mix(in srgb, var(--warning) 8%, var(--bg-primary));
}

.tone-danger {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 24%, var(--border));
  background: color-mix(in srgb, var(--error) 8%, var(--bg-primary));
}

.tone-neutral {
  color: var(--fg-secondary);
}

.document-run-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.document-run-stat-card {
  min-width: 0;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 86%, transparent);
  padding: 9px 10px;
}

.document-run-stat-label {
  font-size: var(--sidebar-font-kicker);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-muted);
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
  gap: 8px;
}

.document-run-action {
  flex: 1 1 calc(50% - 4px);
  min-width: 0;
}

.document-run-summary-card,
.document-run-result-card {
  padding: 11px 12px;
}

.document-run-summary-title,
.document-run-result-title,
.document-run-inline-title {
  font-size: var(--sidebar-font-body-strong);
  line-height: 1.4;
  font-weight: 600;
  color: var(--fg-primary);
}

.document-run-summary-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.document-run-problem-list,
.document-run-result-list,
.document-run-inline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.document-run-problem,
.document-run-inline-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--bg-secondary) 68%, var(--bg-primary));
}

.document-run-inline-item.tone-warning {
  border-color: color-mix(in srgb, var(--warning) 24%, var(--border));
}

.document-run-inline-item.tone-danger {
  border-color: color-mix(in srgb, var(--error) 24%, var(--border));
}

.document-run-inline-item.tone-accent {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}

.document-run-problem.is-error {
  border-color: color-mix(in srgb, var(--error) 24%, var(--border));
}

.document-run-problem.is-warning {
  border-color: color-mix(in srgb, var(--warning) 24%, var(--border));
}

.document-run-problem-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.document-run-problem-tone,
.document-run-problem-line,
.document-run-result-summary,
.document-run-problem-copy,
.document-run-problem-more,
.document-run-inline-copy,
.document-run-result-more,
.document-run-empty-copy,
.document-run-placeholder {
  font-size: var(--sidebar-font-body);
  line-height: 1.5;
  color: var(--fg-secondary);
}

.document-run-problem-tone {
  font-weight: 600;
  color: var(--fg-primary);
}

.document-run-problem-line {
  color: var(--fg-muted);
}

.document-run-result-summary {
  margin-top: 4px;
}

.document-run-meta-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.document-run-meta-row {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.document-run-meta-label {
  font-size: var(--sidebar-font-meta);
  color: var(--fg-muted);
}

.document-run-meta-value {
  min-width: 0;
  font-size: var(--sidebar-font-meta);
  line-height: 1.45;
  color: var(--fg-primary);
  overflow-wrap: anywhere;
}

.document-run-meta-value.is-long {
  font-family: var(--editor-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: calc(var(--sidebar-font-meta) - 0.01rem);
}

.document-run-inline-copy {
  margin-top: 3px;
}

.document-run-result-more {
  margin-top: 8px;
}

.document-run-details {
  margin-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  padding-top: 10px;
}

.document-run-details-summary {
  cursor: pointer;
  list-style: none;
  font-size: var(--sidebar-font-meta);
  color: var(--accent);
}

.document-run-details-summary::-webkit-details-marker {
  display: none;
}

.document-run-details-body {
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: calc(var(--sidebar-font-body) - 0.01rem);
  line-height: 1.5;
  color: var(--fg-secondary);
  max-height: 240px;
  overflow: auto;
}

.document-run-placeholder,
.document-run-empty {
  padding: 14px 12px;
}

.document-run-empty {
  margin: 12px;
}

.document-run-empty-title {
  font-size: var(--sidebar-font-body-strong);
  font-weight: 600;
  color: var(--fg-primary);
}

.document-run-empty-copy {
  margin-top: 5px;
}

@media (max-width: 780px) {
  .document-run-stat-grid {
    grid-template-columns: 1fr;
  }

  .document-run-action {
    flex-basis: 100%;
  }

  .document-run-meta-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
