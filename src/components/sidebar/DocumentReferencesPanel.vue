<template>
  <section class="document-references-panel" :aria-label="t('Document references')">
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

    <div class="document-references-panel__section">
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

    <div v-if="hasSearchQuery" class="document-references-panel__section">
      <div class="document-references-panel__section-title">
        <IconSearch :size="14" :stroke-width="1.9" />
        <span>{{ t('Search results') }}</span>
      </div>

      <div v-if="availableResults.length" class="document-references-panel__list scrollbar-hidden">
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

      <div v-else class="document-references-panel__empty">
        {{ t('No matching unselected references.') }}
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  IconAlertTriangle,
  IconBook2,
  IconSearch,
  IconX,
} from '@tabler/icons-vue'
import { extractLatexCitationKeys } from '../../editor/latexCitations.js'
import { useI18n } from '../../i18n'
import { useFilesStore } from '../../stores/files'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, default: '' },
})

const filesStore = useFilesStore()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const query = ref('')
const hasSearchQuery = computed(() => query.value.trim().length > 0)

const documentContent = computed(() =>
  typeof filesStore.fileContents?.[props.filePath] === 'string'
    ? filesStore.fileContents[props.filePath]
    : ''
)
const selectedReferences = computed(() => referencesStore.documentReferencesForTex(props.filePath))
const selectedCitationKeys = computed(
  () => new Set(selectedReferences.value.map((reference) => reference.citationKey || reference.id))
)
const missingCitations = computed(() =>
  extractLatexCitationKeys(documentContent.value)
    .filter((key) => !selectedCitationKeys.value.has(key))
    .map((key) => ({
      key,
      reference: referencesStore.getByKey(key),
    }))
)
const availableResults = computed(() => {
  const normalizedQuery = query.value.trim()
  if (!normalizedQuery) return []
  return referencesStore
    .searchAvailableReferencesForDocument(props.filePath, normalizedQuery)
    .slice(0, 12)
})

function formatAuthors(reference = {}) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  if (authors.length === 0) return reference.authorLine || t('Unknown')
  if (authors.length === 1) return authors[0]
  return `${authors[0]} et al.`
}

async function addReference(referenceId = '') {
  await referencesStore.addDocumentReference(workspace.globalConfigDir, props.filePath, referenceId)
}

async function removeReference(referenceId = '') {
  await referencesStore.removeDocumentReference(workspace.globalConfigDir, props.filePath, referenceId)
}
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

.document-references-panel__search {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
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

.document-references-panel__missing,
.document-references-panel__section {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.document-references-panel__section {
  min-height: 0;
}

.document-references-panel__section:last-child {
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
