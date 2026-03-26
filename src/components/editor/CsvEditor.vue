<template>
  <div class="csv-editor h-full flex flex-col overflow-hidden">
    <!-- Toolbar -->
    <div class="csv-editor-toolbar">
      <span class="csv-editor-meta">{{ dimensions }}</span>
      <span v-if="saving" class="csv-editor-meta csv-editor-saving">{{ t('Saving...') }}</span>
      <span v-if="error" class="csv-editor-error">{{ error }}</span>
    </div>

    <!-- Table -->
    <div ref="hotWrapper" class="flex-1 overflow-hidden relative">
      <div
        v-if="fileLoadError"
        class="csv-editor-state absolute inset-0 flex items-center justify-center px-6 text-sm"
      >
        <div class="max-w-lg text-center space-y-2">
          <div>{{ fileLoadError.message }}</div>
          <div v-if="fileLoadError.detail" class="text-xs">{{ fileLoadError.detail }}</div>
        </div>
      </div>
      <div v-else ref="hotContainer" class="absolute inset-0"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Handsontable from 'handsontable'
import 'handsontable/dist/handsontable.full.min.css'
import Papa from 'papaparse'
import { useFilesStore } from '../../stores/files'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const files = useFilesStore()
const { t } = useI18n()
const hotWrapper = ref(null)
const hotContainer = ref(null)
const dimensions = ref('')
const saving = ref(false)
const error = ref(null)
const fileLoadError = computed(() => files.getFileLoadError(props.filePath))

let hot = null
let saveTimeout = null
let resizeObserver = null
const isTsv = props.filePath.toLowerCase().endsWith('.tsv')

function updateDimensions() {
  if (!hot) return
  const rows = hot.countRows()
  const cols = hot.countCols()
  dimensions.value = `${rows} × ${cols}`
}

function scheduleSave() {
  clearTimeout(saveTimeout)
  saving.value = false
  saveTimeout = setTimeout(async () => {
    if (!hot) return
    saving.value = true
    try {
      const data = hot.getData()
      const text = Papa.unparse(data, { delimiter: isTsv ? '\t' : ',' })
      await files.saveFile(props.filePath, text)
    } catch (e) {
      error.value = e.toString()
    }
    saving.value = false
  }, 1000)
}

onMounted(async () => {
  if (!hotContainer.value) return

  try {
    let content = files.fileContents[props.filePath]
    if (content === undefined) {
      content = await files.readFile(props.filePath)
    }
    if (content === null && fileLoadError.value) {
      return
    }
    if (content === null) content = ''

    const parsed = Papa.parse(content, {
      header: false,
      delimiter: isTsv ? '\t' : undefined,
    })

    const data = parsed.data
    if (data.length === 0) data.push([''])

    // Wait for layout to settle so container has real dimensions
    await nextTick()

    const rect = hotWrapper.value?.getBoundingClientRect()

    hot = new Handsontable(hotContainer.value, {
      data,
      colHeaders: true,
      rowHeaders: true,
      contextMenu: true,
      manualColumnResize: true,
      manualRowResize: true,
      stretchH: 'all',
      width: rect ? rect.width : '100%',
      height: rect ? rect.height : '100%',
      autoColumnSize: true,
      undo: true,
      licenseKey: 'non-commercial-and-evaluation',
      afterChange(changes, source) {
        if (source === 'loadData') return
        updateDimensions()
        scheduleSave()
      },
      afterCreateRow: () => {
        updateDimensions()
        scheduleSave()
      },
      afterRemoveRow: () => {
        updateDimensions()
        scheduleSave()
      },
      afterCreateCol: () => {
        updateDimensions()
        scheduleSave()
      },
      afterRemoveCol: () => {
        updateDimensions()
        scheduleSave()
      },
    })

    updateDimensions()

    // Resize Handsontable when container resizes (e.g. sidebar toggle, pane resize)
    resizeObserver = new ResizeObserver(() => {
      if (!hot || !hotWrapper.value) return
      const r = hotWrapper.value.getBoundingClientRect()
      hot.updateSettings({ width: r.width, height: r.height })
    })
    resizeObserver.observe(hotWrapper.value)
  } catch (e) {
    error.value = e.toString()
  }
})

onUnmounted(() => {
  clearTimeout(saveTimeout)
  resizeObserver?.disconnect()
  if (hot) {
    hot.destroy()
    hot = null
  }
})
</script>

<style scoped>
.csv-editor-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--fg-secondary);
}

.csv-editor-meta {
  color: var(--text-muted);
  font-size: var(--ui-font-caption);
  font-variant-numeric: tabular-nums;
}

.csv-editor-saving {
  margin-left: var(--space-2);
}

.csv-editor-error {
  margin-left: auto;
  color: var(--error);
  font-size: var(--ui-font-caption);
}

.csv-editor-state {
  color: var(--text-muted);
  background: var(--bg-primary);
}
</style>
