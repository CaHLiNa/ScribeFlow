<template>
  <Teleport to="body">
    <div v-if="isEdit" class="citation-palette-backdrop" @mousedown.prevent="closePalette"></div>
    <div ref="paletteEl" class="citation-palette" :style="paletteStyle">
      <div v-if="isEdit && editEntries.length" class="citation-palette-entries">
        <div v-for="(entry, index) in editEntries" :key="`${entry.key}-${index}`" class="citation-palette-entry">
          <div class="citation-palette-entry-title">
            <span class="citation-palette-author">{{ formatAuthor(entry.reference) }}</span>
            <span v-if="entry.reference?.year" class="citation-palette-year">({{ entry.reference.year }})</span>
            <span class="citation-palette-sep">·</span>
            <span class="citation-palette-title">{{ entry.reference?.title || entry.key }}</span>
          </div>
          <div class="citation-palette-entry-tools">
            <span class="citation-palette-key">@{{ entry.key }}</span>
            <input
              class="citation-palette-locator"
              :value="entry.locator"
              placeholder="p. 12"
              @input="updateLocator(index, $event.target.value)"
              @keydown.stop
            />
            <button type="button" class="citation-palette-chip" :disabled="index === 0" @mousedown.prevent="moveUp(index)">↑</button>
            <button
              type="button"
              class="citation-palette-chip"
              :disabled="index === editEntries.length - 1"
              @mousedown.prevent="moveDown(index)"
            >↓</button>
            <button type="button" class="citation-palette-chip citation-palette-chip-danger" @mousedown.prevent="removeFromGroup(index)">×</button>
          </div>
        </div>
      </div>

      <div v-if="isInsert && !showImport" class="citation-palette-results">
        <template v-if="filteredResults.length">
          <button
            v-for="(reference, index) in filteredResults"
            :key="reference.id"
            type="button"
            class="citation-palette-item"
            :class="{ 'is-active': index === selectedIdx }"
            @mousedown.prevent="selectResult(reference)"
          >
            <div class="citation-palette-line1">
              <span class="citation-palette-author">{{ formatAuthor(reference) }}</span>
              <span v-if="reference.year" class="citation-palette-year">({{ reference.year }})</span>
              <span class="citation-palette-sep">·</span>
              <span class="citation-palette-title">{{ reference.title }}</span>
            </div>
            <div class="citation-palette-line2">
              <span>@{{ reference.citationKey || reference.id }}</span>
              <span v-if="isDocumentScoped" class="citation-palette-scope">
                {{ reference._documentReferenceSelected ? t('Document References') : t('Add to document') }}
              </span>
            </div>
          </button>
        </template>
        <div v-else class="citation-palette-empty">
          {{ query ? t('No matching references') : t('No references available') }}
        </div>
      </div>

      <div v-if="isEdit && !showImport" class="citation-palette-add">
        <input
          ref="addInputEl"
          v-model="addQuery"
          class="citation-palette-add-input"
          :placeholder="t('Search and add to this citation group')"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown="handleAddKeydown"
        />
        <div v-if="addResults.length" class="citation-palette-add-results">
          <button
            v-for="(reference, index) in addResults"
            :key="reference.id"
            type="button"
            class="citation-palette-item"
            :class="{ 'is-active': index === addSelectedIdx }"
            @mousedown.prevent="addToGroup(reference)"
          >
            <div class="citation-palette-line1">
              <span class="citation-palette-author">{{ formatAuthor(reference) }}</span>
              <span v-if="reference.year" class="citation-palette-year">({{ reference.year }})</span>
              <span class="citation-palette-sep">·</span>
              <span class="citation-palette-title">{{ reference.title }}</span>
            </div>
            <div class="citation-palette-line2">
              <span>@{{ reference.citationKey || reference.id }}</span>
              <span v-if="isDocumentScoped" class="citation-palette-scope">
                {{ reference._documentReferenceSelected ? t('Document References') : t('Add to document') }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div v-if="showImport" class="citation-palette-import">
        <div class="citation-palette-import-title">{{ t('Import new reference') }}</div>
        <textarea
          ref="importTextEl"
          v-model="importText"
          class="citation-palette-import-textarea"
          rows="3"
          :placeholder="t('Paste DOI, BibTeX, RIS, or title')"
          @keydown.meta.enter="doImport"
          @keydown.ctrl.enter="doImport"
          @keydown.stop
        ></textarea>
        <div class="citation-palette-import-actions">
          <span v-if="importError" class="citation-palette-error">{{ importError }}</span>
          <span v-else-if="importStatus" class="citation-palette-muted">{{ importStatus }}</span>
          <button
            type="button"
            class="citation-palette-action"
            :disabled="importLoading || !importText.trim()"
            @mousedown.prevent="doImport"
          >{{ importLoading ? t('Importing...') : t('Import') }}</button>
        </div>
      </div>

      <button type="button" class="citation-palette-footer" @mousedown.prevent="toggleImport">
        <span>{{ showImport ? t('Back to search') : t('Import new reference...') }}</span>
        <span v-if="!showImport">+</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'

const props = defineProps({
  mode: { type: String, required: true },
  posX: { type: Number, required: true },
  posY: { type: Number, required: true },
  query: { type: String, default: '' },
  cites: { type: Array, default: () => [] },
  latexCommand: { type: String, default: null },
  documentPath: { type: String, default: '' },
  referenceScope: { type: String, default: 'library' },
})

const emit = defineEmits(['insert', 'update', 'close'])

const { t } = useI18n()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()

const paletteEl = ref(null)
const addInputEl = ref(null)
const importTextEl = ref(null)
const internalMode = ref(props.mode)
const editCites = ref(props.cites.map((cite) => ({ ...cite })))
const selectedIdx = ref(0)
const addQuery = ref('')
const addSelectedIdx = ref(0)
const showImport = ref(false)
const importText = ref('')
const importLoading = ref(false)
const importError = ref('')
const importStatus = ref('')
let paletteActionVersion = 0
let paletteDisposed = false

const isInsert = computed(() => internalMode.value === 'insert')
const isEdit = computed(() => internalMode.value === 'edit')
const isDocumentScoped = computed(
  () => props.referenceScope === 'document' && props.documentPath.trim()
)
const documentReferenceIdSet = computed(
  () => new Set(
    isDocumentScoped.value
      ? referencesStore.getDocumentReferenceIds(props.documentPath)
      : []
  )
)

watch(() => props.mode, (value) => {
  cancelPaletteActions()
  internalMode.value = value
})

watch(
  () => props.cites,
  (value) => {
    cancelPaletteActions()
    editCites.value = value.map((cite) => ({ ...cite }))
  },
  { deep: true }
)

function beginPaletteAction() {
  if (paletteDisposed) return null
  paletteActionVersion += 1
  return { version: paletteActionVersion }
}

function cancelPaletteActions() {
  if (paletteDisposed) return
  paletteActionVersion += 1
  importLoading.value = false
}

function isPaletteActionCurrent(token) {
  return Boolean(token && !paletteDisposed && token.version === paletteActionVersion)
}

async function focusWhenActionCurrent(targetRef, token) {
  await nextTick()
  if (!isPaletteActionCurrent(token)) return
  targetRef.value?.focus()
}

function closePalette() {
  cancelPaletteActions()
  emit('close')
}

function withDocumentScopeMeta(reference = {}) {
  if (!isDocumentScoped.value) return reference
  const referenceId = String(reference?.id || '').trim()
  return {
    ...reference,
    _documentReferenceSelected: referenceId && documentReferenceIdSet.value.has(referenceId),
  }
}

function mergeReferenceResults(primary = [], secondary = [], limit = 20) {
  const seen = new Set()
  const results = []
  for (const reference of [...primary, ...secondary]) {
    const id = String(reference?.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    results.push(withDocumentScopeMeta(reference))
    if (results.length >= limit) break
  }
  return results
}

const filteredResults = computed(() => {
  if (!isDocumentScoped.value) {
    if (!props.query?.trim()) return referencesStore.sortedLibrary.slice(0, 20)
    return referencesStore.searchRefs(props.query.trim()).slice(0, 20)
  }

  const documentReferences = referencesStore.documentReferencesForTex(props.documentPath)
  if (!props.query?.trim()) {
    return mergeReferenceResults(
      documentReferences,
      documentReferences.length ? [] : referencesStore.sortedLibrary,
      20
    )
  }
  const normalizedQuery = props.query.trim().toLowerCase()
  const matchingDocumentReferences = documentReferences
    .filter((reference) => referenceMatchesQuery(reference, normalizedQuery))
  const matchingLibraryReferences = referencesStore
    .searchRefs(props.query.trim())
    .filter((reference) => !documentReferenceIdSet.value.has(String(reference.id || '')))
  return mergeReferenceResults(matchingDocumentReferences, matchingLibraryReferences, 20)
})

const editEntries = computed(() =>
  editCites.value.map((cite) => ({
    ...cite,
    reference: resolveReferenceByKey(cite.key),
  }))
)

const addResults = computed(() => {
  if (!addQuery.value.trim()) return []
  const existingKeys = new Set(editCites.value.map((cite) => cite.key))
  const pool = isDocumentScoped.value
    ? referencesStore.searchRefs(addQuery.value.trim())
    : referencesStore.searchRefs(addQuery.value.trim())
  return pool
    .filter((reference) => !existingKeys.has(reference.citationKey || reference.id))
    .map((reference) => withDocumentScopeMeta(reference))
    .slice(0, 10)
})

const paletteStyle = computed(() => ({
  left: `${Math.min(props.posX, window.innerWidth - 420)}px`,
  top: `${Math.min(props.posY + 4, window.innerHeight - 560)}px`,
}))

watch(filteredResults, (results) => {
  selectedIdx.value = Math.max(0, Math.min(selectedIdx.value, Math.max(results.length - 1, 0)))
})

watch(addResults, (results) => {
  addSelectedIdx.value = Math.max(0, Math.min(addSelectedIdx.value, Math.max(results.length - 1, 0)))
})

function formatAuthor(reference = {}) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  if (authors.length === 0) return 'Unknown'
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`
  return `${authors[0]} et al.`
}

function referenceMatchesQuery(reference = {}, normalizedQuery = '') {
  if (!normalizedQuery) return true
  const haystack = [
    reference.title,
    ...(Array.isArray(reference.authors) ? reference.authors : []),
    reference.authorLine,
    reference.source,
    reference.citationKey,
    reference.identifier,
    reference.pages,
    ...(Array.isArray(reference.tags) ? reference.tags : []),
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(normalizedQuery)
}

function resolveReferenceByKey(key = '') {
  if (isDocumentScoped.value) {
    return (
      referencesStore.getDocumentReferenceByKey(props.documentPath, key) ||
      referencesStore.getByKey(key)
    )
  }
  return referencesStore.getByKey(key)
}

async function ensureReferenceInDocument(reference = {}) {
  if (!isDocumentScoped.value) return true
  const referenceId = String(reference?.id || '').trim()
  if (!referenceId) return false
  if (referencesStore.isReferenceSelectedForTex(props.documentPath, referenceId)) return true
  return referencesStore.addDocumentReference(
    workspace.globalConfigDir,
    props.documentPath,
    referenceId
  )
}

function citationKeyForReference(reference = {}) {
  const key = String(reference?.citationKey || reference?.id || '').trim()
  return key
}

async function selectResult(reference, stayOpen = false) {
  const key = citationKeyForReference(reference)
  if (!key) return
  const token = beginPaletteAction()
  if (!token) return
  const ready = await ensureReferenceInDocument(reference)
  if (!isPaletteActionCurrent(token) || !ready) return
  emit('insert', { keys: [key], stayOpen, latexCommand: props.latexCommand })
}

function appendReferenceToGroup(reference = {}) {
  const key = citationKeyForReference(reference)
  if (!key) return false
  if (editCites.value.some((cite) => cite.key === key)) {
    return false
  }
  editCites.value.push({ key, locator: '', prefix: '' })
  addQuery.value = ''
  addSelectedIdx.value = 0
  emit('update', { cites: editCites.value.map((cite) => ({ ...cite })) })
  return true
}

async function addToGroup(reference) {
  const key = citationKeyForReference(reference)
  if (!key) return
  const token = beginPaletteAction()
  if (!token) return
  if (editCites.value.some((cite) => cite.key === key)) return
  const ready = await ensureReferenceInDocument(reference)
  if (!isPaletteActionCurrent(token) || !ready) return
  appendReferenceToGroup(reference)
}

function removeFromGroup(index) {
  cancelPaletteActions()
  editCites.value.splice(index, 1)
  emit('update', { cites: editCites.value.map((cite) => ({ ...cite })) })
  if (editCites.value.length === 0) closePalette()
}

function updateLocator(index, value) {
  cancelPaletteActions()
  editCites.value[index].locator = value
  emit('update', { cites: editCites.value.map((cite) => ({ ...cite })) })
}

function moveUp(index) {
  if (index <= 0) return
  cancelPaletteActions()
  const current = editCites.value[index]
  const previous = editCites.value[index - 1]
  editCites.value.splice(index - 1, 2, current, previous)
  emit('update', { cites: editCites.value.map((cite) => ({ ...cite })) })
}

function moveDown(index) {
  if (index >= editCites.value.length - 1) return
  cancelPaletteActions()
  const current = editCites.value[index]
  const next = editCites.value[index + 1]
  editCites.value.splice(index, 2, next, current)
  emit('update', { cites: editCites.value.map((cite) => ({ ...cite })) })
}

function toggleImport() {
  const token = beginPaletteAction()
  if (!token) return
  showImport.value = !showImport.value
  importError.value = ''
  importStatus.value = ''
  if (showImport.value) {
    void focusWhenActionCurrent(importTextEl, token)
  } else if (isEdit.value) {
    void focusWhenActionCurrent(addInputEl, token)
  }
}

async function doImport() {
  if (!importText.value.trim() || importLoading.value) return
  const token = beginPaletteAction()
  if (!token) return
  importLoading.value = true
  importError.value = ''
  importStatus.value = ''
  try {
    const result = await referencesStore.importResolvedReferenceText(
      workspace.globalConfigDir,
      importText.value
    )
    if (!isPaletteActionCurrent(token)) return
    const importedCount = Number(result?.importedCount || 0)
    const selectedReference = result?.selectedReference || null
    const key = selectedReference?.citationKey || selectedReference?.id || ''

    if (importedCount === 0 && !key) {
      importStatus.value = t('No importable reference found')
    } else {
      importStatus.value = importedCount > 0
        ? t('Imported {count} references', { count: importedCount })
        : t('Matched existing reference')
    }

    if (key) {
      importText.value = ''
      if (isDocumentScoped.value && selectedReference?.id) {
        await referencesStore.addDocumentReference(
          workspace.globalConfigDir,
          props.documentPath,
          selectedReference.id
        )
        if (!isPaletteActionCurrent(token)) return
      }
      if (isInsert.value) {
        emit('insert', { keys: [key], stayOpen: false, latexCommand: props.latexCommand })
      } else {
        if (!isPaletteActionCurrent(token)) return
        appendReferenceToGroup(selectedReference)
        showImport.value = false
        await focusWhenActionCurrent(addInputEl, token)
      }
    }
  } catch (error) {
    if (!isPaletteActionCurrent(token)) return
    importError.value = error?.message || t('Import failed')
  } finally {
    if (isPaletteActionCurrent(token)) {
      importLoading.value = false
    }
  }
}

function handleDocKeydown(event) {
  const active = document.activeElement
  if (
    active &&
    paletteEl.value?.contains(active) &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
  ) {
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIdx.value = filteredResults.value.length
      ? Math.min(selectedIdx.value + 1, filteredResults.value.length - 1)
      : 0
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIdx.value = Math.max(selectedIdx.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (filteredResults.value.length > 0) {
      const selected = filteredResults.value[selectedIdx.value]
      void selectResult(selected, event.shiftKey)
    }
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePalette()
  }
}

function handleAddKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    addSelectedIdx.value = addResults.value.length
      ? Math.min(addSelectedIdx.value + 1, addResults.value.length - 1)
      : 0
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    addSelectedIdx.value = Math.max(addSelectedIdx.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const selected = addResults.value[addSelectedIdx.value]
    if (selected) void addToGroup(selected)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePalette()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleDocKeydown, true)
  if (isEdit.value) {
    const token = beginPaletteAction()
    if (token) void focusWhenActionCurrent(addInputEl, token)
  }
})

onUnmounted(() => {
  paletteDisposed = true
  paletteActionVersion += 1
  document.removeEventListener('keydown', handleDocKeydown, true)
})
</script>

<style scoped>
.citation-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.citation-palette {
  position: fixed;
  z-index: 9999;
  width: min(460px, calc(100vw - 24px));
  max-height: min(480px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--surface-raised) 85%, transparent);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(40px) saturate(1.5);
}

.theme-light .citation-palette {
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
}

.citation-palette-results,
.citation-palette-entries,
.citation-palette-add-results,
.citation-palette-import {
  overflow-y: auto;
  padding: 4px;
}

.citation-palette-item,
.citation-palette-entry {
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  margin-bottom: 1px;
  background: transparent;
  text-align: left;
  transition: background-color 0.1s;
}

.citation-palette-item:last-child {
  margin-bottom: 0;
}

.citation-palette-item.is-active {
  background: var(--list-active-bg);
}

.citation-palette-item.is-active .citation-palette-title,
.citation-palette-item.is-active .citation-palette-author {
  color: var(--list-active-fg);
}

.citation-palette-line1,
.citation-palette-entry-title {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
}

.citation-palette-author,
.citation-palette-year,
.citation-palette-line2,
.citation-palette-key,
.citation-palette-muted,
.citation-palette-error {
  font-size: 11px;
}

.citation-palette-author {
  color: var(--text-secondary);
  white-space: nowrap;
  font-weight: 500;
}

.citation-palette-title {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.citation-palette-line2,
.citation-palette-key,
.citation-palette-muted {
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.citation-palette-line2 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.citation-palette-scope {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 600;
}

.citation-palette-sep {
  color: var(--text-muted);
}

.citation-palette-entry-tools,
.citation-palette-import-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
}

.citation-palette-locator,
.citation-palette-add-input,
.citation-palette-import-textarea {
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  outline: none;
}

.citation-palette-add-input {
  min-height: 40px;
  padding: 0 14px;
  font-size: 14px;
}

.citation-palette-add {
  padding: 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.citation-palette-locator {
  min-height: 26px;
  padding: 0 8px;
  background: color-mix(in srgb, var(--surface-hover) 50%, transparent);
  border-radius: 4px;
}

.citation-palette-import-textarea {
  min-height: 84px;
  padding: 10px 14px;
  resize: vertical;
  background: color-mix(in srgb, var(--surface-hover) 30%, transparent);
}

.citation-palette-chip,
.citation-palette-action,
.citation-palette-footer {
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-hover) 30%, transparent);
  color: var(--text-primary);
  cursor: pointer;
}

.citation-palette-chip:hover,
.citation-palette-action:hover,
.citation-palette-footer:hover {
  background: var(--surface-hover);
}

.citation-palette-chip {
  width: 26px;
  height: 26px;
}

.citation-palette-chip-danger,
.citation-palette-error {
  color: var(--error);
}

.citation-palette-action {
  min-height: 28px;
  padding: 0 12px;
  font-size: 12px;
}

.citation-palette-import {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.citation-palette-import-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.citation-palette-empty {
  padding: 32px 16px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

.citation-palette-footer {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-radius: 0;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  background: color-mix(in srgb, var(--surface-raised) 50%, transparent);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}
</style>
