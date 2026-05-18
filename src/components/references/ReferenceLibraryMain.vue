<template>
  <div class="reference-workbench__main">
    <ReferenceLibraryToolbar
      :can-export="canExport"
      :import-in-flight="importInFlight"
      :is-loading="isLoading"
      @add="$emit('add')"
      @export-bibtex="$emit('export-bibtex')"
      @import-bibtex="$emit('import-bibtex')"
      @import-pdf="$emit('import-pdf')"
    />

    <div
      v-if="zoteroMutationError"
      class="reference-workbench__status ui-empty-copy is-error"
    >
      {{ zoteroMutationError }}
    </div>

    <div v-if="isLoading" class="reference-workbench__empty ui-empty-copy">
      {{ t('Loading references...') }}
    </div>

    <div v-else-if="loadError" class="reference-workbench__empty ui-empty-copy">
      {{ loadError }}
    </div>

    <div v-else-if="references.length === 0" class="reference-workbench__empty ui-empty-copy">
      {{ t('No references in this section yet.') }}
    </div>

    <ReferenceLibraryTable
      v-else
      :references="references"
      :selected-reference-id="selectedReferenceId"
      :sort-key="sortKey"
      @open-context-menu="forwardReferenceContextMenu"
      @select-reference="$emit('select-reference', $event)"
      @toggle-author-sort="$emit('toggle-author-sort')"
      @toggle-title-sort="$emit('toggle-title-sort')"
      @toggle-year-sort="$emit('toggle-year-sort')"
    />
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'
import ReferenceLibraryTable from './ReferenceLibraryTable.vue'
import ReferenceLibraryToolbar from './ReferenceLibraryToolbar.vue'

const emit = defineEmits([
  'add',
  'export-bibtex',
  'import-bibtex',
  'import-pdf',
  'open-context-menu',
  'select-reference',
  'toggle-author-sort',
  'toggle-title-sort',
  'toggle-year-sort',
])

defineProps({
  canExport: { type: Boolean, default: false },
  importInFlight: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  loadError: { type: String, default: '' },
  references: { type: Array, default: () => [] },
  selectedReferenceId: { type: [String, Number], default: '' },
  sortKey: { type: String, default: '' },
  zoteroMutationError: { type: String, default: '' },
})

const { t } = useI18n()

function forwardReferenceContextMenu(event, reference) {
  emit('open-context-menu', event, reference)
}
</script>

<style scoped>
.reference-workbench__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.reference-workbench__empty {
  padding: 24px;
  text-align: center;
}

.reference-workbench__status {
  padding: 10px 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.reference-workbench__status.is-error {
  color: var(--error);
}
</style>
