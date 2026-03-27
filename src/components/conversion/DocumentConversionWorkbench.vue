<template>
  <div class="conversion-workbench h-full min-h-0">
    <div class="conversion-shell h-full min-h-0">
      <section class="conversion-hero">
        <div class="conversion-hero-copy">
          <div class="conversion-kicker">{{ t('Document Conversion') }}</div>
          <h1 class="conversion-title">{{ t('Convert PDF into usable outputs') }}</h1>
          <p class="conversion-description">
            {{
              t(
                'Start from one PDF and route it into bilingual output, translated-only output, and the future editable document formats from one workspace.'
              )
            }}
          </p>
        </div>

        <div class="conversion-runtime-card">
          <div class="conversion-runtime-head">
            <span class="conversion-runtime-dot" :class="runtimeDotClass"></span>
            <div>
              <div class="conversion-runtime-label">{{ t('Runtime') }}</div>
              <div class="conversion-runtime-value">{{ pdfTranslateStore.runtimeLabel }}</div>
            </div>
          </div>

          <div class="conversion-runtime-actions">
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
            <UiButton
              variant="ghost"
              size="sm"
              @click="workspace.openSettings('pdf-translate')"
            >
              {{ t('Open PDF Translation Settings') }}
            </UiButton>
          </div>

          <p v-if="runtimeError" class="conversion-inline-error">{{ runtimeError }}</p>
        </div>
      </section>

      <div class="conversion-layout">
        <main class="conversion-main">
          <section class="conversion-card">
            <div class="conversion-card-head">
              <div>
                <div class="conversion-card-kicker">{{ t('Input PDF') }}</div>
                <div class="conversion-card-title">{{ t('Choose a project PDF to convert') }}</div>
              </div>
              <UiButton
                v-if="activePdfCandidate"
                variant="ghost"
                size="sm"
                @click="useActivePdf"
              >
                {{ t('Use active PDF') }}
              </UiButton>
            </div>

            <div class="conversion-form-grid">
              <label class="conversion-field conversion-field-span-2">
                <span class="conversion-label">{{ t('Source file') }}</span>
                <UiSelect
                  v-model="selectedInputPath"
                  :disabled="pdfOptions.length === 0"
                  shell-class="conversion-select-shell"
                >
                  <option v-if="pdfOptions.length === 0" value="">
                    {{ t('No PDF files in this project yet') }}
                  </option>
                  <option v-for="option in pdfOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </UiSelect>
              </label>

              <label class="conversion-field">
                <span class="conversion-label">{{ t('Model') }}</span>
                <UiSelect
                  v-model="draft.modelId"
                  :disabled="compatibleModels.length === 0"
                  shell-class="conversion-select-shell"
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

              <label class="conversion-field">
                <span class="conversion-label">{{ t('Output mode') }}</span>
                <UiSelect v-model="draft.mode" shell-class="conversion-select-shell">
                  <option v-for="option in outputModes" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </UiSelect>
              </label>

              <label class="conversion-field">
                <span class="conversion-label">{{ t('Source language') }}</span>
                <UiSelect v-model="draft.langIn" shell-class="conversion-select-shell">
                  <option v-for="option in sourceLanguages" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </UiSelect>
              </label>

              <label class="conversion-field">
                <span class="conversion-label">{{ t('Target language') }}</span>
                <UiSelect v-model="draft.langOut" shell-class="conversion-select-shell">
                  <option v-for="option in targetLanguages" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </UiSelect>
              </label>

              <label class="conversion-field">
                <span class="conversion-label">{{ t('Bilingual layout') }}</span>
                <UiSelect
                  v-model="draft.dualLayout"
                  :disabled="draft.mode === 'mono'"
                  shell-class="conversion-select-shell"
                >
                  <option v-for="option in dualLayouts" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </UiSelect>
              </label>

              <label class="conversion-field">
                <span class="conversion-label">{{ t('Primary font family') }}</span>
                <UiSelect v-model="draft.fontFamily" shell-class="conversion-select-shell">
                  <option v-for="option in fontFamilies" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </UiSelect>
              </label>
            </div>

            <div class="conversion-toggle-grid">
              <div class="conversion-toggle-row">
                <div>
                  <div class="conversion-inline-label">{{ t('Enhance compatibility') }}</div>
                  <div class="conversion-field-hint">
                    {{ t('Prefer safer PDF output for difficult academic layouts.') }}
                  </div>
                </div>
                <UiSwitch v-model="draft.enhanceCompatibility" :aria-label="t('Enhance compatibility')" />
              </div>

              <div class="conversion-toggle-row">
                <div>
                  <div class="conversion-inline-label">{{ t('Translate table text') }}</div>
                  <div class="conversion-field-hint">
                    {{ t('Translate detected table content when supported.') }}
                  </div>
                </div>
                <UiSwitch v-model="draft.translateTableText" :aria-label="t('Translate table text')" />
              </div>

              <div class="conversion-toggle-row">
                <div>
                  <div class="conversion-inline-label">{{ t('OCR fallback') }}</div>
                  <div class="conversion-field-hint">
                    {{ ocrModeSummary }}
                  </div>
                </div>
                <UiSwitch
                  :model-value="draft.ocrWorkaround || draft.autoEnableOcrWorkaround"
                  :aria-label="t('OCR fallback')"
                  @update:modelValue="toggleOcrFallback"
                />
              </div>
            </div>

            <div v-if="pdfOptions.length === 0" class="conversion-empty-inline">
              <div class="conversion-empty-title">{{ t('No PDF files in this project yet') }}</div>
              <div class="conversion-empty-copy">
                {{ t('Open or add a PDF in this workspace first, then come back here to convert it.') }}
              </div>
            </div>

            <div v-if="actionError" class="conversion-inline-error">
              {{ actionError }}
            </div>

            <div class="conversion-card-actions">
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

          <section class="conversion-card">
            <div class="conversion-card-head">
              <div>
                <div class="conversion-card-kicker">{{ t('Targets') }}</div>
                <div class="conversion-card-title">{{ t('Use one workspace for current and future output formats') }}</div>
              </div>
            </div>

            <div class="conversion-target-grid">
              <button
                v-for="target in conversionTargets"
                :key="target.id"
                type="button"
                class="conversion-target-card"
                :class="{
                  'is-active': selectedTargetId === target.id,
                  'is-disabled': !target.enabled,
                }"
                :disabled="!target.enabled"
                @click="selectedTargetId = target.id"
              >
                <div class="conversion-target-title-row">
                  <span class="conversion-target-title">{{ target.title }}</span>
                  <span class="conversion-target-pill" :class="{ 'is-soon': !target.enabled }">
                    {{ target.enabled ? t('Available now') : t('Planned next') }}
                  </span>
                </div>
                <div class="conversion-target-copy">{{ target.description }}</div>
              </button>
            </div>
          </section>
        </main>

        <aside class="conversion-side">
          <section class="conversion-card">
            <div class="conversion-card-head">
              <div>
                <div class="conversion-card-kicker">{{ t('Recent tasks') }}</div>
                <div class="conversion-card-title">{{ t('Track conversion progress and reopen outputs') }}</div>
              </div>
            </div>

            <div v-if="conversionTasks.length === 0" class="conversion-empty-inline">
              <div class="conversion-empty-title">{{ t('No conversion tasks yet') }}</div>
              <div class="conversion-empty-copy">
                {{ t('Start a PDF translation here and it will appear in this queue.') }}
              </div>
            </div>

            <div v-else class="conversion-task-list">
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

          <section class="conversion-card conversion-card-detail">
            <div class="conversion-card-head">
              <div>
                <div class="conversion-card-kicker">{{ t('Selected task') }}</div>
                <div class="conversion-card-title">
                  {{ selectedTask ? selectedTask.title : t('No task selected') }}
                </div>
              </div>
            </div>

            <template v-if="selectedTask">
              <div class="conversion-detail-grid">
                <div class="conversion-detail-row">
                  <span class="conversion-detail-label">{{ t('Source file') }}</span>
                  <span class="conversion-detail-value">{{ selectedTask.inputLabel }}</span>
                </div>
                <div class="conversion-detail-row">
                  <span class="conversion-detail-label">{{ t('Output') }}</span>
                  <span class="conversion-detail-value">{{ selectedTask.outputLabel }}</span>
                </div>
                <div class="conversion-detail-row">
                  <span class="conversion-detail-label">{{ t('Mode') }}</span>
                  <span class="conversion-detail-value">{{ selectedTask.modeLabel }}</span>
                </div>
                <div class="conversion-detail-row">
                  <span class="conversion-detail-label">{{ t('Updated') }}</span>
                  <span class="conversion-detail-value">{{ selectedTask.updatedLabel }}</span>
                </div>
              </div>

              <div class="conversion-detail-actions">
                <UiButton
                  variant="secondary"
                  size="sm"
                  @click="openTaskInput(selectedTask)"
                >
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

            <div v-else class="conversion-empty-inline">
              <div class="conversion-empty-title">{{ t('No task selected') }}</div>
              <div class="conversion-empty-copy">
                {{ t('Pick a task on the right to inspect its input, output, and current status.') }}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import {
  createDefaultPdfTranslateSettings,
} from '../../domains/document/pdfTranslateRuntime'
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

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const editorStore = useEditorStore()
const pdfTranslateStore = usePdfTranslateStore()
const { t } = useI18n()

