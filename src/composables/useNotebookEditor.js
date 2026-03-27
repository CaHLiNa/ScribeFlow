import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useEnvironmentStore } from '../stores/environment'
import { useEditorStore } from '../stores/editor'
import { useFilesStore } from '../stores/files'
import { useKernelStore } from '../stores/kernel'
import { useReviewsStore } from '../stores/reviews'
import { useToastStore } from '../stores/toast'
import { formatDate as formatLocaleDate, useI18n } from '../i18n'
import {
  normalizeNotebookOutput,
  summarizeNotebookCellOutputs,
  buildNotebookRunAllSummary,
} from '../editor/notebookOutputs'
import {
  readNotebookDocument,
  writeNotebookDocument,
  writeNotebookDocumentPreservingPendingEdits,
} from '../services/notebookDocument'
import {
  buildNotebookCellProvenance,
  buildSourceSignature,
  classifyExecutionFailure,
  getResultStatusLabelKey,
  getResultStatusTone,
  registerLiveProvenance,
} from '../services/resultProvenance'
import { formatFileError } from '../utils/errorMessages'
import { generateCellId, getNotebookLanguage, parseNotebook } from '../utils/notebookFormat'

export function useNotebookEditor(props) {
  const editorStore = useEditorStore()
  const filesStore = useFilesStore()
  const kernelStore = useKernelStore()
  const reviews = useReviewsStore()
  const envStore = useEnvironmentStore()
  const toastStore = useToastStore()
  const { t } = useI18n()

  const cells = reactive([])
  const metadata = ref({})
  const nbformat = ref(4)
  const nbformatMinor = ref(5)
  const activeCell = ref(0)
  const saving = ref(false)
  const kernelId = ref(null)
  const selectedSpec = ref('')
  const runningCells = reactive(new Set())

  const showStatusPopover = ref(false)
  const statusChipRef = ref(null)
  const popoverX = ref(0)
  const popoverY = ref(0)
  const environmentHealth = ref([])
  const environmentHealthLoading = ref(false)

  const cellRefs = {}
  let saveTimer = null
  let executionCounter = 0

  const pendingNotebookEdits = computed(() => reviews.notebookEditsForFile(props.filePath))

  async function loadEnvironmentHealthSummary() {
    const { getEnvironmentHealthSummary } = await import('../services/environmentPreflight.js')
    return getEnvironmentHealthSummary()
  }

  function ensureExecutionMeta(cell) {
    if (!cell.metadata || typeof cell.metadata !== 'object') {
      cell.metadata = {}
    }
    if (!cell.metadata.altalsExecution || typeof cell.metadata.altalsExecution !== 'object') {
      cell.metadata.altalsExecution = {}
    }
    return cell.metadata.altalsExecution
  }

  function buildCellProvenance(cell, index, statusOverride = null) {
    const meta = ensureExecutionMeta(cell)
    return buildNotebookCellProvenance({
      filePath: props.filePath,
      cellId: cell.id,
      cellIndex: index,
      source: cell.source,
      outputs: cell.outputs,
      status: statusOverride || meta.status || 'idle',
      generatedAt: meta.generatedAt || new Date().toISOString(),
      executionCount: cell.executionCount,
      errorHint: meta.hintKey ? t(meta.hintKey) : '',
    })
  }

  function syncCellProvenance(cell, index, statusOverride = null) {
    if (cell.type !== 'code') return null
    const meta = ensureExecutionMeta(cell)
    const hasResult =
      Boolean(meta.lastRunSourceSignature) ||
      Boolean(cell.executionCount != null) ||
      (cell.outputs || []).length > 0
    if (!hasResult && (statusOverride || meta.status) !== 'running') return null
    return registerLiveProvenance(buildCellProvenance(cell, index, statusOverride))
  }

  function clearExecutionState(cell, index) {
    const meta = ensureExecutionMeta(cell)
    meta.status = 'idle'
    meta.generatedAt = ''
    meta.lastRunSourceSignature = ''
    meta.hintKey = ''
    syncCellProvenance(cell, index, 'idle')
  }

  function staleHintKeyForCell(cell, index) {
    const meta = ensureExecutionMeta(cell)
    const currentSignature = buildSourceSignature(cell.source)
    if (meta.lastRunSourceSignature && meta.lastRunSourceSignature !== currentSignature) {
      return 'This result is stale. Rerun the source to refresh it.'
    }
    if (
      cells.slice(0, index).some((candidate) => {
        if (candidate.type !== 'code') return false
        const candidateMeta = ensureExecutionMeta(candidate)
        return (
          candidateMeta.lastRunSourceSignature &&
          candidateMeta.lastRunSourceSignature !== buildSourceSignature(candidate.source)
        )
      })
    ) {
      return 'This result is stale because an upstream cell changed.'
    }
    return meta.hintKey || ''
  }

  function reconcileExecutionStates() {
    let upstreamChanged = false

    cells.forEach((cell, index) => {
      if (cell.type !== 'code') return

      const meta = ensureExecutionMeta(cell)
      const currentSignature = buildSourceSignature(cell.source)
      const hasRun =
        Boolean(meta.lastRunSourceSignature) ||
        Boolean(cell.executionCount != null) ||
        (cell.outputs || []).length > 0

      if (!hasRun) {
        meta.status = 'idle'
        meta.hintKey = ''
        return
      }

      if (meta.lastRunSourceSignature && meta.lastRunSourceSignature !== currentSignature) {
        meta.status = 'stale'
        meta.hintKey = 'This result is stale. Rerun the source to refresh it.'
        upstreamChanged = true
      } else if (upstreamChanged && meta.status !== 'error') {
        meta.status = 'stale'
        meta.hintKey = 'This result is stale because an upstream cell changed.'
      } else if (meta.status !== 'error') {
        meta.status = 'fresh'
        meta.hintKey = ''
      }

      syncCellProvenance(cell, index, meta.status)
    })
  }

  function cellResultState(cell, index) {
    if (cell.type !== 'code') {
      return {
        status: 'idle',
        statusText: t(getResultStatusLabelKey('idle')),
        tone: getResultStatusTone('idle'),
        hint: '',
        canInsert: false,
        producerLabel: '',
        generatedAtLabel: '',
      }
    }

    const meta = ensureExecutionMeta(cell)
    const status = runningCells.has(cell.id) ? 'running' : meta.status || 'idle'
    return {
      status,
      statusText: t(getResultStatusLabelKey(status)),
      tone: getResultStatusTone(status),
      hint: runningCells.has(cell.id)
        ? ''
        : staleHintKeyForCell(cell, index)
          ? t(staleHintKeyForCell(cell, index))
          : '',
      canInsert:
        !runningCells.has(cell.id) && status !== 'error' && (cell.outputs || []).length > 0,
      producerLabel: t('Cell {index}', { index: index + 1 }),
      generatedAtLabel: meta.generatedAt
        ? formatLocaleDate(meta.generatedAt, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
    }
  }

  const displayCells = computed(() => {
    const edits = pendingNotebookEdits.value
    if (edits.length === 0) {
      return cells.map((cell, index) => ({
        ...cell,
        _pendingEdit: null,
        _pendingDelete: false,
        _pendingAdd: false,
        _editId: null,
        _resultState: cellResultState(cell, index),
      }))
    }

    const result = []
    const editsByCell = {}
    const addEdits = []

    for (const edit of edits) {
      if (edit.tool === 'NotebookAddCell') {
        addEdits.push(edit)
      } else {
        editsByCell[edit.cell_id] = edit
      }
    }

    for (const [index, cell] of cells.entries()) {
      const edit = editsByCell[cell.id]
      result.push({
        ...cell,
        _pendingEdit: edit?.tool === 'NotebookEditCell' ? edit : null,
        _pendingDelete: edit?.tool === 'NotebookDeleteCell',
        _pendingAdd: false,
        _editId: edit?.id || null,
        _resultState: cellResultState(cell, index),
      })
    }

    const sortedAdds = [...addEdits].sort((a, b) => b.cell_index - a.cell_index)
    for (const add of sortedAdds) {
      const index = Math.min(add.cell_index, result.length)
      result.splice(index, 0, {
        id: add.cell_id,
        type: add.cell_type || 'code',
        source: add.cell_source || '',
        outputs: [],
        executionCount: null,
        metadata: {},
        _pendingEdit: null,
        _pendingDelete: false,
        _pendingAdd: true,
        _editId: add.id,
        _resultState: cellResultState(
          {
            type: add.cell_type || 'code',
            source: add.cell_source || '',
            outputs: [],
            executionCount: null,
            metadata: {},
          },
          index
        ),
      })
    }

    return result
  })

  const kernelspecs = computed(() => kernelStore.kernelspecs)
  const notebookLanguage = computed(() => getNotebookLanguage(metadata.value))

  const langDisplayName = computed(() => {
    const lang = notebookLanguage.value
    if (lang === 'r') return 'R'
    return lang.charAt(0).toUpperCase() + lang.slice(1)
  })

  const mode = computed(() => envStore.capability(notebookLanguage.value))

  const kernelPackageName = computed(() => {
    const packages = { python: 'ipykernel', r: 'IRkernel', julia: 'IJulia' }
    return packages[notebookLanguage.value] || 'kernel'
  })

  const statusChipLabel = computed(() => envStore.statusLabel(notebookLanguage.value))

  const statusChipClass = computed(() => ({
    'nb-chip-jupyter': mode.value === 'jupyter',
    'nb-chip-none': mode.value === 'none',
  }))

  const statusDotClass = computed(() => ({
    good: mode.value === 'jupyter',
    none: mode.value === 'none',
  }))

  const kernelStatusLabel = computed(() => {
    if (!kernelId.value) return t('No kernel')
    const kernel = kernelStore.kernels[kernelId.value]
    return kernel ? kernel.status : t('disconnected')
  })

  const kernelStatusToneClass = computed(() => {
    if (!kernelId.value) return 'nb-kernel-status-disconnected'
    const status = kernelStore.kernels[kernelId.value]?.status
    if (status === 'idle') return 'nb-kernel-status-idle'
    if (status === 'busy') return 'nb-kernel-status-busy'
    return 'nb-kernel-status-disconnected'
  })

  function applyNotebookState(notebook) {
    cells.splice(0, cells.length, ...notebook.cells)
    metadata.value = notebook.metadata
    nbformat.value = notebook.nbformat
    nbformatMinor.value = notebook.nbformat_minor
    reconcileExecutionStates()

    const specName = notebook.metadata?.kernelspec?.name
    if (specName && kernelspecs.value.find((kernel) => kernel.name === specName)) {
      selectedSpec.value = specName
    } else if (kernelspecs.value.length > 0) {
      selectedSpec.value = kernelspecs.value[0].name
    }
  }

  function setCellRef(index, element) {
    if (element) cellRefs[index] = element
    else delete cellRefs[index]
  }

  function toggleStatusPopover() {
    if (showStatusPopover.value) {
      showStatusPopover.value = false
      return
    }
    if (statusChipRef.value) {
      const rect = statusChipRef.value.getBoundingClientRect()
      popoverX.value = rect.left
      popoverY.value = rect.bottom + 4
    }
    showStatusPopover.value = true
  }

  async function handleInstallKernel() {
    const success = await envStore.installKernel(notebookLanguage.value)
    if (!success) return

    await kernelStore.discover()
    if (kernelspecs.value.length > 0 && !selectedSpec.value) {
      selectedSpec.value = kernelspecs.value[0].name
    }
  }

  async function redetect() {
    await envStore.detect()
    if (mode.value === 'jupyter') {
      await kernelStore.discover()
    }
    await refreshEnvironmentHealth()
  }

  async function loadNotebook() {
    const notebook = await readNotebookDocument(props.filePath, filesStore.fileContents)
    applyNotebookState(notebook)
  }

  async function refreshEnvironmentHealth() {
    environmentHealthLoading.value = true
    try {
      environmentHealth.value = await loadEnvironmentHealthSummary()
    } finally {
      environmentHealthLoading.value = false
    }
  }

  function syncCellRefsIntoState() {
    for (const [indexText, cellRef] of Object.entries(cellRefs)) {
      if (!cellRef?.syncContent) continue
      const index = Number.parseInt(indexText, 10)
      const displayCell = displayCells.value[index]
      if (
        displayCell &&
        !displayCell._pendingEdit &&
        !displayCell._pendingDelete &&
        !displayCell._pendingAdd
      ) {
        cellRef.syncContent()
      }
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveNotebook()
    }, 1500)
  }

  async function saveNotebook() {
    saving.value = true
    try {
      syncCellRefsIntoState()

      const notebookState = {
        cells,
        metadata: metadata.value,
        nbformat: nbformat.value,
        nbformatMinor: nbformatMinor.value,
      }

      if (pendingNotebookEdits.value.length === 0) {
        await writeNotebookDocument(props.filePath, notebookState, filesStore.fileContents)
      } else {
        await writeNotebookDocumentPreservingPendingEdits(
          props.filePath,
          notebookState,
          (filePath, cellId) => reviews.notebookEditForCell(filePath, cellId),
          filesStore.fileContents
        )
      }
    } catch (error) {
      console.error('Notebook save failed:', error)
      toastStore.showOnce(
        `save:${props.filePath}`,
        formatFileError('save', props.filePath, error),
        { type: 'error', duration: 5000 }
      )
    } finally {
      saving.value = false
    }
  }

  function addCell(index, type) {
    const newCell = {
      id: generateCellId(),
      type,
      source: '',
      outputs: [],
      executionCount: null,
      metadata: {},
    }
    cells.splice(index, 0, newCell)
    activeCell.value = index
    scheduleSave()
    nextTick(() => {
      if (cellRefs[index]?.focus) cellRefs[index].focus()
    })
  }

  function deleteCell(index) {
    if (cells.length <= 1) return
    cells.splice(index, 1)
    reconcileExecutionStates()
    if (activeCell.value >= cells.length) {
      activeCell.value = cells.length - 1
    }
    scheduleSave()
  }

  function moveCell(index, direction) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= cells.length) return
    const [cell] = cells.splice(index, 1)
    cells.splice(newIndex, 0, cell)
    activeCell.value = newIndex
    reconcileExecutionStates()
    scheduleSave()
  }

  function toggleCellType(index) {
    const cell = cells[index]
    cell.type = cell.type === 'code' ? 'markdown' : 'code'
    if (cell.type === 'markdown') {
      cell.outputs = []
      cell.executionCount = null
      clearExecutionState(cell, index)
    }
    reconcileExecutionStates()
    scheduleSave()
  }

  function updateCellSource(index, source) {
    cells[index].source = source
    reconcileExecutionStates()
    scheduleSave()
  }

  function clearAllOutputs() {
    for (const [index, cell] of cells.entries()) {
      if (cell.type !== 'code') continue
      cell.outputs = []
      cell.executionCount = null
      clearExecutionState(cell, index)
    }
    reconcileExecutionStates()
    scheduleSave()
  }

  function scrollToCell(cellIndex) {
    const cellRef = cellRefs[cellIndex]
    if (!cellRef?.$el) return

    cellRef.$el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    activeCell.value = cellIndex
    nextTick(() => cellRef.focus?.())
  }

  async function ensureKernel() {
    if (kernelId.value && kernelStore.kernels[kernelId.value]) {
      return kernelId.value
    }

    if (!selectedSpec.value) {
      if (kernelspecs.value.length === 0) {
        await kernelStore.discover()
      }
      if (kernelspecs.value.length === 0) {
        throw new Error(t('No Jupyter kernels available'))
      }
      selectedSpec.value = kernelspecs.value[0].name
    }

    kernelId.value = await kernelStore.launch(selectedSpec.value)
    return kernelId.value
  }

  async function restartKernel() {
    if (kernelId.value) {
      await kernelStore.shutdown(kernelId.value)
      kernelId.value = null
    }

    for (const [index, cell] of cells.entries()) {
      if (cell.type !== 'code') continue
      cell.executionCount = null
      if ((cell.outputs || []).length > 0) {
        ensureExecutionMeta(cell).status = 'stale'
        ensureExecutionMeta(cell).hintKey = 'This result is stale. Rerun the source to refresh it.'
        syncCellProvenance(cell, index, 'stale')
      }
    }

    reconcileExecutionStates()
    await ensureKernel()
  }

  async function runCell(index) {
    const cell = cells[index]
    if (cell.type !== 'code' || !cell.source.trim()) return null

    if (mode.value !== 'jupyter') {
      const meta = ensureExecutionMeta(cell)
      cell.outputs = [
        {
          output_type: 'error',
          ename: t('No Kernel'),
          evalue: t('Set up a Jupyter kernel to run cells. Click the status chip in the toolbar.'),
          traceback: [],
        },
      ]
      meta.status = 'error'
      meta.generatedAt = new Date().toISOString()
      meta.hintKey =
        'No usable Jupyter kernel is available yet. Install the matching kernel and re-detect the environment.'
      syncCellProvenance(cell, index, 'error')
      return { outputs: cell.outputs, success: false }
    }

    try {
      const currentKernelId = await ensureKernel()
      runningCells.add(cell.id)
      cell.outputs = []
      syncCellProvenance(cell, index, 'running')

      const result = await kernelStore.execute(currentKernelId, cell.source)
      const normalizedOutputs = result.outputs.map(normalizeNotebookOutput)
      executionCounter += 1
      cell.executionCount = executionCounter
      cell.outputs = normalizedOutputs

      const meta = ensureExecutionMeta(cell)
      const failure =
        result.success === false
          ? classifyExecutionFailure(
              normalizedOutputs
                .filter((output) => output.output_type === 'error')
                .map((output) => `${output.ename}: ${output.evalue}`)
                .join('\n'),
              normalizedOutputs
            )
          : null

      meta.generatedAt = new Date().toISOString()
      meta.lastRunSourceSignature = buildSourceSignature(cell.source)
      meta.status = result.success === false ? 'error' : 'fresh'
      meta.hintKey = failure?.hintKey || ''
      syncCellProvenance(cell, index, meta.status)

      reconcileExecutionStates()
      scheduleSave()
      return { outputs: cell.outputs, success: result.success }
    } catch (error) {
      const message = error?.message || String(error)
      const meta = ensureExecutionMeta(cell)
      cell.outputs = [
        {
          output_type: 'error',
          ename: t('ExecutionError'),
          evalue: message,
          traceback: [message],
        },
      ]
      const failure = classifyExecutionFailure(message, cell.outputs)
      meta.generatedAt = new Date().toISOString()
      meta.lastRunSourceSignature = buildSourceSignature(cell.source)
      meta.status = 'error'
      meta.hintKey = failure?.hintKey || ''
      syncCellProvenance(cell, index, 'error')
      return { outputs: cell.outputs, success: false }
    } finally {
      runningCells.delete(cell.id)
    }
  }

  async function runAllCells() {
    for (let index = 0; index < cells.length; index += 1) {
      if (cells[index].type !== 'code') continue
      const result = await runCell(index)
      if (result && result.success === false) break
    }
  }

  function onNotebookScrollToCell(event) {
    const { path, cellId } = event.detail || {}
    if (path !== props.filePath) return

    const index = cells.findIndex((cell) => cell.id === cellId)
    if (index >= 0) scrollToCell(index)
  }

  function onRunNotebookCell(event) {
    const { path, index } = event.detail || {}
    if (path !== props.filePath) return

    runCell(index).then((result) => {
      window.dispatchEvent(
        new CustomEvent('cell-execution-complete', {
          detail: {
            path,
            index,
            output: summarizeNotebookCellOutputs(result?.outputs || [], t),
            success: result?.success !== false,
            error:
              result?.success === false
                ? summarizeNotebookCellOutputs(result?.outputs || [], t)
                : null,
          },
        })
      )
    })
  }

  function onRunAllNotebookCells(event) {
    const { path } = event.detail || {}
    if (path !== props.filePath) return

    runAllCells().then(() => {
      window.dispatchEvent(
        new CustomEvent('all-cells-execution-complete', {
          detail: {
            path,
            summary: buildNotebookRunAllSummary(cells, t),
          },
        })
      )
    })
  }

  function onNotebookPendingEdit(event) {
    const { file_path: filePath } = event.detail || {}
    if (filePath !== props.filePath) return
  }

  function onNotebookReviewResolved(event) {
    const { file_path: filePath } = event.detail || {}
    if (filePath !== props.filePath) return
    loadNotebook()
  }

  async function initialize() {
    if (!envStore.detected) {
      await envStore.detect()
    }

    if (mode.value === 'jupyter') {
      await kernelStore.discover()
    }

    await loadNotebook()
    await refreshEnvironmentHealth()

    window.addEventListener('run-notebook-cell', onRunNotebookCell)
    window.addEventListener('run-all-notebook-cells', onRunAllNotebookCells)
    window.addEventListener('notebook-scroll-to-cell', onNotebookScrollToCell)
    window.addEventListener('notebook-pending-edit', onNotebookPendingEdit)
    window.addEventListener('notebook-review-resolved', onNotebookReviewResolved)
  }

  async function dispose() {
    window.removeEventListener('run-notebook-cell', onRunNotebookCell)
    window.removeEventListener('run-all-notebook-cells', onRunAllNotebookCells)
    window.removeEventListener('notebook-scroll-to-cell', onNotebookScrollToCell)
    window.removeEventListener('notebook-pending-edit', onNotebookPendingEdit)
    window.removeEventListener('notebook-review-resolved', onNotebookReviewResolved)

    if (saveTimer) clearTimeout(saveTimer)
    if (!filesStore.deletingPaths.has(props.filePath)) {
      await saveNotebook()
    }
  }

  function acceptPendingEdit(editId) {
    return reviews.acceptNotebookEdit(editId)
  }

  function rejectPendingEdit(editId) {
    return reviews.rejectNotebookEdit(editId)
  }

  async function insertCellResult(cellId) {
    const index = cells.findIndex((cell) => cell.id === cellId)
    if (index < 0) return

    const cell = cells[index]
    const result = await editorStore.insertExecutionResultIntoManuscript({
      outputs: cell.outputs,
      provenance: buildCellProvenance(cell, index),
    })

    if (!result.ok) {
      const message =
        result.reason === 'no-target'
          ? t('Open a Markdown, LaTeX, or Typst manuscript to insert this result.')
          : result.reason === 'no-artifact'
            ? t('This result does not contain an insertable image, table, or text output.')
            : t('Could not insert this result into the current manuscript.')

      toastStore.showOnce(`insert-result:${props.filePath}:${cellId}`, message, {
        type: 'warning',
        duration: 4000,
      })
      return
    }

    toastStore.showOnce(
      `insert-result:${props.filePath}:${cellId}:success`,
      t('Inserted result into {file}', {
        file: result.path.split('/').pop(),
      }),
      {
        type: 'success',
        duration: 3000,
      }
    )
  }

  watch(
    () => filesStore.fileContents[props.filePath],
    (newContent) => {
      if (!newContent || saving.value) return

      try {
        const notebook = parseNotebook(newContent)
        const nextSources = notebook.cells.map((cell) => cell.source)
        const currentSources = cells.map((cell) => cell.source)
        if (JSON.stringify(nextSources) !== JSON.stringify(currentSources)) {
          applyNotebookState(notebook)
        } else {
          reconcileExecutionStates()
        }
      } catch {
        // Ignore invalid notebook payloads pushed by in-flight file changes.
      }
    }
  )

  onMounted(() => {
    initialize().catch((error) => {
      console.error('Notebook initialization failed:', error)
    })
  })

  onUnmounted(() => {
    dispose().catch((error) => {
      console.error('Notebook dispose failed:', error)
    })
  })

  return {
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
    kernelStatusToneClass,
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
  }
}
