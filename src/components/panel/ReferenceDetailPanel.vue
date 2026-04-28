<!-- START OF FILE src/components/panel/ReferenceDetailPanel.vue -->
<template>
  <section class="reference-inspector">
    <div v-if="!selectedReference" class="reference-inspector__empty">
      {{ t('No Selection') }}
    </div>

    <div v-else class="reference-inspector__scroll scrollbar-hidden">
      
      <!-- ==========================================
           Level 1: 文档类型与核心信息 (Hero)
      =========================================== -->
      <div class="inspector-section inspector-section--hero">
        <div class="inspector-section-header">
          <span class="inspector-type-label">{{ selectedReferenceTypeLabel }}</span>
          <button
            type="button"
            class="inspector-icon-btn"
            :disabled="!canOpenPdf"
            :title="t('Open PDF')"
            @click="handleOpenPdf"
          >
            <IconFileText :size="16" :stroke-width="1.5" />
          </button>
        </div>
        
        <div class="inspector-hero-content">
          <UiTextarea
            v-model="draft.title"
            variant="ghost"
            :rows="2"
            shell-class="inspector-input-title"
            :placeholder="t('Title')"
            @focus="setActiveDraftField('title')"
            @blur="handleFieldBlur('title', commitTitle)"
          />
        </div>
      </div>

      <!-- ==========================================
           Level 2: 引用 (Citation)
      =========================================== -->
      <div class="inspector-section">
        <div class="inspector-section-header">
          <span>{{ t('Citation') }}</span>
        </div>
        
        <div class="inspector-kv-grid">
          <div class="kv-label">{{ t('Authors') }}</div>
          <div class="kv-value">
            <UiInput
              v-model="draft.authorsText"
              variant="ghost"
              size="sm"
              @focus="setActiveDraftField('authorsText')"
              @blur="handleFieldBlur('authorsText', commitAuthors)"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>

          <div class="kv-label">{{ t('Key') }}</div>
          <div class="kv-value">
            <UiInput
              v-model="draft.citationKey"
              variant="ghost"
              size="sm"
              monospace
              @focus="setActiveDraftField('citationKey')"
              @blur="handleFieldBlur('citationKey', commitCitationKey)"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>

          <div class="kv-label">{{ t('Year') }}</div>
          <div class="kv-value">
            <UiInput
              v-model="draft.year"
              variant="ghost"
              size="sm"
              @focus="setActiveDraftField('year')"
              @blur="handleFieldBlur('year', commitYear)"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>

          <div class="kv-label">{{ t('Source') }}</div>
          <div class="kv-value">
            <UiInput
              v-model="draft.source"
              variant="ghost"
              size="sm"
              @focus="setActiveDraftField('source')"
              @blur="handleFieldBlur('source', () => commitTextField('source'))"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>

          <div class="kv-label">{{ t('Identifier') }}</div>
          <div class="kv-value">
            <UiInput
              v-model="draft.identifier"
              variant="ghost"
              size="sm"
              monospace
              @focus="setActiveDraftField('identifier')"
              @blur="handleFieldBlur('identifier', () => commitTextField('identifier'))"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>

          <div class="kv-label">{{ t('Volume') }}</div>
          <div class="kv-value kv-value--inline-triple">
            <div class="triple-cell">
              <UiInput
                v-model="draft.volume"
                variant="ghost"
                size="sm"
                @focus="setActiveDraftField('volume')"
                @blur="handleFieldBlur('volume', () => commitTextField('volume'))"
                @keydown.enter.prevent="$event.target.blur()"
              />
            </div>
            <div class="triple-label">{{ t('Issue') }}</div>
            <div class="triple-cell">
              <UiInput
                v-model="draft.issue"
                variant="ghost"
                size="sm"
                @focus="setActiveDraftField('issue')"
                @blur="handleFieldBlur('issue', () => commitTextField('issue'))"
                @keydown.enter.prevent="$event.target.blur()"
              />
            </div>
            <div class="triple-label">{{ t('Pages') }}</div>
            <div class="triple-cell triple-cell--wide">
              <UiInput
                v-model="draft.pages"
                variant="ghost"
                size="sm"
                @focus="setActiveDraftField('pages')"
                @blur="handleFieldBlur('pages', () => commitTextField('pages'))"
                @keydown.enter.prevent="$event.target.blur()"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ==========================================
           Level 3: 文库 (Library)
      =========================================== -->
      <div class="inspector-section">
        <div class="inspector-section-header">
          <span>{{ t('Library') }}</span>
        </div>
        
        <div class="inspector-kv-grid">
          <div class="kv-label">{{ t('Rating') }}</div>
          <div class="kv-value inspector-rating">
            <button v-for="value in ratingOptions" :key="value" class="rating-star" :class="{ 'is-active': value <= draft.rating }" @click="setRating(value)">
              <IconStar :size="16" :stroke-width="1.5" />
            </button>
            <span class="rating-text">{{ draft.rating }} / 5</span>
          </div>

          <div class="kv-label align-top">{{ t('Collections') }}</div>
          <div class="kv-value token-area token-area--readonly">
            <div v-if="draft.collections.length > 0" class="token-list">
              <button v-for="col in draft.collections" :key="col" class="token-chip" @click="removeCollection(col)">
                <IconFolder :size="13" :stroke-width="1.5" /><span>{{ collectionLabel(col) }}</span>
                <IconX class="token-remove" :size="12" :stroke-width="2" />
              </button>
            </div>
            <div v-else class="token-empty">{{ t('No collections yet') }}</div>
          </div>

          <div class="kv-label align-top">{{ t('Tags') }}</div>
          <div class="kv-value token-area">
            <div v-if="draft.tags.length > 0" class="token-list">
              <button v-for="tag in draft.tags" :key="tag" class="token-chip token-chip-tag" @click="removeTag(tag)">
                <div class="tag-dot"></div><span>{{ tag }}</span>
                <IconX class="token-remove" :size="12" :stroke-width="2" />
              </button>
            </div>
            <UiInput
              v-model="tagInput"
              variant="ghost"
              size="sm"
              :placeholder="t('Add tag')"
              @focus="setActiveDraftField('tagInput')"
              @blur="handleTagInputBlur"
              @keydown.enter.prevent="addTag"
              @keydown="handleTagInputKeydown"
            />
          </div>
        </div>
      </div>

      <!-- ==========================================
           Level 4: 内容 (Content)
      =========================================== -->
      <div class="inspector-section">
        <div class="inspector-section-header">
          <span>{{ t('Content') }}</span>
        </div>

        <details class="inspector-details" open>
          <summary class="inspector-details-summary">
            <IconChevronRight :size="14" class="disclosure-icon" /> {{ t('Abstract') }}
          </summary>
          <div class="inspector-details-body">
            <UiTextarea
              v-model="draft.abstract"
              variant="ghost"
              :rows="5"
              @focus="setActiveDraftField('abstract')"
              @blur="handleFieldBlur('abstract', () => commitTextField('abstract', { multiline: true }))"
            />
          </div>
        </details>

        <details class="inspector-details">
          <summary class="inspector-details-summary">
            <IconChevronRight :size="14" class="disclosure-icon" /> {{ t('Notes') }}
          </summary>
          <div class="inspector-details-body">
            <UiTextarea
              v-model="draft.note"
              variant="ghost"
              :rows="4"
              @focus="setActiveDraftField('note')"
              @blur="handleFieldBlur('note', commitNote)"
            />
          </div>
        </details>
      </div>

      <!-- ==========================================
           Level 5: 文件 & 链接 (Files & Links)
      =========================================== -->
      <div class="inspector-section">
        <div class="inspector-section-header">
          <span>{{ t('Files') }}</span>
        </div>
        
        <div class="inspector-file-actions">
          <UiButton variant="secondary" size="sm" :disabled="!canOpenPdf" @click="handleOpenPdf">
            <template #leading><IconFileText :size="14"/></template> {{ t('Open') }}
          </UiButton>
          <UiButton variant="secondary" size="sm" :disabled="!canOpenPdf" @click="handleRevealPdf">
            <template #leading><IconFolder :size="14"/></template> Finder
          </UiButton>
          <UiButton variant="secondary" size="sm" @click="handleAttachPdf">
            <template #leading><IconRefresh :size="14"/></template> {{ t('Replace') }}
          </UiButton>
        </div>
      </div>

      <div v-if="citedInFiles.length > 0" class="inspector-section">
        <div class="inspector-section-header">
          <span>{{ t('Cited In') }}</span>
        </div>
        <div class="inspector-links">
          <button v-for="path in citedInFiles" :key="path" class="inspector-link-btn" @click="editorStore.openFile(path)">
            {{ getRelativePath(path) }}
          </button>
        </div>
      </div>

    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import {
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconRefresh,
  IconStar,
  IconX
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { getReferenceTypeLabelKey } from '../../domains/references/referencePresentation.js'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { revealPathInFileManager } from '../../services/fileTreeSystem'
import {
  hydrateReferenceFromCsl,
  lookupByDoi,
  searchByMetadata,
} from '../../services/references/crossref.js'
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

const tagInput = ref('')
const activeDraftField = ref('')

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
  (reference, oldRef) => {
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

function buildDraftSnapshot(reference = null) {
  return {
    title: String(reference?.title || ''),
    authorsText: Array.isArray(reference?.authors) ? reference.authors.join('; ') : '',
    citationKey: String(reference?.citationKey || ''),
    year: reference?.year != null && reference?.year !== '' ? String(reference.year) : '',
    source: String(reference?.source || ''),
    identifier: String(reference?.identifier || ''),
    volume: String(reference?.volume || ''),
    issue: String(reference?.issue || ''),
    pages: String(reference?.pages || ''),
    abstract: String(reference?.abstract || ''),
    note: Array.isArray(reference?.notes) ? reference.notes.join('\n\n') : '',
    rating: Number(reference?.rating || 0) || 0,
    collections: normalizeCollectionMemberships(reference?.collections || []),
    tags: Array.isArray(reference?.tags) ? [...reference.tags] : [],
  }
}

function syncDraft(reference = null, options = {}) {
  const { preserveField = '' } = options
  const snapshot = buildDraftSnapshot(reference)

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
  draft.rating = snapshot.rating
  draft.collections = snapshot.collections
  draft.tags = snapshot.tags
  if (preserveField !== 'tagInput') {
    tagInput.value = ''
  }
}

function setActiveDraftField(field = '') {
  activeDraftField.value = field
}

function clearActiveDraftField(field = '') {
  if (!field || activeDraftField.value === field) {
    activeDraftField.value = ''
  }
}

async function handleFieldBlur(field = '', commit) {
  try {
    if (typeof commit === 'function') {
      await commit()
    }
  } finally {
    clearActiveDraftField(field)
  }
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

async function handleTagInputBlur(event) {
  try {
    if (normalizeTagValues(tagInput.value).length > 0) {
      await addTag(event)
    }
  } finally {
    clearActiveDraftField('tagInput')
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

    const refreshed = await hydrateReferenceFromCsl(csl, {
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

    await referencesStore.updateReference(workspace.globalConfigDir, reference.id, {
      ...refreshed,
      _source: reference._source,
      _zoteroKey: reference._zoteroKey,
      _zoteroLibrary: reference._zoteroLibrary,
      _importMethod: reference._importMethod,
      _pushedByApp: reference._pushedByApp,
      _appPushPending: reference._appPushPending,
    })
    
    // 手动刷新以体现服务端数据拉取结果
    syncDraft(selectedReference.value)
    
  } catch (error) {
    toastStore.show(error?.message || t('Failed to refresh metadata'), {
      type: 'error',
      duration: 3600,
    })
  }
}

async function handleOpenPdf() {
  if (!canOpenPdf.value) return
  editorStore.openFile(selectedReferencePdfPath.value)
  workspace.setLeftSidebarPanel('files')
}

async function handleRevealPdf() {
  if (!canOpenPdf.value) return
  await revealPathInFileManager({ path: selectedReferencePdfPath.value })
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
  padding: 12px 10px 32px; /* 减小左右 padding 释放更多空间给右侧值区域 */
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ==========================================
   Level 1: Hero (类型, 标题)
========================================== */
.inspector-section--hero {
  gap: 8px !important;
}

.inspector-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  user-select: none;
}

.inspector-type-label {
  color: var(--text-secondary);
}

.inspector-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.inspector-icon-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.inspector-icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.inspector-hero-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

:deep(.ui-input-shell--ghost),
:deep(.ui-textarea-shell--ghost) {
  padding-inline: 0 !important;
  margin-inline: 0;
}

:deep(.ui-input-shell--ghost:focus-within),
:deep(.ui-textarea-shell--ghost:focus-within) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 68%, transparent);
}

:deep(.inspector-input-title .ui-textarea-control) {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  min-height: 0;
  padding-block: 2px;
}

/* ==========================================
   Level X: 通用 Section & Grid 对齐
========================================== */
.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 极致压缩左侧列宽，给右侧留足展示区 */
.inspector-kv-grid {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  row-gap: 4px;
  column-gap: 10px;
  align-items: center;
}

.kv-label {
  text-align: right;
  font-size: 12px;
  color: var(--text-muted);
  user-select: none;
  white-space: nowrap;
}

/* 修复对齐问题：与右边元素同高，垂直居中 */
.kv-label.align-top {
  align-self: flex-start;
  margin-top: 0;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* 强行约束最大宽度，超长文本会被截断并隐入输入框滑动中 */
.kv-value {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  overflow: visible;
}

/* ==========================================
   卷、期、页码：极限紧凑排版
========================================== */
.kv-value--inline-triple {
  display: flex;
  align-items: center;
  gap: 6px; /* 极小间距 */
}

.triple-cell {
  flex: 0 1 36px; /* 缩小框的最小宽度 */
  min-width: 0;
}

.triple-cell--wide {
  flex: 1 1 50px;
}

.triple-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ==========================================
   评级、文集、标签 (Tokens)
========================================== */
.inspector-rating {
  gap: 4px;
}

.rating-star {
  background: none;
  border: none;
  color: color-mix(in srgb, var(--text-muted) 40%, transparent);
  cursor: pointer;
  padding: 0;
  display: flex;
}

.rating-star.is-active {
  color: var(--warning); 
}

.rating-text {
  margin-left: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.token-area {
  flex-direction: column;
  align-items: flex-start;
  align-self: flex-start; /* 锁定顶部基准线，确保和左侧 label 完美平齐 */
  gap: 4px;
  min-height: 24px;
}

.token-area--readonly {
  justify-content: center;
}

.token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 修复对齐问题：文本与外层等高，垂直居中 */
.token-empty {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  min-height: 24px;
  display: flex;
  align-items: center;
}

.token-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  border-radius: 6px;
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.theme-light .token-chip {
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

.token-remove {
  opacity: 0;
  color: var(--text-muted);
  transition: opacity 0.15s;
}

.token-chip:hover {
  border-color: color-mix(in srgb, var(--error) 40%, transparent);
  background: color-mix(in srgb, var(--error) 10%, transparent);
  color: var(--error);
}

.token-chip:hover .token-remove {
  opacity: 1;
  color: var(--error);
}

.token-chip-tag {
  padding-left: 6px;
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-muted) 60%, transparent);
}

/* ==========================================
   内容折叠面板 (Disclosure)
========================================== */
.inspector-details {
  margin-bottom: 4px;
}

.inspector-details-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.inspector-details-summary::-webkit-details-marker {
  display: none;
}

.disclosure-icon {
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

details[open] .disclosure-icon {
  transform: rotate(90deg);
}

.inspector-details-body {
  padding-top: 6px;
  padding-left: 18px; 
}

/* ==========================================
   文件操作按钮 (Native File Actions)
========================================== */
.inspector-file-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.inspector-file-actions :deep(.ui-button) {
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.inspector-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inspector-link-btn {
  background: transparent;
  border: none;
  color: var(--accent);
  text-align: left;
  padding: 4px 6px;
  margin-left: -6px;
  font-size: 12.5px;
  cursor: pointer;
  border-radius: 4px;
}

.inspector-link-btn:hover {
  background: color-mix(in srgb, var(--surface-hover) 15%, transparent);
  text-decoration: underline;
}

/* ==========================================
   修正 Input Ghost 在小区域中的表现
========================================== */
:deep(.ui-input-shell--sm) {
  min-height: 24px;
}
:deep(.ui-input-shell--ghost .ui-input-control) {
  color: var(--text-primary);
}
</style>
