<template>
  <section class="reference-inspector">
    <div v-if="!selectedReference" class="reference-inspector__empty">
      {{ t('No Selection') }}
    </div>

    <div v-else class="reference-inspector__scroll scrollbar-hidden">
      <!-- Hero: Title & Authors (无边界感设计) -->
      <div class="reference-inspector__hero">
        <div class="inspector-hero-type">{{ selectedReferenceTypeLabel }}</div>
        
        <UiTextarea
          v-model="draft.title"
          variant="ghost"
          :rows="2"
          shell-class="inspector-title-input"
          :placeholder="t('Title')"
          @blur="commitTitle"
        />
        <UiInput
          v-model="draft.authorsText"
          variant="ghost"
          size="sm"
          shell-class="inspector-author-input"
          :placeholder="t('Authors')"
          @blur="commitAuthors"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <div class="inspector-divider"></div>

      <!-- Meta Grid -->
      <div class="inspector-section">
        <div class="inspector-grid">
          <div class="inspector-label">{{ t('Citation Key') }}</div>
          <div class="inspector-value">
            <UiInput v-model="draft.citationKey" variant="ghost" size="sm" monospace @blur="commitCitationKey" @keydown.enter.prevent="$event.target.blur()"/>
          </div>

          <div class="inspector-label">{{ t('Year') }}</div>
          <div class="inspector-value">
            <UiInput v-model="draft.year" variant="ghost" size="sm" @blur="commitYear" @keydown.enter.prevent="$event.target.blur()"/>
          </div>

          <div class="inspector-label">{{ t('Source') }}</div>
          <div class="inspector-value">
            <UiInput v-model="draft.source" variant="ghost" size="sm" @blur="commitTextField('source')" @keydown.enter.prevent="$event.target.blur()"/>
          </div>

          <div class="inspector-label">{{ t('Identifier') }}</div>
          <div class="inspector-value">
            <UiInput v-model="draft.identifier" variant="ghost" size="sm" monospace @blur="commitTextField('identifier')" @keydown.enter.prevent="$event.target.blur()"/>
          </div>
        </div>
        
        <div class="inspector-grid-3">
          <div class="inspector-col">
            <div class="inspector-label-mini">{{ t('Volume') }}</div>
            <UiInput v-model="draft.volume" variant="ghost" size="sm" @blur="commitTextField('volume')" @keydown.enter.prevent="$event.target.blur()"/>
          </div>
          <div class="inspector-col">
            <div class="inspector-label-mini">{{ t('Issue') }}</div>
            <UiInput v-model="draft.issue" variant="ghost" size="sm" @blur="commitTextField('issue')" @keydown.enter.prevent="$event.target.blur()"/>
          </div>
          <div class="inspector-col">
            <div class="inspector-label-mini">{{ t('Pages') }}</div>
            <UiInput v-model="draft.pages" variant="ghost" size="sm" @blur="commitTextField('pages')" @keydown.enter.prevent="$event.target.blur()"/>
          </div>
        </div>
      </div>

      <div class="inspector-divider"></div>

      <!-- Library & Organization -->
      <div class="inspector-section">
        <div class="inspector-section-header">
          <span>{{ t('Organization') }}</span>
        </div>
        
        <div class="inspector-grid">
          <div class="inspector-label">{{ t('Rating') }}</div>
          <div class="inspector-value inspector-rating">
            <button v-for="value in ratingOptions" :key="value" class="rating-star" :class="{ 'is-active': value <= draft.rating }" @click="setRating(value)">
              <IconStar :size="16" :stroke-width="1.5" />
            </button>
          </div>

          <div class="inspector-label align-top mt-1">{{ t('Collections') }}</div>
          <div class="inspector-value token-area">
            <div class="token-list">
              <button v-for="col in draft.collections" :key="col" class="token-chip" @click="removeCollection(col)">
                <IconFolder :size="12" /><span>{{ collectionLabel(col) }}</span>
              </button>
            </div>
            <UiInput v-model="collectionInput" variant="ghost" size="sm" :placeholder="t('Add...')" @keydown.enter.prevent="addCollection"/>
          </div>

          <div class="inspector-label align-top mt-1">{{ t('Tags') }}</div>
          <div class="inspector-value token-area">
            <div class="token-list">
              <button v-for="tag in draft.tags" :key="tag" class="token-chip token-chip-tag" @click="removeTag(tag)">
                {{ tag }}
              </button>
            </div>
            <UiInput v-model="tagInput" variant="ghost" size="sm" :placeholder="t('Add tag...')" @keydown.enter.prevent="addTag" @keydown="handleTagInputKeydown"/>
          </div>
        </div>
      </div>

      <div class="inspector-divider"></div>

      <!-- Abstract & Notes (Disclosure style) -->
      <div class="inspector-section">
        <details class="inspector-details" open>
          <summary class="inspector-details-summary">{{ t('Abstract') }}</summary>
          <UiTextarea v-model="draft.abstract" variant="ghost" :rows="5" @blur="commitTextField('abstract', { multiline: true })"/>
        </details>

        <details class="inspector-details">
          <summary class="inspector-details-summary">{{ t('Notes') }}</summary>
          <UiTextarea v-model="draft.note" variant="ghost" :rows="4" @blur="commitNote"/>
        </details>
      </div>

      <div class="inspector-divider"></div>

      <!-- Actions -->
      <div class="inspector-section">
        <div class="inspector-actions">
          <UiButton variant="secondary" size="sm" block :disabled="!canOpenPdf" @click="handleOpenPdf">
            <template #leading><IconFileText :size="14"/></template>
            {{ t('Open Document') }}
          </UiButton>
          <div class="inspector-action-row">
             <UiButton variant="ghost" size="sm" @click="handleRefreshMetadata">
               <template #leading><IconRefresh :size="14"/></template> {{ t('Update') }}
             </UiButton>
             <UiButton variant="ghost" size="sm" @click="handleAttachPdf">
               <template #leading><IconPaperclip :size="14"/></template> {{ t('Attach') }}
             </UiButton>
          </div>
          
          <div v-if="citedInFiles.length > 0" class="inspector-links">
             <div class="inspector-label-mini mt-2">{{ t('Cited In') }}</div>
             <button v-for="path in citedInFiles" :key="path" class="inspector-link-btn" @click="editorStore.openFile(path)">
               {{ getRelativePath(path) }}
             </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import {
  IconFileText,
  IconFolder,
  IconRefresh,
  IconStar,
  IconPaperclip
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { getReferenceTypeLabelKey } from '../../domains/references/referencePresentation.js'
import { cslToReferenceRecord } from '../../domains/references/referenceInterop.js'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { openLocalPath } from '../../services/localFileOpen'
import { lookupByDoi, searchByMetadata } from '../../services/references/crossref.js'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

const { t } = useI18n()
const editorStore = useEditorStore()
const referencesStore = useReferencesStore()
const toastStore = useToastStore()
const workspace = useWorkspaceStore()

const ratingOptions = [1, 2, 3, 4, 5]

const draft = reactive({
  title: '',
  authorsText: '',
  citationKey: '',
  year: '',
  source: '',
  identifier: '',
  volume: '',
  issue: '',
  pages: '',
  abstract: '',
  note: '',
  rating: 0,
  collections: [],
  tags: [],
})

const collectionInput = ref('')
const tagInput = ref('')

const selectedReference = computed(() => referencesStore.selectedReference)
const availableCollections = computed(() => referencesStore.collections)
const selectedReferenceTypeLabel = computed(() =>
  selectedReference.value
    ? t(getReferenceTypeLabelKey(selectedReference.value.typeKey || selectedReference.value.typeLabel))
    : ''
)
const selectedReferencePdfPath = computed(() => String(selectedReference.value?.pdfPath || '').trim())
const canOpenPdf = computed(() => selectedReferencePdfPath.value.length > 0)
const citedInFiles = computed(() => {
  const citationKey = String(selectedReference.value?.citationKey || '').trim()
  if (!citationKey) return []
  return referencesStore.citedIn[citationKey] || []
})

watch(
  () => selectedReference.value,
  (reference) => {
    syncDraft(reference)
  },
  { immediate: true }
)

function syncDraft(reference = null) {
  draft.title = String(reference?.title || '')
  draft.authorsText = Array.isArray(reference?.authors) ? reference.authors.join('; ') : ''
  draft.citationKey = String(reference?.citationKey || '')
  draft.year = reference?.year != null && reference?.year !== '' ? String(reference.year) : ''
  draft.source = String(reference?.source || '')
  draft.identifier = String(reference?.identifier || '')
  draft.volume = String(reference?.volume || '')
  draft.issue = String(reference?.issue || '')
  draft.pages = String(reference?.pages || '')
  draft.abstract = String(reference?.abstract || '')
  draft.note = Array.isArray(reference?.notes) ? reference.notes.join('\n\n') : ''
  draft.rating = Number(reference?.rating || 0) || 0
  draft.collections = normalizeCollectionMemberships(reference?.collections || [])
  draft.tags = Array.isArray(reference?.tags) ? [...reference.tags] : []
  collectionInput.value = ''
  tagInput.value = ''
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeAuthors(value = '') {
  return String(value || '')
    .split(/[\n;]+/g)
    .map((part) => normalizeText(part))
    .filter(Boolean)
}

function normalizeTagValues(value = '') {
  return String(value || '')
    .split(/[,\n;]+/g)
    .map((part) => normalizeText(part).replace(/^#/, ''))
    .filter(Boolean)
}

function getRelativePath(path = '') {
  const workspacePath = String(workspace.path || '').trim()
  if (!workspacePath || !String(path).startsWith(workspacePath)) return path
  return String(path).slice(workspacePath.length + 1)
}

function resolveCollection(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return null
  return (
    availableCollections.value.find((collection) => String(collection.key || '').trim().toLowerCase() === normalized)
    || availableCollections.value.find((collection) => String(collection.label || '').trim().toLowerCase() === normalized)
    || null
  )
}

function normalizeCollectionMemberships(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => resolveCollection(value)?.key || String(value || '').trim())
    .filter(Boolean)
}

function collectionLabel(value = '') {
  return resolveCollection(value)?.label || String(value || '').trim()
}

async function updateSelectedReference(updates = {}) {
  if (!selectedReference.value?.id) return false
  return referencesStore.updateReference(workspace.globalConfigDir, selectedReference.value.id, updates)
}

async function commitTitle() {
  draft.title = String(draft.title || '').trim()
  await updateSelectedReference({ title: draft.title })
}

async function commitAuthors() {
  const authors = normalizeAuthors(draft.authorsText)
  draft.authorsText = authors.join('; ')
  await updateSelectedReference({
    authors,
    authorLine: authors.join('; '),
  })
}

async function commitCitationKey() {
  draft.citationKey = normalizeText(draft.citationKey)
  await updateSelectedReference({ citationKey: draft.citationKey })
}

async function commitYear() {
  const trimmed = normalizeText(draft.year)
  const year = trimmed ? Number.parseInt(trimmed, 10) : null
  draft.year = Number.isFinite(year) ? String(year) : ''
  await updateSelectedReference({ year: Number.isFinite(year) ? year : null })
}

async function commitTextField(field, options = {}) {
  const { multiline = false } = options
  const value = multiline ? String(draft[field] || '').trim() : normalizeText(draft[field])
  draft[field] = value
  await updateSelectedReference({ [field]: value })
}

async function commitNote() {
  draft.note = String(draft.note || '').trim()
  await updateSelectedReference({
    notes: draft.note ? [draft.note] : [],
  })
}

async function setRating(value = 0) {
  draft.rating = value
  await updateSelectedReference({ rating: value })
}

async function addCollection() {
  const label = normalizeText(collectionInput.value)
  if (!label) return

  let collection = resolveCollection(label)
  if (!collection) {
    collection = await referencesStore.createCollection(workspace.globalConfigDir, label)
  }

  if (!collection?.key) return

  const normalizedMemberships = normalizeCollectionMemberships(draft.collections)
  if (normalizedMemberships.includes(collection.key)) {
    collectionInput.value = ''
    return
  }

  draft.collections = [...normalizedMemberships, collection.key]
  collectionInput.value = ''
  await updateSelectedReference({ collections: [...draft.collections] })
}

async function removeCollection(value = '') {
  const target = resolveCollection(value)?.key || normalizeText(value)
  draft.collections = normalizeCollectionMemberships(draft.collections).filter(
    (item) => item !== target
  )
  await updateSelectedReference({ collections: [...draft.collections] })
}

async function addTag(event) {
  event?.preventDefault?.()
  const nextTags = normalizeTagValues(tagInput.value)
  if (nextTags.length === 0) return

  const existing = new Set(draft.tags.map((tag) => normalizeText(tag).toLowerCase()))
  for (const tag of nextTags) {
    const normalized = tag.toLowerCase()
    if (!existing.has(normalized)) {
      existing.add(normalized)
      draft.tags.push(tag)
    }
  }

  tagInput.value = ''
  await updateSelectedReference({ tags: [...draft.tags] })
}

function handleTagInputKeydown(event) {
  if (event.key === ',') {
    void addTag(event)
  }
}

async function removeTag(tag = '') {
  const normalizedTarget = normalizeText(tag).toLowerCase()
  draft.tags = draft.tags.filter((item) => normalizeText(item).toLowerCase() !== normalizedTarget)
  await updateSelectedReference({ tags: [...draft.tags] })
}

async function handleRefreshMetadata() {
  const reference = selectedReference.value
  if (!reference?.id) return

  try {
    let csl = null
    const identifier = String(reference.identifier || '').trim()

    if (/^10\.\d{4,9}\//i.test(identifier)) {
      csl = await lookupByDoi(identifier)
    }

    if (!csl) {
      const match = await searchByMetadata(
        reference.title,
        Array.isArray(reference.authors) ? reference.authors[0] || '' : '',
        reference.year
      )
      csl = match?.csl || null
    }

    if (!csl) {
      toastStore.show(t('No metadata match found'), {
        type: 'error',
        duration: 3200,
      })
      return
    }

    const refreshed = cslToReferenceRecord(csl, {
      id: reference.id,
      citationKey: reference.citationKey,
      pdfPath: reference.pdfPath,
      fulltextPath: reference.fulltextPath,
      collections: reference.collections,
      tags: reference.tags,
      notes: reference.notes,
      annotations: reference.annotations,
      rating: reference.rating,
      hasPdf: reference.hasPdf,
      hasFullText: reference.hasFullText,
    })

    await updateSelectedReference({
      ...refreshed,
      _source: reference._source,
      _zoteroKey: reference._zoteroKey,
      _zoteroLibrary: reference._zoteroLibrary,
      _importMethod: reference._importMethod,
      _pushedByShoulders: reference._pushedByShoulders,
      _shouldersPushPending: reference._shouldersPushPending,
    })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to refresh metadata'), {
      type: 'error',
      duration: 3600,
    })
  }
}

async function handleOpenPdf() {
  if (!canOpenPdf.value) return
  await openLocalPath(selectedReferencePdfPath.value)
}

async function handleAttachPdf() {
  if (!selectedReference.value?.id) return

  const selected = await open({
    multiple: false,
    title: t('Attach PDF'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (!selected || Array.isArray(selected)) return
  await referencesStore.attachReferencePdf(
    workspace.globalConfigDir,
    selectedReference.value.id,
    String(selected)
  )
}
</script>

<style scoped>
.reference-inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
}

.reference-inspector__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.reference-inspector__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inspector-hero-type {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 2px;
  padding-left: 4px;
}

:deep(.inspector-title-input .ui-textarea-control) {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
  min-height: 0;
  padding-block: 2px;
}

:deep(.inspector-author-input .ui-input-control) {
  font-size: 13px;
  color: var(--text-secondary);
}

.inspector-divider {
  height: 1px;
  background: color-mix(in srgb, var(--border) 40%, transparent);
  margin: 0 4px;
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inspector-section-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.inspector-grid {
  display: grid;
  grid-template-columns: 84px 1fr;
  align-items: center;
  column-gap: 8px;
  row-gap: 2px;
}

.inspector-label {
  text-align: right;
  color: var(--text-muted);
  font-size: 12px;
  user-select: none;
}

.inspector-label.align-top {
  align-self: flex-start;
  margin-top: 6px;
}

.inspector-value {
  min-width: 0;
}

.inspector-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 0 4px;
  margin-top: 4px;
}

.inspector-col {
  display: flex;
  flex-direction: column;
}

.inspector-label-mini {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
  padding-left: 4px;
}

/* Tokens */
.token-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 4px 0;
}
.token-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-hover) 60%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.1s;
}
.token-chip:hover {
  background: var(--error);
  color: white;
  border-color: transparent;
  text-decoration: line-through;
}
.token-chip-tag::before {
  content: '#';
  opacity: 0.5;
}

/* Rating */
.inspector-rating {
  display: flex;
  padding-left: 4px;
}
.rating-star {
  background: none;
  border: none;
  color: color-mix(in srgb, var(--text-muted) 40%, transparent);
  cursor: pointer;
  padding: 2px;
}
.rating-star.is-active {
  color: var(--warning);
}

/* Details */
.inspector-details {
  padding: 0 4px;
}
.inspector-details-summary {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.inspector-details-summary::marker {
  color: var(--text-muted);
}

/* Actions */
.inspector-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px;
}
.inspector-action-row {
  display: flex;
  gap: 8px;
}
.inspector-action-row > * {
  flex: 1;
}

.inspector-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.inspector-link-btn {
  background: transparent;
  border: none;
  color: var(--accent);
  text-align: left;
  padding: 2px 4px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}
.inspector-link-btn:hover {
  background: color-mix(in srgb, var(--surface-hover) 50%, transparent);
  text-decoration: underline;
}
</style>