const draft = reactive(createDefaultPdfTranslateSettings())
const selectedInputPath = ref('')
const selectedTargetId = ref('translated-pdf')
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

const pdfOptions = computed(() => (
  filesStore.flatFiles
    .filter((file) => file.path?.toLowerCase?.().endsWith('.pdf'))
    .map((file) => ({
      value: file.path,
      label: relativeWorkspacePath(file.path, workspace.path || ''),
    }))
))

const conversionTargets = computed(() => [
  {
    id: 'translated-pdf',
    title: t('Translated PDF'),
    description: t('Use the current PDF translation runtime to generate bilingual or translated PDF outputs.'),
    enabled: true,
  },
  {
    id: 'markdown',
    title: t('Markdown'),
    description: t('Turn PDF structure into editable Markdown for notes and drafting.'),
    enabled: false,
  },
  {
    id: 'latex',
    title: t('LaTeX'),
    description: t('Export academic PDF structure toward a LaTeX source project.'),
    enabled: false,
  },
  {
    id: 'typst',
    title: t('Typst'),
    description: t('Generate a cleaner Typst project for modern academic editing.'),
    enabled: false,
  },
])

const selectedTask = computed(() => (
  selectedTaskId.value ? taskById(selectedTaskId.value) : null
))

const conversionTasks = computed(() => (
  pdfTranslateStore.taskOrder
    .map((taskId) => taskById(taskId))
    .filter(Boolean)
))

