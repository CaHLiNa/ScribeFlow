<template>
  <div class="inspector-section inspector-section--metadata">
    <div class="inspector-kv-grid">
      <div class="kv-label">{{ t('Authors') }}</div>
      <div class="kv-value">
        <UiInput
          :model-value="draft.authorsText"
          variant="ghost"
          size="sm"
          @update:model-value="(value) => $emit('update-field', 'authorsText', value)"
          @focus="$emit('focus-field', 'authorsText')"
          @blur="$emit('blur-field', 'authorsText')"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <div class="kv-label">{{ t('Key') }}</div>
      <div class="kv-value">
        <UiInput
          :model-value="draft.citationKey"
          variant="ghost"
          size="sm"
          monospace
          @update:model-value="(value) => $emit('update-field', 'citationKey', value)"
          @focus="$emit('focus-field', 'citationKey')"
          @blur="$emit('blur-field', 'citationKey')"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <div class="kv-label">{{ t('Year') }}</div>
      <div class="kv-value">
        <UiInput
          :model-value="draft.year"
          variant="ghost"
          size="sm"
          @update:model-value="(value) => $emit('update-field', 'year', value)"
          @focus="$emit('focus-field', 'year')"
          @blur="$emit('blur-field', 'year')"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <div class="kv-label">{{ t('Source') }}</div>
      <div class="kv-value">
        <UiInput
          :model-value="draft.source"
          variant="ghost"
          size="sm"
          @update:model-value="(value) => $emit('update-field', 'source', value)"
          @focus="$emit('focus-field', 'source')"
          @blur="$emit('blur-field', 'source')"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <div class="kv-label">{{ t('Identifier') }}</div>
      <div class="kv-value">
        <UiInput
          :model-value="draft.identifier"
          variant="ghost"
          size="sm"
          monospace
          @update:model-value="(value) => $emit('update-field', 'identifier', value)"
          @focus="$emit('focus-field', 'identifier')"
          @blur="$emit('blur-field', 'identifier')"
          @keydown.enter.prevent="$event.target.blur()"
        />
      </div>

      <div class="kv-label">{{ t('Volume') }}</div>
      <div class="kv-value kv-value--inline-triple">
        <div class="triple-cell">
          <UiInput
            :model-value="draft.volume"
            variant="ghost"
            size="sm"
            @update:model-value="(value) => $emit('update-field', 'volume', value)"
            @focus="$emit('focus-field', 'volume')"
            @blur="$emit('blur-field', 'volume')"
            @keydown.enter.prevent="$event.target.blur()"
          />
        </div>
        <div class="triple-label">{{ t('Issue') }}</div>
        <div class="triple-cell">
          <UiInput
            :model-value="draft.issue"
            variant="ghost"
            size="sm"
            @update:model-value="(value) => $emit('update-field', 'issue', value)"
            @focus="$emit('focus-field', 'issue')"
            @blur="$emit('blur-field', 'issue')"
            @keydown.enter.prevent="$event.target.blur()"
          />
        </div>
        <div class="triple-label">{{ t('Pages') }}</div>
        <div class="triple-cell triple-cell--wide">
          <UiInput
            :model-value="draft.pages"
            variant="ghost"
            size="sm"
            @update:model-value="(value) => $emit('update-field', 'pages', value)"
            @focus="$emit('focus-field', 'pages')"
            @blur="$emit('blur-field', 'pages')"
            @keydown.enter.prevent="$event.target.blur()"
          />
        </div>
      </div>

      <div class="kv-label align-top">{{ t('Collections') }}</div>
      <div class="kv-value token-area token-area--readonly">
        <div v-if="draft.collections.length > 0" class="token-list">
          <button
            v-for="col in draft.collections"
            :key="col"
            class="token-chip"
            @click="$emit('remove-collection', col)"
          >
            <IconFolder :size="13" :stroke-width="1.5" /><span>{{ collectionLabel(col) }}</span>
            <IconX class="token-remove" :size="12" :stroke-width="2" />
          </button>
        </div>
        <div v-else class="token-empty">{{ t('No collections yet') }}</div>
      </div>

      <div class="kv-label align-top">{{ t('Tags') }}</div>
      <div class="kv-value token-area">
        <div v-if="draft.tags.length > 0" class="token-list">
          <button
            v-for="tag in draft.tags"
            :key="tag"
            class="token-chip token-chip-tag"
            @click="$emit('remove-tag', tag)"
          >
            <div class="tag-dot"></div><span>{{ tag }}</span>
            <IconX class="token-remove" :size="12" :stroke-width="2" />
          </button>
        </div>
        <UiInput
          :model-value="tagInput"
          variant="ghost"
          size="sm"
          :placeholder="t('Add tag')"
          @update:model-value="(value) => $emit('update-tag-input', value)"
          @focus="$emit('focus-field', 'tagInput')"
          @blur="$emit('blur-tag-input', $event)"
          @keydown.enter.prevent="$emit('add-tag', $event)"
          @keydown="$emit('tag-keydown', $event)"
        />
      </div>

      <div class="kv-label align-top">{{ t('Files') }}</div>
      <div class="kv-value kv-value--file-actions">
        <div class="inspector-file-actions">
          <UiButton variant="secondary" size="sm" :disabled="!canOpenPdf" @click="$emit('preview-pdf')">
            <template #leading><IconFileText :size="14"/></template> {{ t('Preview') }}
          </UiButton>
          <UiButton variant="secondary" size="sm" :disabled="!canOpenPdf" @click="$emit('open-pdf-editor')">
            <template #leading><IconExternalLink :size="14"/></template> {{ t('Open in Editor') }}
          </UiButton>
          <UiButton variant="secondary" size="sm" :disabled="!canOpenPdf" @click="$emit('reveal-pdf')">
            <template #leading><IconFolder :size="14"/></template> Finder
          </UiButton>
          <ExtensionActionButtons
            v-if="canOpenPdf"
            surface="reference.pdf.actions"
            :target="pdfExtensionActionTarget"
          />
          <UiButton variant="secondary" size="sm" @click="$emit('attach-pdf')">
            <template #leading><IconRefresh :size="14"/></template> {{ t('Replace') }}
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  IconExternalLink,
  IconFileText,
  IconFolder,
  IconRefresh,
  IconX,
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import ExtensionActionButtons from '../extensions/ExtensionActionButtons.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'

