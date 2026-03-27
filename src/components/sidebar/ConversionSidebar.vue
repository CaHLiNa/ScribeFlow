<template>
  <div class="conversion-sidebar">
    <template v-if="panel === 'pdf-translate'">
      <section class="conversion-sidebar-card conversion-sidebar-card-hero">
        <div class="conversion-sidebar-kicker">{{ t('PDF Translation') }}</div>
        <div class="conversion-sidebar-title">
          {{ selectedInputLabel || t('Choose a project PDF to convert') }}
        </div>
        <p class="conversion-sidebar-copy">
          {{ t('Use the current PDF translation runtime to generate bilingual or translated PDF outputs.') }}
        </p>

        <div class="conversion-sidebar-actions">
          <UiButton
            v-if="activePdfCandidate"
            variant="secondary"
            size="sm"
            @click="useActivePdf"
          >
            {{ t('Use active PDF') }}
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            @click="workspace.openSettings('pdf-translate')"
          >
            {{ t('Open PDF Translation Settings') }}
          </UiButton>
        </div>
      </section>

      <section class="conversion-sidebar-card">
        <div class="conversion-sidebar-section-head">
          <div>
            <div class="conversion-sidebar-kicker">{{ t('Runtime') }}</div>
            <div class="conversion-sidebar-inline-value">
              <span class="conversion-runtime-dot" :class="runtimeDotClass"></span>
              <span>{{ pdfTranslateStore.runtimeLabel }}</span>
            </div>
          </div>
        </div>

        <div class="conversion-sidebar-action-grid">
          <UiButton
            variant="secondary"
            size="sm"
            :loading="pdfTranslateStore.runtimeRefreshing"
            @click="refreshRuntime(true)"
          >
            {{ t('Refresh') }}
          </UiButton>
          <UiButton
            variant="secondary"
            size="sm"
            :loading="pdfTranslateStore.setupInProgress"
            @click="prepareRuntime"
          >
            {{ t('Prepare Runtime') }}
          </UiButton>
          <UiButton
            variant="secondary"
            size="sm"
            :loading="pdfTranslateStore.warmupInProgress"
            :disabled="!runtimeReady"
            @click="warmupRuntime"
          >
            {{ t('Warm Up Runtime') }}
          </UiButton>
        </div>

        <p v-if="runtimeError" class="conversion-sidebar-error">{{ runtimeError }}</p>
      </section>

      <section class="conversion-sidebar-card">
        <div class="conversion-sidebar-section-head">
          <div>
            <div class="conversion-sidebar-kicker">{{ t('Translation defaults') }}</div>
            <div class="conversion-sidebar-section-title">{{ t('Choose a project PDF to convert') }}</div>
          </div>
        </div>

        <div class="conversion-sidebar-form">
          <label class="conversion-sidebar-field">
            <span class="conversion-sidebar-label">{{ t('Source file') }}</span>
            <UiSelect
              v-model="selectedInputPath"
              :disabled="pdfOptions.length === 0"
              shell-class="conversion-sidebar-select"
            >
              <option v-if="pdfOptions.length === 0" value="">
                {{ t('No PDF files in this project yet') }}
              </option>
              <option v-for="option in pdfOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>

          <label class="conversion-sidebar-field">
            <span class="conversion-sidebar-label">{{ t('Model') }}</span>
            <UiSelect
              v-model="draft.modelId"
              :disabled="compatibleModels.length === 0"
              shell-class="conversion-sidebar-select"
            >
              <option v-if="compatibleModels.length === 0" value="">
                {{ t('No compatible models available') }}
              </option>
              <optgroup
                v-for="group in compatibleModelGroups"
                :key="group.provider"
                :label="group.label"
              >
                <option v-for="model in group.models" :key="model.id" :value="model.id">
                  {{ model.name }}
                </option>
              </optgroup>
            </UiSelect>
          </label>

          <div class="conversion-sidebar-field-row">
            <label class="conversion-sidebar-field">
              <span class="conversion-sidebar-label">{{ t('Source language') }}</span>
              <UiSelect v-model="draft.langIn" shell-class="conversion-sidebar-select">
                <option v-for="option in sourceLanguages" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </UiSelect>
            </label>

            <label class="conversion-sidebar-field">
              <span class="conversion-sidebar-label">{{ t('Target language') }}</span>
              <UiSelect v-model="draft.langOut" shell-class="conversion-sidebar-select">
                <option v-for="option in targetLanguages" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </UiSelect>
            </label>
          </div>

          <div class="conversion-sidebar-field-row">
            <label class="conversion-sidebar-field">
              <span class="conversion-sidebar-label">{{ t('Output mode') }}</span>
              <UiSelect v-model="draft.mode" shell-class="conversion-sidebar-select">
                <option v-for="option in outputModes" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </UiSelect>
            </label>

            <label class="conversion-sidebar-field">
              <span class="conversion-sidebar-label">{{ t('Bilingual layout') }}</span>
              <UiSelect
                v-model="draft.dualLayout"
                :disabled="draft.mode === 'mono'"
                shell-class="conversion-sidebar-select"
              >
                <option v-for="option in dualLayouts" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </UiSelect>
            </label>
          </div>

          <label class="conversion-sidebar-field">
            <span class="conversion-sidebar-label">{{ t('Primary font family') }}</span>
            <UiSelect v-model="draft.fontFamily" shell-class="conversion-sidebar-select">
              <option v-for="option in fontFamilies" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>
        </div>
      </section>

      <section class="conversion-sidebar-card">
        <div class="conversion-sidebar-toggle-list">
          <div class="conversion-sidebar-toggle-row">
            <div>
              <div class="conversion-sidebar-inline-label">{{ t('Enhance compatibility') }}</div>
              <div class="conversion-sidebar-hint">
                {{ t('Prefer safer PDF output for difficult academic layouts.') }}
              </div>
            </div>
            <UiSwitch
              v-model="draft.enhanceCompatibility"
              :aria-label="t('Enhance compatibility')"
            />
          </div>

          <div class="conversion-sidebar-toggle-row">
            <div>
              <div class="conversion-sidebar-inline-label">{{ t('Translate table text') }}</div>
              <div class="conversion-sidebar-hint">
                {{ t('Translate detected table content when supported.') }}
              </div>
            </div>
            <UiSwitch
              v-model="draft.translateTableText"
              :aria-label="t('Translate table text')"
            />
          </div>

          <div class="conversion-sidebar-toggle-row">
            <div>
              <div class="conversion-sidebar-inline-label">{{ t('OCR fallback') }}</div>
              <div class="conversion-sidebar-hint">{{ ocrModeSummary }}</div>
            </div>
            <UiSwitch
              :model-value="draft.ocrWorkaround || draft.autoEnableOcrWorkaround"
              :aria-label="t('OCR fallback')"
              @update:modelValue="toggleOcrFallback"
            />
          </div>
        </div>

        <div v-if="pdfOptions.length === 0" class="conversion-sidebar-empty">
          <div class="conversion-sidebar-empty-title">{{ t('No PDF files in this project yet') }}</div>
          <div class="conversion-sidebar-copy">
            {{ t('Open or add a PDF in this workspace first, then come back here to convert it.') }}
          </div>
        </div>

        <div v-if="actionError" class="conversion-sidebar-error">{{ actionError }}</div>

        <div class="conversion-sidebar-actions">
          <UiButton
            variant="secondary"
            size="sm"
            :disabled="!settingsDirty"
            :loading="pdfTranslateStore.saving"
            @click="saveDefaults"
          >
            {{ t('Save defaults') }}
          </UiButton>
          <UiButton
            variant="primary"
            size="sm"
            :disabled="!canStartTranslation"
            :loading="startingTask"
            @click="startTranslation"
          >
            {{ t('Start conversion') }}
          </UiButton>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="conversion-sidebar-card">
        <div class="conversion-sidebar-section-head">
          <div>
            <div class="conversion-sidebar-kicker">{{ t('Recent tasks') }}</div>
            <div class="conversion-sidebar-section-title">
              {{ t('Track conversion progress and reopen outputs') }}
            </div>
          </div>
        </div>

        <div v-if="conversionTasks.length === 0" class="conversion-sidebar-empty">
          <div class="conversion-sidebar-empty-title">{{ t('No conversion tasks yet') }}</div>
          <div class="conversion-sidebar-copy">
            {{ t('Start a PDF translation here and it will appear in this queue.') }}
          </div>
        </div>

        <div v-else class="conversion-sidebar-task-list">
          <button
            v-for="task in conversionTasks"
            :key="task.id"
            type="button"
            class="conversion-task-card"
            :class="{ 'is-active': selectedTaskId === task.id }"
            @click="selectTask(task.id)"
          >
            <div class="conversion-task-title-row">
              <span class="conversion-task-title">{{ task.title }}</span>
              <span class="conversion-task-status" :class="`is-${task.statusTone}`">
                {{ task.statusLabel }}
              </span>
            </div>
            <div class="conversion-task-copy">{{ task.message }}</div>
            <div class="conversion-task-meta">
              <span>{{ task.outputSummary }}</span>
              <span v-if="task.progress > 0">· {{ task.progress }}%</span>
            </div>
          </button>
        </div>
      </section>

      <section class="conversion-sidebar-card conversion-sidebar-card-detail">
        <div class="conversion-sidebar-section-head">
          <div>
            <div class="conversion-sidebar-kicker">{{ t('Selected task') }}</div>
            <div class="conversion-sidebar-section-title">
              {{ selectedTask ? selectedTask.title : t('No task selected') }}
            </div>
          </div>
        </div>

        <template v-if="selectedTask">
          <div class="conversion-sidebar-detail-grid">
            <div class="conversion-sidebar-detail-row">
              <span class="conversion-sidebar-label">{{ t('Source file') }}</span>
              <span class="conversion-sidebar-detail-value">{{ selectedTask.inputLabel }}</span>
            </div>
            <div class="conversion-sidebar-detail-row">
              <span class="conversion-sidebar-label">{{ t('Output') }}</span>
              <span class="conversion-sidebar-detail-value">{{ selectedTask.outputLabel }}</span>
            </div>
            <div class="conversion-sidebar-detail-row">
              <span class="conversion-sidebar-label">{{ t('Mode') }}</span>
              <span class="conversion-sidebar-detail-value">{{ selectedTask.modeLabel }}</span>
            </div>
            <div class="conversion-sidebar-detail-row">
              <span class="conversion-sidebar-label">{{ t('Updated') }}</span>
              <span class="conversion-sidebar-detail-value">{{ selectedTask.updatedLabel }}</span>
            </div>
          </div>

          <div class="conversion-sidebar-actions">
            <UiButton variant="secondary" size="sm" @click="openTaskInput(selectedTask)">
              {{ t('Open source PDF') }}
            </UiButton>
            <UiButton
              variant="primary"
              size="sm"
              :disabled="!selectedTask.outputPath"
              @click="openTaskOutput(selectedTask)"
            >
              {{ t('Open output') }}
            </UiButton>
            <UiButton
              v-if="selectedTask.canCancel"
              variant="ghost"
              size="sm"
              @click="cancelTask(selectedTask.id)"
            >
              {{ t('Cancel translation') }}
            </UiButton>
          </div>
        </template>

        <div v-else class="conversion-sidebar-empty">
          <div class="conversion-sidebar-empty-title">{{ t('No task selected') }}</div>
          <div class="conversion-sidebar-copy">
            {{ t('Pick a task to inspect its input, output, and current status.') }}
          </div>
        </div>

        <div v-if="actionError" class="conversion-sidebar-error">{{ actionError }}</div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { createDefaultPdfTranslateSettings } from '../../domains/document/pdfTranslateRuntime'
