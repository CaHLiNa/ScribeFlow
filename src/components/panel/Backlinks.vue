<template>
  <div class="backlinks-panel">
    <div v-if="!embedded" class="backlinks-panel-heading">
      {{ t('Backlinks to {name}', { name: currentFileName }) }}
    </div>

    <div v-if="backlinks.length === 0" class="backlinks-panel-empty">
      {{ t('No other files link to this file.') }}
    </div>

    <div v-else class="backlinks-panel-scroll">
      <div
        v-for="(link, idx) in backlinks"
        :key="idx"
        class="backlinks-panel-row"
        @click="navigateToSource(link)"
      >
        <div class="backlinks-panel-row-head">
          <span class="backlinks-panel-source">{{ link.sourceName }}</span>
          <span class="backlinks-panel-line">:{{ link.lineNumber }}</span>
        </div>
        <div class="backlinks-panel-context">
          {{ link.context }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLinksStore } from '../../stores/links'
import { useEditorStore } from '../../stores/editor'
import { useI18n } from '../../i18n'

const props = defineProps({
  overrideActiveFile: { type: String, default: null },
  embedded: { type: Boolean, default: false },
})

const linksStore = useLinksStore()
const editorStore = useEditorStore()
const { t } = useI18n()

// Use overrideActiveFile prop when provided (e.g., from right sidebar when chat tab is focused)
const currentFilePath = computed(() => props.overrideActiveFile || editorStore.activeTab)

const currentFileName = computed(() => {
  if (!currentFilePath.value) return '...'
  return currentFilePath.value.split('/').pop().replace(/\.md$/, '')
})

const backlinks = computed(() => {
  if (!currentFilePath.value) return []
  return linksStore.backlinksForFile(currentFilePath.value)
})

function navigateToSource(link) {
  editorStore.openFile(link.sourcePath)
}
</script>

<style scoped>
.backlinks-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--fg-primary);
}

.backlinks-panel-heading {
  padding: 8px 12px;
  flex-shrink: 0;
  font-size: var(--sidebar-font-kicker);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.backlinks-panel-empty {
  padding: 16px 12px;
  font-size: var(--sidebar-font-body);
  line-height: 1.55;
  color: var(--fg-muted);
}

.backlinks-panel-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
}

.backlinks-panel-row {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.backlinks-panel-row:hover {
  background: var(--bg-hover);
}

.backlinks-panel-row-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--sidebar-font-item);
  line-height: 1.35;
}

.backlinks-panel-source {
  font-weight: 500;
  color: var(--accent);
}

.backlinks-panel-line {
  font-size: var(--sidebar-font-meta);
  color: var(--fg-muted);
}

.backlinks-panel-context {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sidebar-font-body);
  line-height: 1.45;
  color: var(--fg-muted);
}
</style>