defineEmits([
  'add-tag',
  'attach-pdf',
  'blur-field',
  'blur-tag-input',
  'focus-field',
  'open-pdf-editor',
  'preview-pdf',
  'remove-collection',
  'remove-tag',
  'reveal-pdf',
  'tag-keydown',
  'update-field',
  'update-tag-input',
])

defineProps({
  canOpenPdf: { type: Boolean, default: false },
  collectionLabel: { type: Function, required: true },
  draft: { type: Object, required: true },
  pdfExtensionActionTarget: { type: Object, default: () => ({}) },
  tagInput: { type: String, default: '' },
})

const { t } = useI18n()
</script>

<style scoped>
.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inspector-section--metadata {
  gap: 0;
}

.inspector-kv-grid {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  row-gap: 3px;
  column-gap: 12px;
  align-items: center;
}

.kv-label {
  text-align: left;
  font-size: 12px;
  color: var(--text-muted);
  user-select: none;
  white-space: nowrap;
}

.kv-label.align-top {
  align-self: flex-start;
  margin-top: 0;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.kv-value {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.kv-value--file-actions {
  align-items: flex-start;
  overflow: visible;
}

.kv-value--inline-triple {
  display: flex;
  align-items: center;
  gap: 6px;
}

.triple-cell {
  flex: 0 1 42px;
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

.token-area {
  flex-direction: column;
  align-items: flex-start;
  align-self: flex-start;
  gap: 4px;
  min-height: 24px;
  overflow: visible;
}

.token-area--readonly {
  justify-content: center;
}

.token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

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

.inspector-file-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.inspector-file-actions :deep(.ui-button) {
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

:deep(.ui-input-shell--ghost) {
  padding-inline: 0 !important;
  margin-inline: 0;
}

:deep(.ui-input-shell--ghost:focus-within) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 68%, transparent);
}

:deep(.ui-input-shell--sm) {
  min-height: 24px;
}

:deep(.ui-input-shell--ghost .ui-input-control) {
  color: var(--text-primary);
}
</style>
