<template>
  <div class="notebook-editor h-full flex flex-col overflow-hidden">
    <!-- Toolbar -->
    <div class="notebook-toolbar flex items-center gap-2 px-3 py-1.5 border-b shrink-0"
      style="background: var(--bg-secondary); border-color: var(--border);">

      <!-- Status chip (replaces kernel dropdown) -->
      <button
        ref="statusChipRef"
        class="nb-status-chip"
        :class="statusChipClass"
        @click="toggleStatusPopover"
      >
        <span class="nb-status-dot" :class="statusDotClass"></span>
        {{ statusChipLabel }}
        <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" style="margin-left: 2px; opacity: 0.6;">
          <path d="M2 3.5l3 3 3-3z"/>
        </svg>
      </button>

      <!-- Kernel status (when Jupyter mode and kernel active) -->
      <span v-if="mode === 'jupyter' && kernelId" class="ui-text-micro px-1.5 py-0.5 rounded font-medium"
        :style="kernelStatusStyle">
        {{ kernelStatusLabel }}
      </span>

      <div class="flex items-center gap-1 ml-1">
        <button class="nb-toolbar-btn" @click="runAllCells" :disabled="mode === 'none'" :title="t('Run all cells')">
          <svg width="10" height="10" viewBox="0 0 20 16" fill="currentColor"><polygon points="2,2 10,8 2,14"/><polygon points="10,2 18,8 10,14"/></svg>
          {{ t('Run All') }}
        </button>
        <button v-if="mode === 'jupyter'" class="nb-toolbar-btn" @click="restartKernel" :disabled="!kernelId" :title="t('Restart kernel')">
          {{ t('Restart') }}
        </button>
        <button class="nb-toolbar-btn" @click="clearAllOutputs" :title="t('Clear all outputs')">
          {{ t('Clear') }}
        </button>
        <button class="nb-toolbar-btn" @click="handleAskAi" :title="t('Ask AI about this notebook')">
          <IconSparkles :size="12" :stroke-width="1.9" />
          {{ t('Ask AI') }}
        </button>
      </div>

      <span class="ml-auto ui-text-micro" style="color: var(--fg-muted);">
        {{ t('{count} cells', { count: cells.length }) }}
        <template v-if="saving"> &middot; {{ t('Saving...') }}</template>
      </span>
    </div>

    <!-- Status popover (Teleported to body to avoid overflow-hidden clipping) -->
    <Teleport to="body">
      <div v-if="showStatusPopover" class="fixed inset-0 z-[9999]" @click="showStatusPopover = false">
        <div
          class="nb-status-popover"
          :style="{ left: popoverX + 'px', top: popoverY + 'px' }"
          @click.stop
        >
          <!-- Current language info -->
          <div class="nb-pop-section">
            <div class="nb-pop-label">{{ t('Notebook Language') }}</div>
            <div class="nb-pop-value">{{ langDisplayName }}</div>
          </div>

          <!-- Status details -->
          <div class="nb-pop-section">
            <div class="nb-pop-label">{{ t('Status') }}</div>
            <div v-if="mode === 'jupyter'" class="nb-pop-status nb-pop-status-good">
              <span class="nb-pop-dot good"></span>
              {{ t('Jupyter kernel ready') }}
            </div>
            <div v-else class="nb-pop-status nb-pop-status-none">
              <span class="nb-pop-dot none"></span>
              {{ t('No Jupyter kernel') }}
              <div class="nb-pop-hint">{{ envStore.installHint(notebookLanguage) }}</div>
            </div>
          </div>

          <!-- Jupyter info -->
          <div v-if="envStore.jupyter.found" class="nb-pop-section">
            <div class="nb-pop-label">{{ t('Jupyter') }}</div>
            <div class="nb-pop-value" style="font-size: var(--ui-font-micro); font-family: var(--font-mono); color: var(--fg-muted);">
              {{ envStore.jupyter.path }}
            </div>
          </div>

          <div class="nb-pop-section">
            <div class="nb-pop-label">{{ t('Environment Health') }}</div>
            <div v-if="environmentHealthLoading" class="nb-health-empty">{{ t('Checking environment health...') }}</div>
            <div v-else class="nb-health-list">
              <div v-for="entry in environmentHealth" :key="entry.id" class="nb-health-row">
                <div class="nb-health-main">
                  <span class="nb-health-dot" :class="healthStatusClass(entry.status)"></span>
                  <span>{{ entry.label }}</span>
                </div>
                <div class="nb-health-detail">{{ entry.detail }}</div>
              </div>
            </div>
          </div>

          <!-- Kernel picker (jupyter mode) -->
          <div v-if="mode === 'jupyter'" class="nb-pop-section">
            <div class="nb-pop-label">{{ t('Kernel') }}</div>
            <select
              v-model="selectedSpec"
              class="nb-pop-select"
            >
              <option v-for="k in kernelspecs" :key="k.name" :value="k.name">
                {{ k.display_name }}
              </option>
            </select>
          </div>

          <!-- Re-detect link -->
          <div class="nb-pop-footer">
            <button class="nb-pop-link" @click="redetect" :disabled="envStore.detecting">
              {{ envStore.detecting ? t('Detecting...') : t('Re-detect languages') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Setup prompt (when no kernel available) -->
    <div v-if="mode === 'none' && envStore.detected" class="nb-setup-prompt">
      <div class="nb-setup-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          <path d="M7 8l3 3-3 3" opacity="0.7"/><line x1="13" y1="14" x2="17" y2="14" opacity="0.7"/>
        </svg>
      </div>
      <div class="nb-setup-title">{{ t('Set up {language} for notebooks', { language: langDisplayName }) }}</div>
      <div class="nb-setup-desc">
        {{ t('Running notebook cells requires a Jupyter kernel.') }}
        {{ envStore.jupyter.found ? '' : t('Jupyter was not found on your system.') }}
      </div>

      <div class="nb-setup-steps">
        <div v-if="!envStore.jupyter.found" class="nb-setup-step">
          <span class="nb-setup-step-num">1</span>
          <div>
            <div class="nb-setup-step-title">{{ t('Install Jupyter') }}</div>
            <code class="nb-setup-code">pip3 install jupyter</code>
          </div>
        </div>
        <div class="nb-setup-step">
          <span class="nb-setup-step-num">{{ envStore.jupyter.found ? '1' : '2' }}</span>
          <div>
            <div class="nb-setup-step-title">{{ t('Install the {language} kernel', { language: langDisplayName }) }}</div>
            <code class="nb-setup-code">{{ envStore.installCommand(notebookLanguage) }}</code>
          </div>
        </div>
      </div>

      <div class="nb-setup-actions">
        <button
          class="nb-setup-install-btn"
          :disabled="envStore.installing === notebookLanguage"
          @click="handleInstallKernel"
        >
          {{ envStore.installing === notebookLanguage ? t('Installing...') : t('Install {package} now', { package: kernelPackageName }) }}
        </button>
        <button class="nb-setup-redetect" @click="redetect" :disabled="envStore.detecting">
          {{ envStore.detecting ? t('Checking...') : t('Re-check') }}
        </button>
      </div>

      <div v-if="envStore.installError" class="nb-setup-error">{{ envStore.installError }}</div>
      <div v-if="envStore.installOutput && envStore.installing === notebookLanguage" class="nb-setup-output">
        <pre>{{ envStore.installOutput.slice(-500) }}</pre>
      </div>
    </div>

    <!-- Cell list -->
    <div class="flex-1 overflow-y-auto" ref="cellsContainer">
      <div class="max-w-[900px] mx-auto pt-4 pb-40 px-4">
        <NotebookCell
          v-for="(cell, idx) in displayCells"
          :key="cell.id"
          :ref="el => setCellRef(idx, el)"
          :cell="cell"
          :index="idx"
          :active="activeCell === idx"
          :running="runningCells.has(cell.id)"
          :language="notebookLanguage"
          :pendingEdit="cell._pendingEdit"
          :pendingDelete="cell._pendingDelete"
          :pendingAdd="cell._pendingAdd"
          :editId="cell._editId"
          :result-status="cell._resultState.status"
          :result-status-text="cell._resultState.statusText"
          :result-tone="cell._resultState.tone"
          :result-hint="cell._resultState.hint"
          :can-insert-result="cell._resultState.canInsert"
          :result-producer-label="cell._resultState.producerLabel"
          :result-generated-at-label="cell._resultState.generatedAtLabel"
          @focus="activeCell = idx"
          @run="runCell(idx)"
          @delete="deleteCell(idx)"
          @move-up="moveCell(idx, -1)"
          @move-down="moveCell(idx, 1)"
          @toggle-type="toggleCellType(idx)"
          @add-above="addCell(idx, 'code')"
          @add-below="addCell(idx + 1, 'code')"
          @content-change="(src) => updateCellSource(idx, src)"
          @accept-edit="acceptPendingEdit"
          @reject-edit="rejectPendingEdit"
          @insert-result="insertCellResult(cell.id)"
        />

        <!-- Add cell button -->
        <div class="flex gap-2 justify-center mt-3">
          <button class="nb-add-cell-btn" @click="addCell(cells.length, 'code')">{{ t('+ Code') }}</button>
          <button class="nb-add-cell-btn" @click="addCell(cells.length, 'markdown')">{{ t('+ Markdown') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { IconSparkles } from '@tabler/icons-vue'
import NotebookCell from './NotebookCell.vue'
import { useNotebookEditor } from '../../composables/useNotebookEditor'
import { useI18n } from '../../i18n'
import { useChatStore } from '../../stores/chat'
import { useEditorStore } from '../../stores/editor'
import { launchAiTask } from '../../services/ai/launch'
import { createNotebookAssistantTask } from '../../services/ai/taskCatalog'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const { t } = useI18n()
const editorStore = useEditorStore()
const chatStore = useChatStore()
const {
  cells,
  activeCell,
  saving,
  kernelId,
  selectedSpec,
  runningCells,
  showStatusPopover,
  statusChipRef,
  popoverX,
  popoverY,
  envStore,
  environmentHealth,
  environmentHealthLoading,
  displayCells,
  kernelspecs,
  notebookLanguage,
  langDisplayName,
  mode,
  kernelPackageName,
  statusChipLabel,
  statusChipClass,
  statusDotClass,
  kernelStatusLabel,
  kernelStatusStyle,
  setCellRef,
  toggleStatusPopover,
  handleInstallKernel,
  redetect,
  addCell,
  deleteCell,
  moveCell,
  toggleCellType,
  updateCellSource,
  clearAllOutputs,
  runCell,
  runAllCells,
  restartKernel,
  acceptPendingEdit,
  rejectPendingEdit,
  insertCellResult,
} = useNotebookEditor(props)

async function handleAskAi() {
  if (!props.filePath) return
  await launchAiTask({
    editorStore,
    chatStore,
    paneId: props.paneId,
    beside: true,
    task: createNotebookAssistantTask({
      filePath: props.filePath,
      source: 'notebook-toolbar',
      entryContext: 'notebook-toolbar',
    }),
  })
}

function healthStatusClass(status) {
  if (status === 'available') return 'good'
  if (status === 'version-issue') return 'warn'
  return 'bad'
}
</script>

<style scoped>
.notebook-toolbar {
  font-size: var(--ui-font-label);
}

/* Status chip */
.nb-status-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--fg-secondary);
  font-size: var(--ui-font-caption);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.nb-status-chip:hover {
  border-color: var(--fg-muted);
}

.nb-chip-jupyter {
  border-color: rgba(80, 250, 123, 0.3);
}

.nb-chip-none {
  border-color: rgba(247, 118, 142, 0.3);
}

.nb-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.nb-status-dot.good { background: var(--success, #50fa7b); }
.nb-status-dot.none { background: var(--fg-muted); opacity: 0.5; }

/* Status popover */
.nb-status-popover {
  position: fixed;
  z-index: 10000;
  width: 300px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 12px;
}

.nb-pop-section {
  margin-bottom: 12px;
}

.nb-pop-section:last-child {
  margin-bottom: 0;
}

.nb-pop-label {
  font-size: var(--ui-font-micro);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--fg-muted);
  margin-bottom: 4px;
}

.nb-pop-value {
  font-size: var(--ui-font-label);
  color: var(--fg-primary);
  font-weight: 500;
}

.nb-pop-status {
  font-size: var(--ui-font-caption);
  padding: 6px 8px;
  border-radius: 5px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
}

.nb-pop-status-good {
  background: rgba(80, 250, 123, 0.06);
  color: var(--success, #50fa7b);
}

.nb-pop-status-none {
  background: rgba(247, 118, 142, 0.06);
  color: var(--error, #f7768e);
}

.nb-pop-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.nb-pop-dot.good { background: var(--success, #50fa7b); }
.nb-pop-dot.none { background: var(--fg-muted); }

.nb-pop-hint {
  width: 100%;
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  margin-top: 4px;
  line-height: 1.4;
}

.nb-pop-select {
  width: 100%;
  padding: 4px 8px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  outline: none;
}

.nb-pop-install-btn {
  padding: 5px 12px;
  border-radius: 5px;
  border: 1px solid var(--accent);
  background: rgba(122, 162, 247, 0.1);
  color: var(--accent);
  font-size: var(--ui-font-caption);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.nb-pop-install-btn:hover {
  background: rgba(122, 162, 247, 0.2);
}

.nb-pop-install-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.nb-pop-error {
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(247, 118, 142, 0.1);
  color: var(--error);
  font-size: var(--ui-font-micro);
}

.nb-pop-footer {
  border-top: 1px solid var(--border);
  margin-top: 8px;
  padding-top: 8px;
}

.nb-pop-link {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.1s;
}

.nb-pop-link:hover {
  color: var(--accent);
}

.nb-pop-link:disabled {
  opacity: 0.5;
  cursor: wait;
}

.nb-health-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nb-health-row {
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
}

.nb-health-main {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ui-font-caption);
  color: var(--fg-primary);
}

.nb-health-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex-shrink: 0;
}

.nb-health-dot.good { background: var(--success, #50fa7b); }
.nb-health-dot.warn { background: var(--warning, #e2b93d); }
.nb-health-dot.bad { background: var(--error, #f7768e); }

.nb-health-detail {
  margin-top: 4px;
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  word-break: break-word;
}

.nb-health-empty {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

/* Setup prompt */
.nb-setup-prompt {
  max-width: 480px;
  margin: 60px auto 0;
  padding: 32px;
  text-align: center;
}

.nb-setup-icon {
  color: var(--fg-muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.nb-setup-title {
  font-size: var(--ui-font-display-sm);
  font-weight: 600;
  color: var(--fg-primary);
  margin-bottom: 8px;
}

.nb-setup-desc {
  font-size: var(--ui-font-label);
  color: var(--fg-muted);
  margin-bottom: 24px;
  line-height: 1.5;
}

.nb-setup-steps {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.nb-setup-step {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.nb-setup-step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-tertiary, var(--bg-secondary));
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nb-setup-step-title {
  font-size: var(--ui-font-label);
  font-weight: 500;
  color: var(--fg-primary);
  margin-bottom: 4px;
}

.nb-setup-code {
  display: block;
  font-size: var(--ui-font-caption);
  font-family: var(--font-mono);
  color: var(--accent);
  background: var(--bg-primary);
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  user-select: all;
}

.nb-setup-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.nb-setup-install-btn {
  padding: 7px 20px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: rgba(122, 162, 247, 0.1);
  color: var(--accent);
  font-size: var(--ui-font-label);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.nb-setup-install-btn:hover {
  background: rgba(122, 162, 247, 0.2);
}

.nb-setup-install-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.nb-setup-redetect {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-muted);
  font-size: var(--ui-font-label);
  cursor: pointer;
  transition: all 0.15s;
}

.nb-setup-redetect:hover {
  border-color: var(--fg-muted);
  color: var(--fg-primary);
}

.nb-setup-redetect:disabled {
  opacity: 0.5;
  cursor: wait;
}

.nb-setup-error {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 5px;
  background: rgba(247, 118, 142, 0.1);
  color: var(--error);
  font-size: var(--ui-font-caption);
  text-align: left;
}

.nb-setup-output {
  margin-top: 8px;
  text-align: left;
}

.nb-setup-output pre {
  font-size: var(--ui-font-micro);
  font-family: var(--font-mono);
  color: var(--fg-muted);
  background: var(--bg-primary);
  padding: 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Toolbar buttons */
.nb-toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: none;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  border-radius: 4px;
  font-size: var(--ui-font-caption);
  transition: background 0.1s, color 0.1s;
}

.nb-toolbar-btn:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.nb-toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.nb-add-cell-btn {
  padding: 4px 16px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  border-radius: 4px;
  font-size: var(--ui-font-caption);
  transition: border-color 0.15s, color 0.15s;
}

.nb-add-cell-btn:hover {
  border-color: var(--accent);
  color: var(--fg-primary);
}
</style>