import {
  createPdfTranslateDualLayouts,
  createPdfTranslateFontFamilies,
  createPdfTranslateLanguageOptions,
  createPdfTranslateOutputModes,
  createPdfTranslateTargetLanguageOptions,
  createPdfTranslateTaskView,
  getPdfTranslateOcrModeSummary,
  getPdfTranslateRuntimeTone,
  relativeWorkspacePath,
} from '../../domains/document/pdfTranslateUi'
import { groupModelsByProvider } from '../../services/modelCatalog'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const props = defineProps({
  panel: {
    type: String,
    default: 'pdf-translate',
  },
})

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const editorStore = useEditorStore()
const pdfTranslateStore = usePdfTranslateStore()
const { t } = useI18n()

const draft = reactive(createDefaultPdfTranslateSettings())
const selectedInputPath = ref('')
const selectedTaskId = ref('')
const startingTask = ref(false)
const actionError = ref('')

const sourceLanguages = computed(() => createPdfTranslateLanguageOptions(t))
const targetLanguages = computed(() => createPdfTranslateTargetLanguageOptions(t))
const outputModes = computed(() => createPdfTranslateOutputModes(t))
const dualLayouts = computed(() => createPdfTranslateDualLayouts(t))
const fontFamilies = computed(() => createPdfTranslateFontFamilies(t))

