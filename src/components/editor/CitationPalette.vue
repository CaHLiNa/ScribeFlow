<template>
  <Teleport to="body">
    <div v-if="isEdit" class="cp-backdrop" @mousedown.prevent="emit('close')"></div>
    <div ref="paletteEl" class="citation-palette" :style="posStyle">
      <!-- ═══ EDIT MODE: Cited Entries ═══ -->
      <div v-if="isEdit && editEntries.length" class="cp-entries">
        <div
          v-for="(entry, idx) in editEntries"
          :key="entry.key"
          class="cp-entry"
          :class="{ 'cp-entry-with-divider': idx < editEntries.length - 1 }"
        >
          <div class="cp-entry-top">
            <template v-if="entry.ref">
              <span class="cp-author">{{ formatAuthor(entry.ref) }}</span>
              <span v-if="getYear(entry.ref)" class="cp-year">({{ getYear(entry.ref) }})</span>
              <span class="cp-title">{{ entry.ref.title || t('Untitled') }}</span>
            </template>
            <span v-else class="cp-missing">{{ t('Reference not found') }}</span>
          </div>
          <div class="cp-entry-line2">
            <span class="cp-key">@{{ entry.key }}</span>
            <UiInput
              class="cp-locator"
              :model-value="entry.locator"
              size="sm"
              shell-class="cp-locator-shell"
              placeholder="p."
              @update:modelValue="updateLocator(idx, $event)"
              @keydown.stop
            />
            <div class="cp-entry-actions">
              <UiButton
                variant="ghost"
                size="icon-xs"
                icon-only
                class="cp-ebtn"
                :disabled="idx === 0"
                :title="t('Move up')"
                :aria-label="t('Move up')"
                @mousedown.prevent="moveUp(idx)"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M2 6l3-3 3 3" />
                </svg>
              </UiButton>
              <UiButton
                variant="ghost"
                size="icon-xs"
                icon-only
                class="cp-ebtn"
                :disabled="idx === editEntries.length - 1"
                :title="t('Move down')"
                :aria-label="t('Move down')"
                @mousedown.prevent="moveDown(idx)"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M2 4l3 3 3-3" />
                </svg>
              </UiButton>
              <UiButton
                variant="ghost"
                size="icon-xs"
                icon-only
                class="cp-ebtn cp-ebtn-rm"
                :title="t('Remove')"
                :aria-label="t('Remove')"
                @mousedown.prevent="removeFromGroup(idx)"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </UiButton>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ INSERT MODE: Results (passive — reads query from editor) ═══ -->
      <div v-if="isInsert && !showImport" class="cp-results">
        <template v-if="filteredResults.length">
          <div
            v-for="(r, idx) in filteredResults"
            :key="r._key"
            class="cp-item"
            :class="{ 'cp-item-active': idx === selectedIdx }"
            @mousedown.prevent="selectResult(r._key)"
          >
            <div class="cp-line1">
              <span class="cp-author">{{ formatAuthor(r) }}</span>
              <span v-if="getYear(r)" class="cp-year">({{ getYear(r) }})</span>
              <span class="cp-sep"> — </span>
              <span class="cp-title">{{ r.title || t('Untitled') }}</span>
            </div>
            <div class="cp-line2">@{{ r._key }}</div>
          </div>
        </template>
        <div v-else-if="query" class="cp-empty">{{ t('No matching references') }}</div>
        <div v-else-if="!referencesStore.library.length" class="cp-empty">
          {{ t('No references yet') }}
        </div>
      </div>

      <!-- ═══ EDIT MODE: Add Another Reference ═══ -->
      <div v-if="isEdit && !showImport" class="cp-add">
        <UiInput
          ref="addInputEl"
          v-model="addQuery"
          class="cp-add-input"
          shell-class="cp-add-input-shell"
          :placeholder="t('Search library to add...')"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown="handleAddKeydown"
        />
        <div v-if="addResults.length" class="cp-add-results">
          <div
            v-for="(r, idx) in addResults"
            :key="r._key"
            class="cp-item"
            :class="{ 'cp-item-active': idx === addSelectedIdx }"
            @mousedown.prevent="addToGroup(r._key)"
          >
            <div class="cp-line1">
              <span class="cp-author">{{ formatAuthor(r) }}</span>
              <span v-if="getYear(r)" class="cp-year">({{ getYear(r) }})</span>
              <span class="cp-sep"> — </span>
              <span class="cp-title">{{ r.title || t('Untitled') }}</span>
            </div>
            <div class="cp-line2">@{{ r._key }}</div>
          </div>
        </div>
      </div>

      <!-- ═══ IMPORT SECTION ═══ -->
      <div v-if="showImport" class="cp-import">
        <div class="cp-import-hdr">{{ t('Add New Reference') }}</div>
        <UiTextarea
          ref="importTextEl"
          v-model="importText"
          class="cp-import-ta"
          shell-class="cp-import-ta-shell"
          :placeholder="t('Paste DOI / BibTeX / RIS / title...')"
          rows="2"
          @keydown.meta.enter="doImport"
          @keydown.ctrl.enter="doImport"
          @keydown.stop
        />
        <div class="cp-import-bar">
          <span v-if="importLoading" class="cp-import-status">{{ t('Looking up...') }}</span>
          <span v-else-if="importErrors.length" class="cp-import-err">{{ importErrors[0] }}</span>
          <div class="flex-1"></div>
          <UiButton
            variant="primary"
            size="sm"
            class="cp-btn-accent"
            :disabled="importLoading || !importText.trim()"
            @mousedown.prevent="doImport"
            >{{ importLoading ? t('Looking up...') : t('Look up') }}</UiButton
          >
        </div>

        <div v-if="importResults.length" class="cp-import-results">
          <div v-for="(r, idx) in importResults" :key="idx" class="cp-import-item">
            <div class="cp-line1">
              <span class="cp-author">{{ formatAuthor(r.csl) }}</span>
              <span v-if="getYear(r.csl)" class="cp-year">({{ getYear(r.csl) }})</span>
              <span class="cp-sep"> — </span>
              <span class="cp-title">{{ r.csl.title || t('Untitled') }}</span>
            </div>
            <div v-if="r.csl['container-title']" class="cp-import-meta">
              <span class="cp-import-journal">{{ r.csl['container-title'] }}</span>
              <span class="cp-confidence" :class="'cp-conf-' + r.confidence">{{
                confidenceLabel(r.confidence)
              }}</span>
            </div>
            <div class="cp-import-acts">
              <template v-if="r.existingKey && !r.added">
                <span class="cp-import-exists">{{ t('Already in library') }}</span>
              </template>
              <template v-else-if="!r.added">
                <UiButton
                  variant="primary"
                  size="sm"
                  class="cp-btn-accent"
                  @mousedown.prevent="addAndCite(r)"
                  >{{ t('Add & Cite') }}</UiButton
                >
                <UiButton
                  variant="secondary"
                  size="sm"
                  class="cp-btn-ghost"
                  @mousedown.prevent="addToLibraryOnly(r)"
                  >{{ t('Add to Library') }}</UiButton
                >
              </template>
              <span v-else class="cp-import-done">{{ t('Added') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ FOOTER ═══ -->
      <div class="cp-footer" @mousedown.prevent="toggleImport">
        <span>{{ showImport ? t('Back to search') : t('Import new reference...') }}</span>
        <span v-if="!showImport" class="cp-plus">+</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import { importFromText } from '../../services/referenceImport'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

// ─── Props & Emits ──────────────────────────────────────────

const props = defineProps({
  mode: { type: String, required: true }, // 'insert' | 'edit'
  posX: { type: Number, required: true },
  posY: { type: Number, required: true },
  query: { type: String, default: '' }, // insert mode: from editor text
  cites: { type: Array, default: () => [] }, // edit mode: [{ key, locator, prefix }]
  latexCommand: { type: String, default: null },
})

const emit = defineEmits(['insert', 'update', 'close'])

// ─── Stores ─────────────────────────────────────────────────

const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

// ─── Refs ───────────────────────────────────────────────────

const paletteEl = ref(null)
const addInputEl = ref(null)
const importTextEl = ref(null)

// ─── State ──────────────────────────────────────────────────

const internalMode = ref(props.mode)
watch(
  () => props.mode,
  (val) => {
    internalMode.value = val
  }
)
const selectedIdx = ref(0)
const editCites = ref(props.cites.map((c) => ({ ...c })))

// Add-another search (edit mode)
const addQuery = ref('')
const addSelectedIdx = ref(0)

// Import
const showImport = ref(false)
const importText = ref('')
const importLoading = ref(false)
const importResults = ref([])
const importErrors = ref([])

let unmounted = false

// ─── Computed ───────────────────────────────────────────────

const isInsert = computed(() => internalMode.value === 'insert')
const isEdit = computed(() => internalMode.value === 'edit')

const filteredResults = computed(() => {
  if (!props.query?.trim()) return referencesStore.sortedLibrary.slice(0, 20)
  return referencesStore.searchGlobalRefs(props.query.trim()).slice(0, 20)
})

const editEntries = computed(() =>
  editCites.value.map((c) => ({
    ...c,
    ref: referencesStore.getByKey(c.key),
  }))
)

const addResults = computed(() => {
  if (!addQuery.value.trim()) return []
  const cited = new Set(editCites.value.map((c) => c.key))
  return referencesStore
    .searchGlobalRefs(addQuery.value.trim())
    .filter((r) => !cited.has(r._key))
    .slice(0, 10)
})

const posStyle = computed(() => ({
  left: Math.min(props.posX, window.innerWidth - 400) + 'px',
  top: Math.min(props.posY + 4, window.innerHeight - 540) + 'px',
}))

// ─── Helpers ────────────────────────────────────────────────

function formatAuthor(r) {
  const authors = r?.author || []
  if (!authors.length) return ''
  const first = authors[0].family || authors[0].given || ''
  if (authors.length === 1) return first
  if (authors.length === 2) return `${first} & ${authors[1].family || ''}`
  return `${first} et al.`
}

function getYear(r) {
  return r?.issued?.['date-parts']?.[0]?.[0] || ''
}

function confidenceLabel(c) {
  return (
    {
      verified: t('Verified'),
      matched: t('Matched'),
      unverified: t('Unverified'),
      failed: t('Failed'),
    }[c] || ''
  )
}

// ─── Insert Mode Actions ────────────────────────────────────

function selectResult(key, stayOpen = false) {
  referencesStore.addKeyToWorkspace(key)
  if (stayOpen) {
    emit('insert', { keys: [key], stayOpen: true, latexCommand: props.latexCommand })
    internalMode.value = 'edit'
    editCites.value = [{ key, locator: '', prefix: '' }]
    nextTick(() => addInputEl.value?.focus())
  } else {
    emit('insert', { keys: [key], stayOpen: false, latexCommand: props.latexCommand })
    emit('close')
  }
}

// ─── Edit Mode Actions ──────────────────────────────────────

function addToGroup(key) {
  referencesStore.addKeyToWorkspace(key)
  editCites.value.push({ key, locator: '', prefix: '' })
  addQuery.value = ''
  addSelectedIdx.value = 0
  emit('update', { cites: editCites.value.map((c) => ({ ...c })) })
}

function removeFromGroup(idx) {
  editCites.value.splice(idx, 1)
  if (editCites.value.length === 0) {
    emit('update', { cites: [] })
    emit('close')
    return
  }
  emit('update', { cites: editCites.value.map((c) => ({ ...c })) })
}

function updateLocator(idx, value) {
  editCites.value[idx].locator = value
  emit('update', { cites: editCites.value.map((c) => ({ ...c })) })
}

function moveUp(idx) {
  if (idx <= 0) return
  const a = editCites.value[idx]
  const b = editCites.value[idx - 1]
  editCites.value.splice(idx - 1, 2, a, b)
  emit('update', { cites: editCites.value.map((c) => ({ ...c })) })
}

function moveDown(idx) {
  if (idx >= editCites.value.length - 1) return
  const a = editCites.value[idx]
  const b = editCites.value[idx + 1]
  editCites.value.splice(idx, 2, b, a)
  emit('update', { cites: editCites.value.map((c) => ({ ...c })) })
}

// ─── Import ─────────────────────────────────────────────────

function toggleImport() {
  showImport.value = !showImport.value
  if (showImport.value) {
    nextTick(() => importTextEl.value?.focus())
  }
}

async function doImport() {
  if (!importText.value.trim() || importLoading.value) return
  importLoading.value = true
  importResults.value = []
  importErrors.value = []
  try {
    const { results, errors } = await importFromText(importText.value, workspace)
    if (unmounted) return
    importResults.value = results.map((r) => ({
      ...r,
      existingKey: referencesStore.findDuplicate?.(r.csl) || null,
      added: false,
    }))
    importErrors.value = errors
  } catch (e) {
    if (unmounted) return
    importErrors.value = [e.message]
  }
  importLoading.value = false
}

function addAndCite(r) {
  const result = referencesStore.addReference({ ...r.csl, _addedAt: new Date().toISOString() })
  r.added = true
  const key = result.key
  if (isInsert.value) {
    emit('insert', { keys: [key], stayOpen: false, latexCommand: props.latexCommand })
    emit('close')
  } else {
    addToGroup(key)
  }
}

function addToLibraryOnly(r) {
  const result = referencesStore.addReference({ ...r.csl, _addedAt: new Date().toISOString() })
  r.added = true
  r.csl._key = result.key
}

// ─── Keyboard: Insert Mode (document-level) ─────────────────

function handleDocKeydown(e) {
  // Don't intercept when a palette input/textarea has focus
  const active = document.activeElement
  if (
    active &&
    paletteEl.value?.contains(active) &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
  )
    return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    selectedIdx.value = Math.min(selectedIdx.value + 1, filteredResults.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    selectedIdx.value = Math.max(selectedIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    if (filteredResults.value.length > 0) {
      const key = filteredResults.value[selectedIdx.value]._key
      selectResult(key, e.shiftKey)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'Tab') {
    // Prevent tab from moving focus out of editor
    e.preventDefault()
    e.stopPropagation()
  }
}

// ─── Keyboard: Edit Mode Add-Search ──────────────────────────

function handleAddKeydown(e) {
  if (e.key === 'ArrowDown') {
    if (addResults.value.length > 0) {
      e.preventDefault()
      addSelectedIdx.value = Math.min(addSelectedIdx.value + 1, addResults.value.length - 1)
    }
  } else if (e.key === 'ArrowUp') {
    if (addResults.value.length > 0) {
      e.preventDefault()
      addSelectedIdx.value = Math.max(addSelectedIdx.value - 1, 0)
    }
  } else if (e.key === 'Enter') {
    if (addResults.value.length > 0) {
      e.preventDefault()
      addToGroup(addResults.value[addSelectedIdx.value]._key)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

// ─── Outside Click ──────────────────────────────────────────

function handleOutsideClick(e) {
  if (!paletteEl.value?.contains(e.target)) {
    emit('close')
  }
}

// ─── Watchers ───────────────────────────────────────────────

watch(
  () => props.query,
  () => {
    selectedIdx.value = 0
  }
)

watch(selectedIdx, async () => {
  await nextTick()
  paletteEl.value?.querySelector('.cp-item-active')?.scrollIntoView({ block: 'nearest' })
})

watch(addQuery, () => {
  addSelectedIdx.value = 0
})

// ─── Lifecycle ──────────────────────────────────────────────

onMounted(() => {
  document.addEventListener('keydown', handleDocKeydown, true)
  document.addEventListener('mousedown', handleOutsideClick, true)
  if (isEdit.value) {
    nextTick(() => addInputEl.value?.focus())
  }
})

onUnmounted(() => {
  unmounted = true
  document.removeEventListener('keydown', handleDocKeydown, true)
  document.removeEventListener('mousedown', handleOutsideClick, true)
})
</script>

<style scoped>
.cp-backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) - 1);
}

.citation-palette {
  position: fixed;
  z-index: var(--z-modal);
  width: 380px;
  max-height: min(75vh, 720px);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: var(--ui-font-label);
  color: var(--fg-primary);
}

/* ── Results (insert mode) & add-results (edit mode) ── */

.cp-results,
.cp-add-results {
  overflow-y: auto;
  max-height: 420px;
}

.cp-item {
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
}
.cp-item:hover,
.cp-item-active {
  background: var(--bg-hover);
}

.cp-line1 {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cp-line2 {
  font-family: var(--font-mono);
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  margin-top: 1px;
}

.cp-author {
  color: var(--fg-primary);
}
.cp-year {
  color: var(--fg-muted);
  margin-left: 2px;
}
.cp-sep {
  color: var(--fg-muted);
}
.cp-title {
  color: var(--fg-secondary);
}
.cp-missing {
  color: var(--error);
  font-style: italic;
}

.cp-empty {
  padding: 16px 12px;
  text-align: center;
  color: var(--fg-muted);
  font-size: var(--ui-font-label);
}

/* ── Cited entries (edit mode) ── */

.cp-entries {
  overflow-y: auto;
  max-height: 300px;
}

.cp-entry {
  padding: 8px 12px;
}

.cp-entry-with-divider {
  border-bottom: 1px solid var(--border);
}

.cp-entry-top {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}
.cp-entry-top .cp-author {
  margin-right: 2px;
}
.cp-entry-top .cp-year {
  margin-right: 4px;
}

.cp-entry-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.cp-key {
  font-family: var(--font-mono);
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.cp-locator-shell {
  width: 60px;
  min-height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
}

.cp-locator-shell :deep(.ui-input-control) {
  font-size: var(--ui-font-caption);
}

.cp-entry-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.cp-ebtn {
  color: var(--text-muted);
}

.cp-ebtn:hover:not(:disabled) {
  color: var(--text-primary);
}

.cp-ebtn:disabled {
  opacity: 0.25;
  cursor: default;
}

.cp-ebtn-rm:hover:not(:disabled) {
  color: var(--error);
}

/* ── Add-another search (edit mode) ── */

.cp-add {
  border-top: 1px solid var(--border);
  padding: 8px 12px;
}

.cp-add-input-shell {
  background: var(--bg-tertiary);
}

.cp-add-results {
  margin-top: 4px;
}

/* ── Import section ── */

.cp-import {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}

.cp-import-hdr {
  font-size: var(--ui-font-caption);
  font-weight: 500;
  color: var(--fg-secondary);
  margin-bottom: 6px;
}

.cp-import-ta-shell {
  background: var(--bg-tertiary);
}

.cp-import-ta-shell :deep(.ui-textarea-control) {
  min-height: 48px;
  font-size: var(--ui-font-label);
}

.cp-import-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.cp-import-status {
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.cp-import-err {
  font-size: var(--ui-font-caption);
  color: var(--error);
}

.cp-import-results {
  margin-top: 8px;
}

.cp-import-item {
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.cp-import-meta {
  display: flex;
  gap: 6px;
  margin-top: 2px;
  font-size: var(--ui-font-caption);
}

.cp-import-journal {
  color: var(--fg-muted);
}

.cp-confidence {
  font-size: var(--ui-font-micro);
  padding: 0 4px;
  border-radius: 2px;
}
.cp-conf-verified {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}
.cp-conf-matched {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
.cp-conf-unverified {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}
.cp-conf-failed {
  background: color-mix(in srgb, var(--error) 14%, transparent);
  color: var(--error);
}

.cp-import-acts {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
}

.cp-import-exists {
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.cp-import-done {
  font-size: var(--ui-font-caption);
  color: var(--success);
}

/* ── Footer ── */

.cp-footer {
  border-top: 1px solid var(--border);
  padding: 6px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  transition: background 0.1s;
}
.cp-footer:hover {
  background: var(--bg-hover);
  color: var(--fg-secondary);
}

.cp-plus {
  font-size: var(--ui-font-title);
  font-weight: 300;
}
</style>
