<!-- START OF FILE src/components/panel/ReferenceDetailPanel.vue -->
<template>
  <section class="reference-inspector">
    <div v-if="!selectedReference" class="reference-inspector__empty">
      {{ t('No Selection') }}
    </div>

    <div v-else class="reference-inspector__scroll scrollbar-hidden">
      
      <ReferenceDetailHero
        :has-draft-changes="hasDraftChanges"
        :meta-items="heroMetaItems"
        :title="draft.title"
        :type-label="selectedReferenceTypeLabel"
        @blur-title="handleFieldBlur('title', commitTitle)"
        @focus-title="setActiveDraftField('title')"
        @save="saveDraftChanges"
        @update-title="updateDraftField('title', $event)"
      />

      <!-- ==========================================
           Level 2: Metadata & Files
      =========================================== -->
      <ReferenceDetailMetadataSection
        :can-open-pdf="canOpenPdf"
        :collection-label="collectionLabel"
        :draft="draft"
        :pdf-extension-action-target="pdfExtensionActionTarget"
        :tag-input="tagInput"
        @add-tag="addTag"
        @attach-pdf="handleAttachPdf"
        @blur-field="handleMetadataFieldBlur"
        @blur-tag-input="handleTagInputBlur"
        @focus-field="setActiveDraftField"
        @open-pdf-editor="handleOpenPdfInEditor"
        @preview-pdf="handlePreviewPdf"
        @remove-collection="removeCollection"
        @remove-tag="removeTag"
        @reveal-pdf="handleRevealPdf"
        @tag-keydown="handleTagInputKeydown"
        @update-field="updateDraftField"
        @update-tag-input="updateTagInput"
      />

      <ReferenceDetailContentSection
        :abstract="draft.abstract"
        :note="draft.note"
        @blur-abstract="handleFieldBlur('abstract', () => commitTextField('abstract', { multiline: true }))"
        @blur-note="handleFieldBlur('note', commitNote)"
        @focus-abstract="setActiveDraftField('abstract')"
        @focus-note="setActiveDraftField('note')"
        @update-abstract="updateDraftField('abstract', $event)"
        @update-note="updateDraftField('note', $event)"
      />

    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import {
  REFERENCE_DETAIL_EDITABLE_FIELDS,
  buildReferenceDetailDirtyUpdates,
  buildReferenceDetailDraftSnapshot,
  buildReferenceDetailHeroMetaItems,
  hasReferenceDetailDraftFieldChanged,
  normalizeReferenceDetailAuthors,
  normalizeReferenceDetailText,
} from '../../domains/references/referenceDetailDraft.ts'
import { getReferenceTypeLabelKey } from '../../domains/references/referencePresentation.ts'
import { useReferenceDetailActions } from '../../composables/references/useReferenceDetailActions.ts'
import { useReferenceDetailTokenActions } from '../../composables/references/useReferenceDetailTokenActions.ts'
import { useReferencesStore } from '../../stores/references'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import ReferenceDetailContentSection from './ReferenceDetailContentSection.vue'
import ReferenceDetailHero from './ReferenceDetailHero.vue'
import ReferenceDetailMetadataSection from './ReferenceDetailMetadataSection.vue'

const { t } = useI18n()
const referencesStore = useReferencesStore()
const toastStore = useToastStore()
const workspace = useWorkspaceStore()
const emit = defineEmits(['open-pdf-preview'])

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
  collections: [],
  tags: [],
})

const tagInput = ref('')
const activeDraftField = ref('')
const draftReferenceId = ref('')
const dirtyDraftFields = new Set()
let referenceUpdateQueue = Promise.resolve()