const compatibleModels = computed(() => pdfTranslateStore.compatibleModels)
const compatibleModelGroups = computed(() => groupModelsByProvider(compatibleModels.value))
const runtimeReady = computed(() => pdfTranslateStore.runtimeStatus?.status === 'Ready')
const runtimeError = computed(() =>
  pdfTranslateStore.runtimeStatus?.status === 'Error' ? pdfTranslateStore.runtimeStatus.data : ''
)
const runtimeDotClass = computed(() => `is-${getPdfTranslateRuntimeTone(pdfTranslateStore.runtimeStatus)}`)

const activePdfCandidate = computed(() =>
  editorStore.activeTab?.toLowerCase?.().endsWith('.pdf') ? editorStore.activeTab : ''
)

const pdfOptions = computed(() =>
  filesStore.flatFiles
    .filter((file) => file.path?.toLowerCase?.().endsWith('.pdf'))
    .map((file) => ({
      value: file.path,
      label: relativeWorkspacePath(file.path, workspace.path || ''),
    }))
)

const conversionTasks = computed(() =>
  pdfTranslateStore.taskOrder.map((taskId) => taskById(taskId)).filter(Boolean)
)

const selectedTask = computed(() => (selectedTaskId.value ? taskById(selectedTaskId.value) : null))
const selectedInputLabel = computed(() =>
  selectedInputPath.value
    ? relativeWorkspacePath(selectedInputPath.value, workspace.path || '')
    : ''
)
const settingsDirty = computed(() =>
  JSON.stringify(draftSnapshot()) !== JSON.stringify(pdfTranslateStore.settings)
)
const canStartTranslation = computed(
  () => !!selectedInputPath.value && compatibleModels.value.length > 0 && !startingTask.value
)
const ocrModeSummary = computed(() => getPdfTranslateOcrModeSummary(draft, t))

