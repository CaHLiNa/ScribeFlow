<template>
  <div class="proposal-card">
    <div class="proposal-prompt">{{ prompt }}</div>
    <div class="proposal-options">
      <div v-for="(opt, i) in options" :key="i" class="proposal-option">
        <div class="proposal-option-header">
          <span class="proposal-option-title">{{ opt.title }}</span>
        </div>
        <div class="proposal-option-desc">{{ opt.description }}</div>
        <div v-if="proposalMeta(opt).length" class="proposal-option-meta">
          <span
            v-for="meta in proposalMeta(opt)"
            :key="meta"
            class="proposal-meta-chip"
          >
            {{ meta }}
          </span>
        </div>
        <div class="proposal-option-actions">
          <button
            v-if="opt.url || opt.doi"
            class="proposal-btn proposal-btn-open"
            @click="openUrl(opt.url || `https://doi.org/${opt.doi}`)"
          >
            {{ t('Open') }}
          </button>
          <button
            v-if="!selectedIndices.has(i)"
            class="proposal-btn proposal-btn-select"
            @click="selectOption(opt, i)"
          >
            {{ t('Select') }}
          </button>
          <button
            v-else
            class="proposal-btn proposal-btn-secondary"
            @click="toggleSelection(i)"
          >
            {{ t('Selected') }} ✓
          </button>
        </div>
      </div>
    </div>
    <div v-if="selectedCount > 0" class="proposal-footer">
      <span class="proposal-selected-count">{{ t('{count} selected', { count: selectedCount }) }}</span>
      <div class="proposal-footer-actions">
        <button
          v-if="selectedCount >= 2"
          class="proposal-btn proposal-btn-select"
          @click="compareSelected"
        >
          {{ t('Compare selected') }}
        </button>
        <button
          class="proposal-btn proposal-btn-open"
          @click="clearSelection"
        >
          {{ t('Clear selection') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { lookupByDoi } from '../../services/crossref'
import { useReferencesStore } from '../../stores/references'
import { useI18n } from '../../i18n'

const props = defineProps({
  prompt: { type: String, required: true },
  options: { type: Array, required: true },
})

const emit = defineEmits(['select', 'compare'])

const selectedIndices = reactive(new Set())
const { t } = useI18n()
const selectedCount = computed(() => selectedIndices.size)

function proposalMeta(opt) {
  const items = []
  if (opt.doi) items.push(`DOI: ${opt.doi}`)
  if (opt.url) {
    try {
      const url = new URL(opt.url)
      items.push(url.hostname.replace(/^www\./, ''))
    } catch {
      items.push(opt.url)
    }
  }
  return items
}

async function openUrl(url) {
  const { open } = await import('@tauri-apps/plugin-shell')
  open(url).catch(() => {})
}

function toggleSelection(index) {
  if (selectedIndices.has(index)) {
    selectedIndices.delete(index)
    return
  }
  selectedIndices.add(index)
}

async function selectOption(opt, index) {
  toggleSelection(index)
  emit('select', opt.title)

  // Add to library in background if doi present
  if (opt.doi) {
    try {
      const refsStore = useReferencesStore()
      const csl = await lookupByDoi(opt.doi)
      if (csl) {
        csl._needsReview = false
        csl._matchMethod = 'doi'
        csl._addedAt = new Date().toISOString()
        refsStore.addReference(csl)
      }
    } catch (e) {
      console.warn('Failed to add reference:', e)
    }
  }
}

function compareSelected() {
  const selected = props.options.filter((_, index) => selectedIndices.has(index))
  if (selected.length < 2) return
  emit('compare', selected)
}

function clearSelection() {
  selectedIndices.clear()
}
</script>

<style scoped>
.proposal-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
}

.proposal-prompt {
  padding: 8px 10px;
  font-size: var(--ui-font-size);
  font-weight: 500;
  color: var(--fg-primary);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
}

.proposal-options {
  display: flex;
  flex-direction: column;
}

.proposal-option {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.proposal-option:last-child {
  border-bottom: none;
}

.proposal-option-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.proposal-option-title {
  font-size: var(--ui-font-size);
  font-weight: 500;
  color: var(--fg-primary);
}

.proposal-option-desc {
  font-size: calc(var(--ui-font-size) - 1px);
  color: var(--fg-secondary);
  line-height: 1.4;
  margin-bottom: 6px;
}

.proposal-option-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.proposal-meta-chip {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--fg-muted);
  font-size: calc(var(--ui-font-size) - 3px);
}

.proposal-option-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.proposal-btn {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: calc(var(--ui-font-size) - 2px);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--fg-secondary);
  transition: all 0.15s;
}

.proposal-btn:hover {
  border-color: var(--fg-muted);
  color: var(--fg-primary);
}

.proposal-btn-select {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(122, 162, 247, 0.08);
}

.proposal-btn-select:hover {
  background: rgba(122, 162, 247, 0.18);
}

.proposal-btn-secondary {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
}

.proposal-btn-secondary:hover {
  border-color: var(--success);
  color: var(--success);
}

.proposal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-tertiary) 65%, transparent);
}

.proposal-selected-count {
  font-size: calc(var(--ui-font-size) - 2px);
  color: var(--fg-muted);
}

.proposal-footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