const selectedReference = computed(() => referencesStore.selectedReference)
const availableCollections = computed(() => referencesStore.collections)
const selectedReferenceTypeLabel = computed(() =>
  selectedReference.value
    ? t(getReferenceTypeLabelKey(selectedReference.value.typeKey || selectedReference.value.typeLabel))
    : ''
)
const {
  canOpenPdf,
  handleAttachPdf,
  handleOpenPdfInEditor,
  handlePreviewPdf,
  handleRevealPdf,
  pdfExtensionActionTarget,
} = useReferenceDetailActions({ selectedReference, emit })
const {
  addTag,
  collectionLabel,
  handleTagInputBlur,
  handleTagInputKeydown,
  removeCollection,
  removeTag,
  updateTagInput,
} = useReferenceDetailTokenActions({
  availableCollections,
  clearActiveDraftField,
  clearDraftDirtyField,
  draft,
  markDraftDirty,
  tagInput,
  updateSelectedReference,
})
const heroMetaItems = computed(() => buildReferenceDetailHeroMetaItems(draft))
const editableDraftFields = REFERENCE_DETAIL_EDITABLE_FIELDS
const hasDraftChanges = computed(() =>
  editableDraftFields.some((field) => hasDraftFieldChanged(field, selectedReference.value))
)
watch(
  () => selectedReference.value,
  (reference, oldRef) => {
    if (oldRef?.id && oldRef.id !== reference?.id) {
      void saveDraftChangesForReference(oldRef, {
        preferredSelectedReferenceId: reference?.id || oldRef.id,
      })
    }

    if (!reference) {
      syncDraft(null)
      clearActiveDraftField()
      return
    }
    if (reference.id !== oldRef?.id) {
      syncDraft(reference)
      clearActiveDraftField()
      return
    }
    syncDraft(reference, { preserveField: activeDraftField.value })
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  void saveDraftChangesForReference(selectedReference.value)
})

function buildDraftSnapshot(reference = null) {
  return buildReferenceDetailDraftSnapshot(reference, availableCollections.value)
}

function syncDraft(reference = null, options = {}) {
  const { preserveField = '' } = options
  const snapshot = buildDraftSnapshot(reference)
  draftReferenceId.value = String(reference?.id || '')

  if (preserveField !== 'title') draft.title = snapshot.title
  if (preserveField !== 'authorsText') draft.authorsText = snapshot.authorsText
  if (preserveField !== 'citationKey') draft.citationKey = snapshot.citationKey
  if (preserveField !== 'year') draft.year = snapshot.year
  if (preserveField !== 'source') draft.source = snapshot.source
  if (preserveField !== 'identifier') draft.identifier = snapshot.identifier
  if (preserveField !== 'volume') draft.volume = snapshot.volume
  if (preserveField !== 'issue') draft.issue = snapshot.issue
  if (preserveField !== 'pages') draft.pages = snapshot.pages
  if (preserveField !== 'abstract') draft.abstract = snapshot.abstract
  if (preserveField !== 'note') draft.note = snapshot.note
  draft.collections = snapshot.collections
  draft.tags = snapshot.tags
  if (preserveField !== 'tagInput') {
    tagInput.value = ''
  }
}

function setActiveDraftField(field = '') {
  activeDraftField.value = field
}

function markDraftDirty(field = '') {
  if (field) {
    dirtyDraftFields.add(field)
  }
}

function clearDraftDirtyField(field = '') {
  if (field) {
    dirtyDraftFields.delete(field)
  }
}

function updateDraftField(field = '', value = '') {
  if (!Object.prototype.hasOwnProperty.call(draft, field)) return
  draft[field] = value
  markDraftDirty(field)
}

function handleMetadataFieldBlur(field = '') {
  const commits = {
    authorsText: commitAuthors,
    citationKey: commitCitationKey,
    identifier: () => commitTextField('identifier'),
    issue: () => commitTextField('issue'),
    pages: () => commitTextField('pages'),
    source: () => commitTextField('source'),
    volume: () => commitTextField('volume'),
    year: commitYear,
  }
  return handleFieldBlur(field, commits[field])
}

function clearActiveDraftField(field = '') {
  if (!field || activeDraftField.value === field) {
    activeDraftField.value = ''
  }
}

async function handleFieldBlur(field = '', commit) {
  try {
    if (field && !dirtyDraftFields.has(field) && !hasDraftFieldChanged(field, selectedReference.value)) {
      return
    }
    if (typeof commit === 'function') {
      await commit()
    }
  } finally {
    clearActiveDraftField(field)
  }
}

function hasDraftFieldChanged(field = '', reference = null) {
  return hasReferenceDetailDraftFieldChanged({
    field,
    draft,
    reference,
    collections: availableCollections.value,
  })
}

function formatReferenceSaveError(error) {
  if (error?.message) return error.message
  if (typeof error === 'string' && error.trim()) return error.trim()
  const text = String(error || '').trim()
  if (text && text !== '[object Object]') return text
  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== '{}') return serialized
  } catch {
    // fall through to generic message
  }
  return t('Failed to save reference details')
}

function enqueueReferenceUpdate(referenceId = '', updates = {}, options = {}) {
  const normalizedReferenceId = normalizeReferenceDetailText(referenceId)
  if (!normalizedReferenceId || !updates || Object.keys(updates).length === 0) {
    return Promise.resolve(false)
  }

  const run = async () => {
    const storageRoot = await workspace.ensureGlobalConfigDir()
    return referencesStore.updateReference(
      storageRoot,
      normalizedReferenceId,
      updates,
      options
    )
  }

  referenceUpdateQueue = referenceUpdateQueue.catch(() => false).then(run)
  return referenceUpdateQueue
}