function draftSnapshot() {
  return { ...draft }
}

function syncDraft() {
  Object.assign(draft, createDefaultPdfTranslateSettings(), pdfTranslateStore.settings)
}

function ensureSelectedInput() {
  if (selectedInputPath.value && pdfOptions.value.some((item) => item.value === selectedInputPath.value)) {
    return
  }
  if (activePdfCandidate.value) {
    selectedInputPath.value = activePdfCandidate.value
    return
  }
  if (conversionTasks.value[0]?.inputPath) {
    selectedInputPath.value = conversionTasks.value[0].inputPath
    return
  }
  selectedInputPath.value = pdfOptions.value[0]?.value || ''
}

function taskById(taskId = '') {
  return createPdfTranslateTaskView(pdfTranslateStore.tasks[taskId], {
    workspacePath: workspace.path || '',
    fallbackMode: pdfTranslateStore.settings.mode,
    t,
  })
}

function selectTask(taskId = '') {
  selectedTaskId.value = taskId
  const task = taskById(taskId)
  if (task?.inputPath) {
    selectedInputPath.value = task.inputPath
  }
}

function useActivePdf() {
  if (!activePdfCandidate.value) return
  selectedInputPath.value = activePdfCandidate.value
}

function toggleOcrFallback(value) {
  if (value) {
    draft.autoEnableOcrWorkaround = true
    draft.ocrWorkaround = false
    return
  }
  draft.autoEnableOcrWorkaround = false
  draft.ocrWorkaround = false
}

