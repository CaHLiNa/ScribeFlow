<template>
  <section class="document-references-panel" :aria-label="t('Document references')">
    <div class="document-references-panel__search-shell">
      <div class="document-references-panel__search">
        <IconSearch :size="14" :stroke-width="1.9" />
        <input
          v-model="query"
          class="document-references-panel__search-input"
          type="search"
          :placeholder="t('Search library')"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div v-if="hasSearchQuery" class="document-references-panel__search-popover">
        <div v-if="availableResults.length" class="document-references-panel__list document-references-panel__search-list scrollbar-hidden">
          <article
            v-for="reference in availableResults"
            :key="reference.id"
            class="document-references-panel__reference"
          >
            <div class="document-references-panel__reference-body">
              <div class="document-references-panel__reference-title">
                {{ reference.title || reference.citationKey || reference.id }}
              </div>
              <div class="document-references-panel__reference-meta">
                <span>{{ formatAuthors(reference) }}</span>
                <span v-if="reference.year">{{ reference.year }}</span>
              </div>
              <div class="document-references-panel__key">@{{ reference.citationKey || reference.id }}</div>
            </div>
            <button
              type="button"
              class="document-references-panel__mini-action"
              @click="addReference(reference.id)"
            >
              {{ t('Add') }}
            </button>
          </article>
        </div>

        <div v-else class="document-references-panel__empty document-references-panel__popover-empty">
          {{ t('No matching unselected references.') }}
        </div>
      </div>
    </div>

    <div class="document-references-panel__coverage" :class="citationCoverageTone">
      <div class="document-references-panel__coverage-heading">
        <component :is="citationCoverageIcon" :size="14" :stroke-width="1.9" />
        <span>{{ t('Citation coverage') }}</span>
      </div>
      <div class="document-references-panel__coverage-status">
        {{ citationCoverageStatus }}
      </div>
      <div class="document-references-panel__coverage-stats">
        <span class="document-references-panel__coverage-stat">
          <strong>{{ citationCoverage.counts.cited }}</strong>
          <span>{{ t('Cited') }}</span>
        </span>
        <span class="document-references-panel__coverage-stat">
          <strong>{{ citationCoverage.counts.linked }}</strong>
          <span>{{ t('Linked') }}</span>
        </span>
        <span class="document-references-panel__coverage-stat">
          <strong>{{ citationCoverage.counts.missing }}</strong>
          <span>{{ t('Missing') }}</span>
        </span>
        <span class="document-references-panel__coverage-stat">
          <strong>{{ citationCoverage.counts.unused }}</strong>
          <span>{{ t('Unused') }}</span>
        </span>
      </div>
    </div>

    <div
      class="document-references-panel__section document-references-panel__section--selected"
    >
      <div class="document-references-panel__section-title">
        <IconBook2 :size="14" :stroke-width="1.9" />
        <span>{{ t('Document References') }}</span>
        <span class="document-references-panel__count">{{ selectedReferences.length }}</span>
      </div>

      <div v-if="selectedReferences.length" class="document-references-panel__list scrollbar-hidden">
        <article
          v-for="reference in selectedReferences"
          :key="reference.id"
          class="document-references-panel__reference"
        >
          <div class="document-references-panel__reference-body">
            <div class="document-references-panel__reference-title">
              {{ reference.title || reference.citationKey || reference.id }}
            </div>
            <div class="document-references-panel__reference-meta">
              <span>{{ formatAuthors(reference) }}</span>
              <span v-if="reference.year">{{ reference.year }}</span>
            </div>
            <div class="document-references-panel__key">@{{ reference.citationKey || reference.id }}</div>
          </div>
          <button
            type="button"
            class="document-references-panel__icon-action"
            :title="t('Remove')"
            :aria-label="t('Remove reference')"
            @click="removeReference(reference.id)"
          >
            <IconX :size="14" :stroke-width="2" />
          </button>
        </article>
      </div>

      <div v-else class="document-references-panel__empty">
        {{ t('Search the library and add references for this .tex file.') }}
      </div>
    </div>

    <div v-if="unusedReferences.length" class="document-references-panel__unused">
      <div class="document-references-panel__section-title">
        <IconBook2 :size="14" :stroke-width="1.9" />
        <span>{{ t('Not cited in source') }}</span>
        <span class="document-references-panel__count">{{ unusedReferences.length }}</span>
      </div>
      <div class="document-references-panel__list scrollbar-hidden">
        <article
          v-for="reference in unusedReferences"
          :key="reference.id"
          class="document-references-panel__reference document-references-panel__reference--unused"
        >
          <div class="document-references-panel__reference-body">
            <div class="document-references-panel__reference-title">
              {{ reference.title || reference.citationKey || reference.id }}
            </div>
            <div class="document-references-panel__reference-meta">
              <span>{{ formatAuthors(reference) }}</span>
              <span v-if="reference.year">{{ reference.year }}</span>
            </div>
            <div class="document-references-panel__key">@{{ reference.citationKey || reference.id }}</div>
          </div>
          <button
            type="button"
            class="document-references-panel__icon-action"
            :title="t('Remove')"
            :aria-label="t('Remove reference')"
            @click="removeReference(reference.id)"
          >
            <IconX :size="14" :stroke-width="2" />
          </button>
        </article>
      </div>
    </div>

    <div v-if="missingCitations.length" class="document-references-panel__missing">
      <div class="document-references-panel__section-title">
        <IconAlertTriangle :size="14" :stroke-width="1.9" />
        <span>{{ t('Missing from this document') }}</span>
      </div>
      <div class="document-references-panel__missing-list">
        <div
          v-for="entry in missingCitations"
          :key="entry.key"
          class="document-references-panel__missing-item"
        >
          <span class="document-references-panel__key">@{{ entry.key }}</span>
          <button
            v-if="entry.reference"
            type="button"
            class="document-references-panel__mini-action"
            @click="addReference(entry.reference.id)"
          >
            {{ t('Add') }}
          </button>
          <span v-else class="document-references-panel__muted">{{ t('Not in library') }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  IconAlertTriangle,
  IconBook2,
  IconCircleCheck,
  IconSearch,
  IconX,
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { useFilesStore } from '../../stores/files'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import { resolveLatexReferenceContext } from '../../services/latex/root.js'
import { buildDocumentCitationCoverage } from '../../domains/references/documentCitationCoverage.js'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, default: '' },
})

