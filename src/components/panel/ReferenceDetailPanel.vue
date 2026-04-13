<template>
  <section class="reference-detail-panel">
    <div class="reference-detail-panel__tabs ui-segmented-control" role="tablist">
      <button
        type="button"
        class="reference-detail-panel__tab ui-segmented-item"
        :class="{ 'is-active': detailTab === 'metadata' }"
        @click="referencesStore.setDetailTab('metadata')"
      >
        {{ t('Metadata') }}
      </button>
      <button
        type="button"
        class="reference-detail-panel__tab ui-segmented-item"
        :class="{ 'is-active': detailTab === 'annotations' }"
        @click="referencesStore.setDetailTab('annotations')"
      >
        {{ t('Annotations') }}
      </button>
    </div>

    <div v-if="!selectedReference" class="reference-detail-panel__empty ui-empty-copy">
      {{ t('Select a reference to inspect its details.') }}
    </div>

    <div v-else class="reference-detail-panel__scroll">
      <template v-if="detailTab === 'metadata'">
        <div class="reference-detail-panel__type">{{ selectedReferenceTypeLabel }}</div>
        <h2 class="reference-detail-panel__title">{{ selectedReference.title }}</h2>
        <div class="reference-detail-panel__authors">
          {{ selectedReference.authors.join('; ') }}
        </div>
        <div class="reference-detail-panel__citation-key">
          {{ selectedReference.citationKey || t('Missing citation key') }}
        </div>

        <div class="reference-detail-panel__section">
          <div class="reference-detail-panel__section-title">{{ t('Citation') }}</div>
          <div class="reference-detail-panel__grid">
            <div class="reference-detail-panel__field">
              <span class="reference-detail-panel__label">{{ t('Year') }}</span>
              <span>{{ selectedReference.year }}</span>
            </div>
            <div class="reference-detail-panel__field">
              <span class="reference-detail-panel__label">{{ t('Source') }}</span>
              <span>{{ selectedReference.source }}</span>
            </div>
            <div class="reference-detail-panel__field">
              <span class="reference-detail-panel__label">{{ t('Identifier') }}</span>
              <span>{{ selectedReference.identifier || t('Missing') }}</span>
            </div>
            <div class="reference-detail-panel__field">
              <span class="reference-detail-panel__label">{{ t('Pages') }}</span>
              <span>{{ selectedReference.pages || '—' }}</span>
            </div>
          </div>
        </div>

        <div class="reference-detail-panel__section">
          <div class="reference-detail-panel__section-title">{{ t('Library') }}</div>
          <div class="reference-detail-panel__grid">
            <div class="reference-detail-panel__field">
              <span class="reference-detail-panel__label">{{ t('PDF') }}</span>
              <span>{{ selectedReference.hasPdf ? t('Available') : t('Missing') }}</span>
            </div>
            <div class="reference-detail-panel__field">
              <span class="reference-detail-panel__label">{{ t('Collections') }}</span>
              <span>{{ selectedReference.collections.length ? selectedReference.collections.join(', ') : t('None') }}</span>
            </div>
            <div class="reference-detail-panel__field">
              <span class="reference-detail-panel__label">{{ t('Tags') }}</span>
              <span>{{ selectedReference.tags.length ? selectedReference.tags.join(', ') : t('None') }}</span>
            </div>
          </div>
        </div>

        <div class="reference-detail-panel__section">
          <div class="reference-detail-panel__section-title">{{ t('Abstract') }}</div>
          <p class="reference-detail-panel__abstract">{{ selectedReference.abstract }}</p>
        </div>
      </template>

      <template v-else>
        <div v-if="!selectedReference.annotations.length" class="reference-detail-panel__empty ui-empty-copy">
          {{ t('No annotations yet.') }}
        </div>
        <div v-else class="reference-detail-panel__annotation-list">
          <div
            v-for="annotation in selectedReference.annotations"
            :key="annotation.id"
            class="reference-detail-panel__annotation ui-list-row"
          >
            <div class="reference-detail-panel__annotation-label">{{ annotation.label }}</div>
            <div class="reference-detail-panel__annotation-body">{{ annotation.body }}</div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { getReferenceTypeLabelKey } from '../../domains/references/referencePresentation.js'
import { useReferencesStore } from '../../stores/references'

const { t } = useI18n()
const referencesStore = useReferencesStore()

const selectedReference = computed(() => referencesStore.selectedReference)
const detailTab = computed(() => referencesStore.detailTab)
const selectedReferenceTypeLabel = computed(() =>
  selectedReference.value
    ? t(getReferenceTypeLabelKey(selectedReference.value.typeKey || selectedReference.value.typeLabel))
    : ''
)
</script>

<style scoped>
.reference-detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--text-primary);
}

.reference-detail-panel__tabs {
  width: fit-content;
  margin: 0 0 16px;
}

.reference-detail-panel__tab {
  min-width: 112px;
  padding: 7px 14px;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 78%, transparent);
  font-size: 12.5px;
  font-weight: 560;
  cursor: pointer;
}

.reference-detail-panel__scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
}

.reference-detail-panel__type {
  color: color-mix(in srgb, var(--text-secondary) 72%, transparent);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.reference-detail-panel__title {
  margin: 0;
  font-size: 17px;
  font-weight: 640;
  line-height: 1.42;
  letter-spacing: -0.015em;
}

.reference-detail-panel__authors,
.reference-detail-panel__citation-key {
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
  font-size: 12.5px;
  line-height: 1.55;
}

.reference-detail-panel__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reference-detail-panel__section-title {
  color: color-mix(in srgb, var(--text-secondary) 74%, transparent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.reference-detail-panel__grid {
  display: grid;
  gap: 8px;
}

.reference-detail-panel__field {
  display: grid;
  gap: 3px;
  font-size: 12.5px;
}

.reference-detail-panel__label {
  color: color-mix(in srgb, var(--text-secondary) 72%, transparent);
  font-size: 11px;
}

.reference-detail-panel__abstract {
  margin: 0;
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
  font-size: 12.5px;
  line-height: 1.7;
}

.reference-detail-panel__annotation-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reference-detail-panel__annotation {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
}

.reference-detail-panel__annotation-label {
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 600;
}

.reference-detail-panel__annotation-body {
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
  font-size: 12.5px;
  line-height: 1.55;
}

.reference-detail-panel__empty {
  padding: 8px 0;
}
</style>
