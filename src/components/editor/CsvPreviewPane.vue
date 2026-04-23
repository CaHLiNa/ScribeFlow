<template>
  <div class="csv-preview-root">
    <div class="csv-preview-toolbar">
      <div class="csv-preview-meta">
        <span class="csv-preview-label">{{ t('CSV preview') }}</span>
        <span class="csv-preview-name">{{ fileName }}</span>
      </div>
      <div v-if="!loadError" class="csv-preview-stats">
        <span>{{ t('Rows') }} {{ rows.length }}</span>
        <span>{{ t('Columns') }} {{ columnCount }}</span>
      </div>
    </div>

    <div v-if="loadError" class="csv-preview-empty">
      <div>{{ loadError.message }}</div>
      <div v-if="loadError.detail" class="csv-preview-empty-detail">{{ loadError.detail }}</div>
    </div>
    <div v-else-if="rows.length === 0" class="csv-preview-empty">
      <div>{{ t('This file is empty.') }}</div>
    </div>
    <div v-else class="csv-preview-table-wrap">
      <table class="csv-preview-table">
        <thead>
          <tr>
            <th v-for="(cell, index) in headerRow" :key="`header:${index}`">{{ cell || `#${index + 1}` }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in bodyRows" :key="`row:${rowIndex}`">
            <td v-for="(cell, cellIndex) in row" :key="`row:${rowIndex}:cell:${cellIndex}`">
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useFilesStore } from '../../stores/files'
import { basenamePath } from '../../utils/path'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
})

const filesStore = useFilesStore()
const { t } = useI18n()
const rows = ref([])

const fileName = computed(() => basenamePath(props.filePath) || props.filePath)
const loadError = computed(() => filesStore.getFileLoadError(props.filePath))
const headerRow = computed(() => rows.value[0] || [])
const bodyRows = computed(() => rows.value.slice(1))
const columnCount = computed(() =>
  rows.value.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)
)

function parseDelimitedText(source = '', delimiter = ',') {
  const normalized = String(source || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parsedRows = []
  let currentRow = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"'
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell)
      parsedRows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += char
  }

  currentRow.push(currentCell)
  if (currentRow.length > 1 || currentRow[0] !== '') {
    parsedRows.push(currentRow)
  }

  const width = parsedRows.reduce((max, row) => Math.max(max, row.length), 0)
  return parsedRows.map((row) => {
    const nextRow = [...row]
    while (nextRow.length < width) nextRow.push('')
    return nextRow
  })
}

async function loadCsv() {
  let content = filesStore.fileContents[props.filePath]
  if (content === undefined) {
    content = await filesStore.readFile(props.filePath)
  }

  if (content == null) {
    rows.value = []
    return
  }

  const delimiter = props.filePath.toLowerCase().endsWith('.tsv') ? '\t' : ','
  rows.value = parseDelimitedText(content, delimiter)
}

onMounted(() => {
  void loadCsv()
})

watch(() => props.filePath, () => {
  void loadCsv()
})
</script>

<style scoped>
.csv-preview-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary);
}

.csv-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.csv-preview-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.csv-preview-label {
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.csv-preview-name {
  min-width: 0;
  overflow: hidden;
  color: var(--fg-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.csv-preview-stats {
  display: inline-flex;
  gap: 12px;
  color: var(--fg-muted);
  font-size: 12px;
  white-space: nowrap;
}

.csv-preview-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.csv-preview-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
}

.csv-preview-table th,
.csv-preview-table td {
  min-width: 120px;
  max-width: 480px;
  padding: 9px 12px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  color: var(--fg-secondary);
  font-size: 13px;
  line-height: 1.45;
  vertical-align: top;
  word-break: break-word;
}

.csv-preview-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-secondary);
  color: var(--fg-primary);
  font-weight: 600;
  text-align: left;
}

.csv-preview-empty {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--fg-secondary);
  text-align: center;
}

.csv-preview-empty-detail {
  margin-top: 8px;
  color: var(--fg-muted);
  font-size: 12px;
}
</style>