const filesStore = useFilesStore()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const query = ref('')
const referenceScopePath = ref(props.filePath)
const citedKeys = ref([])
let referenceScopeRequestId = 0
let referenceScopeTimer = null
const hasSearchQuery = computed(() => query.value.trim().length > 0)

const documentContent = computed(() =>
  typeof filesStore.fileContents?.[props.filePath] === 'string'
    ? filesStore.fileContents[props.filePath]
    : ''
)
const documentReferencePath = computed(() => referenceScopePath.value || props.filePath)
const selectedReferences = computed(() => referencesStore.documentReferencesForTex(documentReferencePath.value))
const citationCoverage = computed(() =>
  buildDocumentCitationCoverage({
    citedKeys: citedKeys.value,
    selectedReferences: selectedReferences.value,
  })
)
const unusedReferences = computed(() => citationCoverage.value.unusedReferences)
const missingCitations = computed(() =>
  citationCoverage.value.missingCitationKeys.map((key) => ({
    key,
    reference: referencesStore.getByKey(key),
  }))
)
const citationCoverageTone = computed(() => {
  if (citationCoverage.value.counts.missing > 0) return 'is-warning'
  if (citationCoverage.value.counts.unused > 0) return 'is-muted'
  if (citationCoverage.value.counts.cited > 0) return 'is-good'
  return 'is-muted'
})
const citationCoverageIcon = computed(() =>
  citationCoverage.value.counts.missing > 0 ? IconAlertTriangle : IconCircleCheck
)
const citationCoverageStatus = computed(() => {
  const counts = citationCoverage.value.counts
  if (counts.missing > 0) {
    return t('{count} citation keys need library links', { count: counts.missing })
  }
  if (counts.unused > 0) {
    return t('{count} selected references are not cited', { count: counts.unused })
  }
  if (counts.cited > 0) return t('All cited keys are linked')
  return t('No citations detected')
})
const availableResults = computed(() => {
  const normalizedQuery = query.value.trim()
  if (!normalizedQuery) return []
  return referencesStore
    .searchAvailableReferencesForDocument(documentReferencePath.value, normalizedQuery)
    .slice(0, 12)
})

function clearReferenceScopeTimer() {
  if (referenceScopeTimer == null || typeof window === 'undefined') return
  window.clearTimeout(referenceScopeTimer)
  referenceScopeTimer = null
}

async function resolveReferenceScope() {
  if (!props.filePath) {
    referenceScopePath.value = ''
    return
  }
  const requestId = ++referenceScopeRequestId
  const contentOverrides = documentContent.value
    ? { [props.filePath]: documentContent.value }
    : {}
  const resolved = await resolveLatexReferenceContext(props.filePath, {
    filesStore,
    workspacePath: workspace.path,
    contentOverrides,
  }).catch(() => ({
    referenceScopePath: props.filePath,
    citedKeys: [],
  }))
  if (requestId !== referenceScopeRequestId) return
  referenceScopePath.value = resolved.referenceScopePath || props.filePath
  citedKeys.value = Array.isArray(resolved.citedKeys) ? resolved.citedKeys : []
}