async function saveDefaults() {
  actionError.value = ''
  await pdfTranslateStore.saveSettings(draftSnapshot())
}

async function refreshRuntime(force = false) {
  actionError.value = ''
  await pdfTranslateStore.refreshRuntimeStatus({ force, ensureEnvironment: true })
}

async function prepareRuntime() {
  actionError.value = ''
  try {
    await pdfTranslateStore.setupRuntime()
  } catch (error) {
    actionError.value = error?.message || String(error)
  }
}

async function warmupRuntime() {
  actionError.value = ''
  try {
    await pdfTranslateStore.warmupRuntime()
  } catch (error) {
    actionError.value = error?.message || String(error)
  }
}

async function startTranslation() {
  if (!canStartTranslation.value) return
  actionError.value = ''
  startingTask.value = true
  try {
    await pdfTranslateStore.saveSettings(draftSnapshot())
    const task = await pdfTranslateStore.startTranslation(selectedInputPath.value)
    if (task?.id) {
      selectedTaskId.value = task.id
      workspace.setLeftSidebarPanel('pdf-translate-tasks')
    }
  } catch (error) {
    actionError.value = error?.message || String(error)
  } finally {
    startingTask.value = false
  }
}

async function cancelTask(taskId = '') {
  if (!taskId) return
  actionError.value = ''
  try {
    await pdfTranslateStore.cancelTask(taskId)
  } catch (error) {
    actionError.value = error?.message || String(error)
  }
}

function openTaskInput(task) {
  if (!task?.inputPath) return
  workspace.openWorkspaceSurface()
  editorStore.openFile(task.inputPath)
}

function openTaskOutput(task) {
  if (!task?.outputPath) return
  workspace.openWorkspaceSurface()
  editorStore.openFile(task.outputPath)
}

watch(
  () => pdfTranslateStore.settings,
  () => {
    syncDraft()
    ensureSelectedInput()
  },
  { deep: true, immediate: true },
)

watch(
  conversionTasks,
  (tasks) => {
    if (selectedTaskId.value && tasks.some((task) => task.id === selectedTaskId.value)) return
    selectedTaskId.value = tasks[0]?.id || ''
  },
  { immediate: true, deep: true },
)

watch(activePdfCandidate, () => {
  ensureSelectedInput()
})

watch(
  () => props.panel,
  (panel) => {
    if (panel === 'pdf-translate') {
      ensureSelectedInput()
    }
  },
  { immediate: true },
)

onMounted(async () => {
  if (!workspace.modelsConfig) {
    await workspace.loadSettings()
  }
  await filesStore.ensureFlatFilesReady()
  await pdfTranslateStore.ensureListeners()
  await pdfTranslateStore.loadTasks()
  await pdfTranslateStore.loadSettings()
  await pdfTranslateStore.refreshRuntimeStatus({ ensureEnvironment: true })
  ensureSelectedInput()
})
</script>

<style scoped>
.conversion-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  min-height: 0;
  padding: var(--space-2);
  overflow: auto;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-muted) 42%, transparent),
      transparent 28%
    ),
    var(--bg-primary);
}