function buildDirtyDraftUpdates(fields = new Set()) {
  const result = buildReferenceDetailDirtyUpdates({
    draft,
    tagInput: tagInput.value,
    fields,
  })
  applyDraftValues(result.draft)
  if (result.clearTagInput) {
    tagInput.value = ''
  }
  return result.updates
}

function applyDraftValues(values = {}) {
  for (const field of editableDraftFields) {
    if (Object.prototype.hasOwnProperty.call(values, field)) {
      draft[field] = values[field]
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, 'tags')) {
    draft.tags = values.tags
  }
}

async function flushDirtyDraftForReference(reference = null, options = {}) {
  const referenceId = normalizeReferenceDetailText(reference?.id || draftReferenceId.value)
  if (!referenceId || dirtyDraftFields.size === 0) return false

  const fields = new Set(dirtyDraftFields)
  fields.forEach((field) => dirtyDraftFields.delete(field))
  const updates = buildDirtyDraftUpdates(fields)
  if (Object.keys(updates).length === 0) return false

  return enqueueReferenceUpdate(referenceId, updates, {
    preferredSelectedReferenceId:
      options.preferredSelectedReferenceId ?? selectedReference.value?.id ?? referenceId,
  })
}

async function saveDraftChanges() {
  return saveDraftChangesForReference(selectedReference.value)
}

async function saveDraftChangesForReference(reference = null, options = {}) {
  try {
    const referenceId = normalizeReferenceDetailText(reference?.id || draftReferenceId.value)
    if (!referenceId) return false

    const changedFields = new Set(
      editableDraftFields.filter((field) => hasDraftFieldChanged(field, reference))
    )
    dirtyDraftFields.forEach((field) => changedFields.add(field))
    if (changedFields.size === 0) return false

    changedFields.forEach((field) => dirtyDraftFields.delete(field))
    const updates = buildDirtyDraftUpdates(changedFields)
    if (Object.keys(updates).length === 0) return false

    return await enqueueReferenceUpdate(referenceId, updates, {
      preferredSelectedReferenceId: options.preferredSelectedReferenceId ?? referenceId,
    })
  } catch (error) {
    console.error('[references] Failed to save reference details', error)
    toastStore.show(formatReferenceSaveError(error), {
      type: 'error',
      duration: 3600,
    })
    return false
  }
}

async function updateSelectedReference(updates = {}, options = {}) {
  const referenceId = normalizeReferenceDetailText(
    options.referenceId || draftReferenceId.value || selectedReference.value?.id
  )
  if (!referenceId) return false
  return enqueueReferenceUpdate(referenceId, updates, options)
}

async function commitTitle() {
  draft.title = String(draft.title || '').trim()
  dirtyDraftFields.delete('title')
  await updateSelectedReference({ title: draft.title })
}

async function commitAuthors() {
  const authors = normalizeReferenceDetailAuthors(draft.authorsText)
  draft.authorsText = authors.join('; ')
  dirtyDraftFields.delete('authorsText')
  await updateSelectedReference({
    authors,
    authorLine: authors.join('; '),
  })
}

async function commitCitationKey() {
  draft.citationKey = normalizeReferenceDetailText(draft.citationKey)
  dirtyDraftFields.delete('citationKey')
  await updateSelectedReference({ citationKey: draft.citationKey })
}

async function commitYear() {
  const trimmed = normalizeReferenceDetailText(draft.year)
  const year = trimmed ? Number.parseInt(trimmed, 10) : null
  draft.year = Number.isFinite(year) ? String(year) : ''
  dirtyDraftFields.delete('year')
  await updateSelectedReference({ year: Number.isFinite(year) ? year : null })
}

async function commitTextField(field, options = {}) {
  const { multiline = false } = options
  const value = multiline
    ? String(draft[field] || '').trim()
    : normalizeReferenceDetailText(draft[field])
  draft[field] = value
  dirtyDraftFields.delete(field)
  await updateSelectedReference({ [field]: value })
}

async function commitNote() {
  draft.note = String(draft.note || '').trim()
  dirtyDraftFields.delete('note')
  await updateSelectedReference({
    notes: draft.note ? [draft.note] : [],
  })
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
  font-family: var(--font-ui);
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
  padding: 10px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==========================================
   Level X: 通用 Section & Grid 对齐
========================================== */
.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

</style>