const settingsDirty = computed(() =>
  JSON.stringify(draftSnapshot()) !== JSON.stringify(pdfTranslateStore.settings)
)

const canStartTranslation = computed(() => (
  selectedTargetId.value === 'translated-pdf'
  && !!selectedInputPath.value
  && compatibleModels.value.length > 0
  && !startingTask.value
))
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

function selectTask(taskId = '') {
  selectedTaskId.value = taskId
  const task = taskById(taskId)
  if (task?.inputPath) {
    selectedInputPath.value = task.inputPath
  }
}

function taskById(taskId = '') {
  return createPdfTranslateTaskView(pdfTranslateStore.tasks[taskId], {
    workspacePath: workspace.path || '',
    fallbackMode: pdfTranslateStore.settings.mode,
    t,
  })
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
    if (!selectedTaskId.value && tasks[0]?.id) {
      selectedTaskId.value = tasks[0].id
    }
  },
  { immediate: true, deep: true },
)

watch(activePdfCandidate, () => {
  ensureSelectedInput()
})

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
.conversion-workbench {
  height: 100%;
  min-height: 0;
  overflow: auto;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 10%, transparent), transparent 32%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-muted) 54%, transparent), transparent 28%),
    var(--bg-primary);
}

.conversion-shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  min-height: 0;
  padding: var(--space-3);
  overflow: auto;
}

.conversion-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
  gap: var(--space-3);
  align-items: start;
}

.conversion-hero-copy,
.conversion-runtime-card,
.conversion-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-base) 84%, var(--bg-primary));
  box-shadow: var(--shadow-sm);
}

.conversion-hero-copy {
  padding: var(--space-4);
}