.conversion-sidebar-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-base) 88%, var(--bg-primary));
  box-shadow: var(--shadow-sm);
}

.conversion-sidebar-card-hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 14%, transparent), transparent 42%),
    color-mix(in srgb, var(--surface-base) 90%, var(--bg-primary));
}

.conversion-sidebar-card-detail {
  min-height: 160px;
}

.conversion-sidebar-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.conversion-sidebar-kicker,
.conversion-sidebar-label,
.conversion-sidebar-inline-label {
  color: var(--text-secondary);
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.conversion-sidebar-title,
.conversion-sidebar-section-title,
.conversion-sidebar-inline-value {
  color: var(--text-primary);
}

.conversion-sidebar-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}

.conversion-sidebar-section-title {
  font-size: var(--ui-font-body);
  font-weight: 600;
  line-height: 1.4;
}

.conversion-sidebar-copy,
.conversion-sidebar-hint,
.conversion-task-copy,
.conversion-task-meta,
.conversion-sidebar-detail-value {
  color: var(--text-muted);
  line-height: 1.5;
}

.conversion-sidebar-copy,
.conversion-sidebar-hint,
.conversion-task-meta {
  font-size: var(--ui-font-caption);
}

.conversion-sidebar-inline-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.conversion-runtime-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-muted);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--surface-muted) 74%, transparent);
}

.conversion-runtime-dot.is-good {
  background: var(--success);
}

.conversion-runtime-dot.is-bad {
  background: var(--error);
}

.conversion-runtime-dot.is-warn {
  background: var(--warning);
}

.conversion-sidebar-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.conversion-sidebar-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.conversion-sidebar-field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.conversion-sidebar-select {
  min-height: 30px;
  font-size: var(--ui-font-caption);
  background: var(--surface-base);
}

.conversion-sidebar-select:hover {
  border-color: var(--border-strong);
}

.conversion-sidebar-toggle-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.conversion-sidebar-toggle-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-muted) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 92%, transparent);
}

.conversion-sidebar-actions,
.conversion-sidebar-action-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.conversion-sidebar-action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.conversion-sidebar-empty {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px dashed color-mix(in srgb, var(--border-strong) 74%, transparent);
  background: color-mix(in srgb, var(--surface-muted) 66%, transparent);
}

.conversion-sidebar-empty-title {
  color: var(--text-primary);
  font-weight: 600;
}

.conversion-sidebar-error {
  color: var(--error);
  font-size: var(--ui-font-caption);
  line-height: 1.45;
}

.conversion-sidebar-task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.conversion-task-card {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: inherit;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    transform 140ms ease;
  padding: var(--space-2);
}

.conversion-task-card:hover,
.conversion-task-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 36%, var(--border-strong));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-base));
  transform: translateY(-1px);
}

.conversion-task-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.conversion-task-title {
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.35;
  word-break: break-word;
}

.conversion-task-status {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-muted) 88%, transparent);
  color: var(--text-secondary);
  font-size: var(--ui-font-micro);
  font-weight: 600;
  line-height: 1;
}

.conversion-task-status.is-running,
.conversion-task-status.is-warning {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  border-color: color-mix(in srgb, var(--warning) 24%, transparent);
}

.conversion-task-status.is-success {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  border-color: color-mix(in srgb, var(--success) 24%, transparent);
}

.conversion-task-status.is-error {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 14%, transparent);
  border-color: color-mix(in srgb, var(--error) 24%, transparent);
}

.conversion-task-status.is-muted {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface-muted) 84%, transparent);
  border-color: color-mix(in srgb, var(--border-subtle) 96%, transparent);
}

.conversion-task-copy {
  margin-top: 6px;
}

.conversion-task-meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.conversion-sidebar-detail-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.conversion-sidebar-detail-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

@media (max-width: 900px) {
  .conversion-sidebar-field-row,
  .conversion-sidebar-action-grid {
    grid-template-columns: 1fr;
  }
}
</style>
