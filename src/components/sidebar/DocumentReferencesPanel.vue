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
      <div class="document-references-panel__coverage-main">
        <div class="document-references-panel__coverage-heading">
          <component
            :is="citationCoverageIcon"
            class="document-references-panel__coverage-icon"
            :size="14"
            :stroke-width="1.9"
          />
          <span>{{ t('Citation check') }}</span>
        </div>
        <div class="document-references-panel__coverage-status">
          {{ citationCoverageStatus }}
        </div>
      </div>

      <div v-if="missingCitationPreview.length" class="document-references-panel__missing-preview">
        <span class="document-references-panel__missing-keys">{{ missingCitationPreviewText }}</span>
        <span v-if="hiddenMissingCitationCount > 0" class="document-references-panel__missing-more">
          +{{ hiddenMissingCitationCount }}
        </span>
      </div>

      <div v-if="linkableMissingCitations.length" class="document-references-panel__linkable">
        <button
          type="button"
          class="document-references-panel__link-action"
          :title="t('Link matching references')"
          :aria-label="t('Link matching references')"
          @click="addLinkableMissingCitations"
        >
          {{ t('Link {count} matching references', { count: linkableMissingCitations.length }) }}
        </button>
      </div>
    </div>

    <div
      class="document-references-panel__section document-references-panel__section--selected"
      :class="{ 'is-empty': selectedReferences.length === 0 }"
    >
      <div class="document-references-panel__section-title">
        <IconBook2 :size="14" :stroke-width="1.9" />
        <span>{{ t('Added references') }}</span>
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
        {{ t('Search above to link references.') }}
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
const availableResults = ref([])
let referenceScopeRequestId = 0
let referenceSearchRequestId = 0
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
const missingCitationPreview = computed(() => missingCitations.value.slice(0, 5))
const missingCitationPreviewText = computed(() =>
  missingCitationPreview.value.map((entry) => `@${entry.key}`).join(', ')
)
const hiddenMissingCitationCount = computed(() =>
  Math.max(0, missingCitations.value.length - missingCitationPreview.value.length)
)
const linkableMissingCitations = computed(() =>
  missingCitations.value.filter((entry) => entry.reference).slice(0, 2)
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

async function addLinkableMissingCitations() {
  for (const entry of linkableMissingCitations.value) {
    if (entry.reference?.id) {
      await addReference(entry.reference.id)
    }
  }
}

async function removeReference(referenceId = '') {
  await referencesStore.removeDocumentReference(workspace.globalConfigDir, documentReferencePath.value, referenceId)
}

async function refreshAvailableResults() {
  const requestId = ++referenceSearchRequestId
  const normalizedQuery = query.value.trim()
  if (!normalizedQuery) {
    availableResults.value = []
    return
  }
  const results = await referencesStore
    .searchAvailableReferencesForDocument(documentReferencePath.value, normalizedQuery)
    .catch(() => [])
  if (requestId !== referenceSearchRequestId) return
  availableResults.value = results.slice(0, 12)
}

watch(
  () => [props.filePath, workspace.path, documentContent.value],
  () => scheduleReferenceScopeResolve(documentContent.value ? 160 : 0),
  { immediate: true }
)

watch(
  () => [
    query.value,
    documentReferencePath.value,
    referencesStore.resolvedQueryState,
    referencesStore.sortKey,
    referencesStore.references,
  ],
  () => {
    void refreshAvailableResults()
  },
  { immediate: true }
)

onUnmounted(() => {
  clearReferenceScopeTimer()
  referenceScopeRequestId += 1
  referenceSearchRequestId += 1
})
</script>

<style scoped>
.document-references-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
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
  gap: 5px;
  padding: 0 0 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 42%, transparent);
}

.document-references-panel__coverage-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.document-references-panel__coverage-main,
.document-references-panel__coverage-heading,
.document-references-panel__coverage-status,
.document-references-panel__missing-preview,
.document-references-panel__missing-keys,
.document-references-panel__linkable,
.document-references-panel__link-action {
  min-width: 0;
}

.document-references-panel__coverage-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0;
}

.document-references-panel__coverage-icon {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.document-references-panel__coverage.is-warning .document-references-panel__coverage-icon {
  color: var(--warning);
}

.document-references-panel__coverage.is-good .document-references-panel__coverage-icon {
  color: var(--success);
}

.document-references-panel__coverage-status {
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.3;
}

.document-references-panel__section {
  min-height: 0;
}

.document-references-panel__section--selected {
  flex: 1 1 auto;
}

.document-references-panel__section--selected.is-empty {
  flex: 0 0 auto;
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

.document-references-panel__list {
  display: flex;
  min-height: 0;
  overflow-y: auto;
}

.document-references-panel__list {
  flex-direction: column;
  gap: 4px;
}

.document-references-panel__missing-preview {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.35;
}

.document-references-panel__missing-keys {
  display: block;
  overflow: hidden;
  color: color-mix(in srgb, var(--text-muted) 82%, transparent);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-references-panel__missing-more {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--text-muted) 82%, transparent);
}

.document-references-panel__linkable {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 1px;
}

.document-references-panel__link-action {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 11.5px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.document-references-panel__link-action:hover,
.document-references-panel__link-action:focus-visible {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  outline: none;
}

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
  padding: 2px 0 0 20px;
}
</style>