function scheduleReferenceScopeResolve(delay = 160) {
  clearReferenceScopeTimer()
  if (typeof window === 'undefined' || delay <= 0) {
    void resolveReferenceScope()
    return
  }
  referenceScopeTimer = window.setTimeout(() => {
    referenceScopeTimer = null
    void resolveReferenceScope()
  }, delay)
}

function formatAuthors(reference = {}) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  if (authors.length === 0) return reference.authorLine || t('Unknown')
  if (authors.length === 1) return authors[0]
  return `${authors[0]} et al.`
}

async function addReference(referenceId = '') {
  await referencesStore.addDocumentReference(workspace.globalConfigDir, documentReferencePath.value, referenceId)
}

async function removeReference(referenceId = '') {
  await referencesStore.removeDocumentReference(workspace.globalConfigDir, documentReferencePath.value, referenceId)
}

watch(
  () => [props.filePath, workspace.path, documentContent.value],
  () => scheduleReferenceScopeResolve(documentContent.value ? 160 : 0),
  { immediate: true }
)

onUnmounted(() => {
  clearReferenceScopeTimer()
  referenceScopeRequestId += 1
})
</script>

<style scoped>
.document-references-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  color: var(--text-primary);
  font-family: var(--font-ui);
}

.document-references-panel__search-shell {
  position: relative;
  z-index: 10;
  flex: 0 0 auto;
}

.document-references-panel__search {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-muted) 40%, transparent);
  color: var(--text-muted);
}

.document-references-panel__search:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  color: var(--text-primary);
}

.document-references-panel__search-input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12.5px;
}

.document-references-panel__search-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  right: 0;
  left: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-raised) 96%, transparent);
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.18),
    0 0 0 1px color-mix(in srgb, var(--surface-muted) 24%, transparent);
}

.document-references-panel__search-list {
  max-height: min(430px, calc(100vh - 180px));
  padding: 6px;
}

.document-references-panel__popover-empty {
  padding: 10px 12px;
}

.document-references-panel__missing,
.document-references-panel__unused,
.document-references-panel__section {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.document-references-panel__coverage {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-muted) 34%, transparent);
}

.document-references-panel__coverage.is-warning {
  border-color: color-mix(in srgb, var(--warning) 46%, var(--border));
}

.document-references-panel__coverage.is-good {
  border-color: color-mix(in srgb, var(--success) 42%, var(--border));
}

.document-references-panel__coverage-heading,
.document-references-panel__coverage-status,
.document-references-panel__coverage-stats,
.document-references-panel__coverage-stat {
  min-width: 0;
}

.document-references-panel__coverage-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.document-references-panel__coverage-status {
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.25;
}

.document-references-panel__coverage-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.document-references-panel__coverage-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-hover) 36%, transparent);
  color: var(--text-muted);
  font-size: 10.5px;
  line-height: 1.15;
}

.document-references-panel__coverage-stat strong {
  color: var(--text-primary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.document-references-panel__section {
  min-height: 0;
}

.document-references-panel__section--selected {
  flex: 1 1 auto;
}

.document-references-panel__section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0;
}

.document-references-panel__count {
  margin-left: auto;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.document-references-panel__missing-list,
.document-references-panel__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
}

.document-references-panel__missing-item,
.document-references-panel__reference {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-hover) 28%, transparent);
}

.document-references-panel__reference--unused {
  background: color-mix(in srgb, var(--surface-muted) 34%, transparent);
}

.document-references-panel__missing-item {
  align-items: center;
  justify-content: space-between;
}

.document-references-panel__reference-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.document-references-panel__reference-title {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.32;
  text-overflow: ellipsis;
}

.document-references-panel__reference-meta,
.document-references-panel__key,
.document-references-panel__muted,
.document-references-panel__empty {
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.25;
}

.document-references-panel__reference-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.document-references-panel__key {
  overflow-wrap: anywhere;
}

.document-references-panel__mini-action,
.document-references-panel__icon-action {
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.document-references-panel__mini-action {
  padding: 4px 7px;
}

.document-references-panel__icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--text-muted);
}

.document-references-panel__mini-action:hover,
.document-references-panel__mini-action:focus-visible,
.document-references-panel__icon-action:hover,
.document-references-panel__icon-action:focus-visible {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--text-primary);
  outline: none;
}

.document-references-panel__empty {
  padding: 9px 2px;
}
</style>
