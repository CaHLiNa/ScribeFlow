<template>
  <section class="reference-cited-in-panel" :aria-label="t('Cited In')">
    <div v-if="!citationKey" class="reference-cited-in-panel__empty">
      <IconQuote :size="18" :stroke-width="1.8" />
      <span>{{ t('No citation key') }}</span>
    </div>

    <div v-else-if="citedEntries.length === 0" class="reference-cited-in-panel__empty">
      <IconQuote :size="18" :stroke-width="1.8" />
      <span>{{ t('No citations found') }}</span>
    </div>

    <div v-else class="reference-cited-in-panel__list scrollbar-hidden" role="list">
      <button
        v-for="entry in citedEntries"
        :key="`${entry.path}:${entry.line || 0}:${entry.snippet}`"
        type="button"
        class="reference-cited-in-panel__item"
        role="listitem"
        :title="entry.snippet || entry.path"
        @click="openCitationSource(entry)"
      >
        <IconFileText
          class="reference-cited-in-panel__item-icon"
          :size="14"
          :stroke-width="1.8"
        />
        <span class="reference-cited-in-panel__item-copy">
          <span class="reference-cited-in-panel__item-title">
            <span>{{ basenamePath(entry.path) || entry.path }}</span>
            <span v-if="entry.line" class="reference-cited-in-panel__item-line">
              {{ t('Ln {line}', { line: entry.line }) }}
            </span>
          </span>
          <span v-if="entry.snippet" class="reference-cited-in-panel__item-snippet">
            {{ entry.snippet }}
          </span>
          <span class="reference-cited-in-panel__item-path">{{ getRelativePath(entry.path) }}</span>
        </span>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { IconFileText, IconQuote } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import { focusEditorLineWithHighlight } from '../../editor/revealHighlight'
import { basenamePath } from '../../utils/path'

const props = defineProps({
  reference: { type: Object, default: null },
})

const { t } = useI18n()
const editorStore = useEditorStore()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()

const citationKey = computed(() => String(props.reference?.citationKey || '').trim())
const citedEntries = computed(() => {
  if (!citationKey.value) return []
  const details = referencesStore.citedDetails[citationKey.value]
  if (Array.isArray(details) && details.length) {
    return details
      .map((entry) => ({
        path: String(entry?.path || '').trim(),
        line: Number.isInteger(Number(entry?.line)) ? Number(entry.line) : 0,
        snippet: String(entry?.snippet || '').trim(),
      }))
      .filter((entry) => entry.path)
  }

  const files = referencesStore.citedIn[citationKey.value]
  return Array.isArray(files)
    ? files.map((path) => ({ path, line: 0, snippet: '' })).filter((entry) => entry.path)
    : []
})

function getRelativePath(path = '') {
  const workspacePath = String(workspace.path || '').trim()
  if (!workspacePath || !String(path).startsWith(workspacePath)) return path
  return String(path).slice(workspacePath.length + 1)
}

function waitForEditorView(path = '') {
  return new Promise((resolve) => {
    let attempts = 0
    const check = async () => {
      const view = editorStore.getAnyEditorView(path)
      if (view || attempts >= 10) {
        resolve(view || null)
        return
      }
      attempts += 1
      await nextTick()
      window.setTimeout(check, 16)
    }
    void check()
  })
}

async function openCitationSource(entry = {}) {
  const path = String(entry?.path || '').trim()
  if (!path) return
  editorStore.openFile(path)
  const line = Number(entry?.line || 0)
  if (!Number.isInteger(line) || line < 1) return
  const view = await waitForEditorView(path)
  if (view) {
    focusEditorLineWithHighlight(view, line, { durationMs: 1800 })
  }
}
</script>

<style scoped>
.reference-cited-in-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 10px 12px 12px;
  color: var(--text-primary);
  font-family: var(--font-ui);
}

.reference-cited-in-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  gap: 7px;
  color: var(--text-muted);
  font-size: 13px;
}

.reference-cited-in-panel__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
}

.reference-cited-in-panel__item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.reference-cited-in-panel__item:hover,
.reference-cited-in-panel__item:focus-visible {
  background: color-mix(in srgb, var(--surface-hover) 42%, transparent);
  outline: none;
}

.reference-cited-in-panel__item-icon {
  margin-top: 2px;
  color: var(--text-muted);
}

.reference-cited-in-panel__item-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.reference-cited-in-panel__item-title,
.reference-cited-in-panel__item-snippet,
.reference-cited-in-panel__item-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-cited-in-panel__item-title {
  display: flex;
  align-items: baseline;
  gap: 7px;
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 600;
}

.reference-cited-in-panel__item-line {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
}

.reference-cited-in-panel__item-snippet {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.reference-cited-in-panel__item-path {
  color: var(--text-muted);
  font-size: 11.5px;
}
</style>