.conversion-kicker,
.conversion-card-kicker,
.conversion-runtime-label {
  color: var(--text-muted);
  font-size: var(--ui-font-caption);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.conversion-title,
.conversion-card-title {
  color: var(--text-primary);
  margin: 0;
}

.conversion-title {
  font-size: 20px;
  line-height: 1.2;
  margin-top: var(--space-1);
}

.conversion-description {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  line-height: 1.5;
  max-width: 60ch;
}

.conversion-runtime-card,
.conversion-card {
  padding: var(--space-3);
}

.conversion-runtime-head,
.conversion-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.conversion-runtime-head {
  align-items: center;
}

.conversion-runtime-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
  background: var(--text-muted);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--surface-muted) 74%, transparent);
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

.conversion-runtime-value {
  margin-top: 2px;
  color: var(--text-primary);
  font-size: var(--ui-font-body);
  font-weight: 600;
}

.conversion-runtime-actions,
.conversion-card-actions,
.conversion-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.conversion-runtime-actions {
  margin-top: var(--space-3);
  gap: var(--space-1);
}

.conversion-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: var(--space-3);
  min-height: 0;
  flex: 1 1 auto;
  align-items: start;
}

.conversion-main,
.conversion-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
}

.conversion-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.conversion-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.conversion-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.conversion-field-span-2 {
  grid-column: span 2;
}

.conversion-label,
.conversion-inline-label,
.conversion-detail-label {
  color: var(--text-secondary);
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.conversion-field-hint,
.conversion-inline-copy,
.conversion-task-copy,
.conversion-empty-copy,
.conversion-detail-value {
  color: var(--text-muted);
  line-height: 1.5;
}

.conversion-toggle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.conversion-toggle-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  min-height: 72px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 92%, transparent);
}

.conversion-empty-inline {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px dashed color-mix(in srgb, var(--border-strong) 74%, transparent);
  background: color-mix(in srgb, var(--surface-muted) 66%, transparent);
}

.conversion-empty-title {
  color: var(--text-primary);
  font-weight: 600;
}

.conversion-empty-copy {
  margin-top: var(--space-2);
}

.conversion-target-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.conversion-target-card,
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
}

.conversion-target-card {
  padding: var(--space-2);
}

.conversion-target-card:hover:not(:disabled),
.conversion-task-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
  transform: translateY(-1px);
}

.conversion-target-card.is-active,
.conversion-task-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 46%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-base));
}

.conversion-target-card.is-disabled {
  cursor: default;
  opacity: 0.66;
  background: color-mix(in srgb, var(--surface-muted) 72%, transparent);
}

.conversion-target-title-row,
.conversion-task-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.conversion-target-title,
.conversion-task-title {
  color: var(--text-primary);
  font-weight: 600;
}

.conversion-target-copy {
  margin-top: var(--space-1);
  color: var(--text-secondary);
  line-height: 1.4;
  font-size: var(--ui-font-caption);
}

.conversion-target-pill,
.conversion-task-status {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.conversion-target-pill {
  background: var(--surface-muted);
  color: var(--text-secondary);
}

.conversion-target-pill.is-soon {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.conversion-task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  max-height: 320px;
  overflow: auto;
}

.conversion-task-card {
  padding: var(--space-2) var(--space-3);
}

.conversion-task-status.is-success {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.conversion-task-status.is-running {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.conversion-task-status.is-error {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, transparent);
}

.conversion-task-status.is-warning {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.conversion-task-status.is-muted {
  color: var(--text-muted);
  background: var(--surface-muted);
}

.conversion-task-copy,
.conversion-task-meta {
  margin-top: var(--space-2);
}

.conversion-task-meta {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
}

.conversion-detail-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.conversion-detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-subtle);
}

.conversion-detail-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.conversion-inline-error {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--error) 22%, transparent);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  line-height: 1.5;
}

@media (max-width: 1180px) {
  .conversion-hero,
  .conversion-layout {
    grid-template-columns: 1fr;
  }

  .conversion-target-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .conversion-shell {
    padding: var(--space-2);
  }

  .conversion-form-grid,
  .conversion-target-grid,
  .conversion-toggle-grid {
    grid-template-columns: 1fr;
  }

  .conversion-field-span-2 {
    grid-column: span 1;
  }
}
</style>
