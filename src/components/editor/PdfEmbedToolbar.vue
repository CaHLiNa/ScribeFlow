<template>
  <div class="pdf-artifact-preview__toolbar" data-no-embedpdf-interaction="true">
    <div class="pdf-artifact-preview__toolbar-main">
      <div class="pdf-artifact-preview__toolbar-main-left">
        <UiButton
          variant="ghost"
          size="sm"
          icon-only
          :active="thumbnailsVisible"
          :title="t('Toggle thumbnails')"
          :aria-label="t('Toggle thumbnails')"
          @click="$emit('toggle-thumbnails')"
        >
          <IconLayoutSidebarLeftExpand :size="16" :stroke-width="1.8" />
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          icon-only
          :active="currentSpreadMode === 'single'"
          :title="t('Single page')"
          :aria-label="t('Single page')"
          @click="$emit('set-spread-mode', 'single')"
        >
          <IconRectangleVertical :size="16" :stroke-width="1.8" />
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          icon-only
          :active="currentSpreadMode === 'double'"
          :title="t('Two-page spread')"
          :aria-label="t('Two-page spread')"
          @click="$emit('set-spread-mode', 'double')"
        >
          <IconColumns2 :size="16" :stroke-width="1.8" />
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          icon-only
          :active="searchUiVisible"
          :title="t('Search in PDF')"
          :aria-label="t('Search in PDF')"
          @click="$emit('toggle-search')"
        >
          <IconSearch :size="16" :stroke-width="1.8" />
        </UiButton>
      </div>

      <div class="pdf-artifact-preview__toolbar-main-middle">
        <UiButton variant="ghost" size="sm" :title="t('Zoom out')" @click="$emit('zoom-by', -1)">
          -
        </UiButton>
        <UiSelect
          shell-class="pdf-artifact-preview__toolbar-select"
          size="sm"
          :model-value="zoomMenuValue"
          :options="zoomMenuOptions"
          :aria-label="t('Current zoom')"
          @update:model-value="$emit('select-zoom', $event)"
        />
        <UiButton variant="ghost" size="sm" :title="t('Zoom in')" @click="$emit('zoom-by', 1)">
          +
        </UiButton>
      </div>

      <div class="pdf-artifact-preview__toolbar-main-right">
        <div class="pdf-artifact-preview__toolbar-page-group">
          <input
            :value="pageInputValue"
            class="pdf-artifact-preview__toolbar-page-input"
            :title="t('Page number')"
            :aria-label="t('Page number')"
            inputmode="numeric"
            autocomplete="off"
            @input="$emit('update-page-input', $event.target.value)"
            @keydown.enter.prevent="$emit('submit-page')"
            @blur="$emit('submit-page')"
          />
          <span class="pdf-artifact-preview__toolbar-page-total">
            / {{ totalPageCount }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="searchUiVisible" class="pdf-artifact-preview__toolbar-search">
      <div class="pdf-artifact-preview__search-row">
        <UiButton
          variant="ghost"
          size="sm"
          icon-only
          class="pdf-artifact-preview__search-step"
          :disabled="!hasSearchResults"
          :title="t('Previous result')"
          :aria-label="t('Previous result')"
          @click="$emit('navigate-search', -1)"
        >
          <IconChevronUp :size="14" :stroke-width="1.8" />
        </UiButton>

        <label class="pdf-artifact-preview__search-shell">
          <IconSearch class="pdf-artifact-preview__search-shell-icon" :size="15" :stroke-width="1.8" />
          <input
            ref="searchInputEl"
            :value="searchQuery"
            class="pdf-artifact-preview__search-field"
            :placeholder="t('Search in PDF')"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            @input="$emit('update-search-query', $event.target.value)"
            @keydown.enter.prevent="$emit('search-enter', $event)"
            @keydown.escape.prevent="$emit('search-escape')"
          />
          <span class="pdf-artifact-preview__search-summary">
            {{ searchSummary }}
          </span>
        </label>

        <UiButton
          variant="ghost"
          size="sm"
          icon-only
          class="pdf-artifact-preview__search-step"
          :disabled="!hasSearchResults"
          :title="t('Next result')"
          :aria-label="t('Next result')"
          @click="$emit('navigate-search', 1)"
        >
          <IconChevronDown :size="14" :stroke-width="1.8" />
        </UiButton>
      </div>

      <div class="pdf-artifact-preview__search-row pdf-artifact-preview__search-row--filters">
        <UiButton
          variant="ghost"
          size="sm"
          :active="isMatchCaseEnabled"
          :title="t('Match case')"
          @click="$emit('toggle-search-flag', matchCaseFlag)"
        >
          Aa
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :active="isWholeWordEnabled"
          :title="t('Whole words')"
          @click="$emit('toggle-search-flag', wholeWordFlag)"
        >
          {{ t('Word') }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :active="showAllResults"
          :disabled="!hasSearchResults"
          :title="t('Highlight all')"
          @click="$emit('toggle-show-all-results')"
        >
          {{ t('All') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  IconColumns2,
  IconChevronDown,
  IconChevronUp,
  IconLayoutSidebarLeftExpand,
  IconRectangleVertical,
  IconSearch,
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

defineEmits([
  'navigate-search',
  'search-enter',
  'search-escape',
  'select-zoom',
  'set-spread-mode',
  'submit-page',
  'toggle-search',
  'toggle-search-flag',
  'toggle-show-all-results',
  'toggle-thumbnails',
  'update-page-input',
  'update-search-query',
  'zoom-by',
])

defineProps({
  currentSpreadMode: { type: String, default: 'single' },
  hasSearchResults: { type: Boolean, default: false },
  isMatchCaseEnabled: { type: Boolean, default: false },
  isWholeWordEnabled: { type: Boolean, default: false },
  matchCaseFlag: { type: Number, required: true },
  pageInputValue: { type: String, default: '1' },
  searchQuery: { type: String, default: '' },
  searchSummary: { type: String, default: '' },
  searchUiVisible: { type: Boolean, default: false },
  showAllResults: { type: Boolean, default: false },
  thumbnailsVisible: { type: Boolean, default: false },
  totalPageCount: { type: Number, default: 1 },
  wholeWordFlag: { type: Number, required: true },
  zoomMenuOptions: { type: Array, default: () => [] },
  zoomMenuValue: { type: String, default: '1' },
})

const { t } = useI18n()
const searchInputEl = ref(null)

defineExpose({
  searchInputEl,
})
</script>

<style scoped>
.pdf-artifact-preview__toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 30px;
  padding: 0 6px;
  box-sizing: border-box;
  font: message-box;
  background: color-mix(
    in srgb,
    var(--shell-preview-surface, var(--embedpdf-surface)) 92%,
    var(--surface-base, var(--embedpdf-page))
  );
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 24%, transparent);
  backdrop-filter: saturate(1.02) blur(10px);
}

.pdf-artifact-preview__toolbar-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 30px;
}

.pdf-artifact-preview__toolbar-main-left,
.pdf-artifact-preview__toolbar-main-middle,
.pdf-artifact-preview__toolbar-main-right,
.pdf-artifact-preview__toolbar-search,
.pdf-artifact-preview__toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.pdf-artifact-preview__toolbar-main-left {
  flex: 1 1 0;
  justify-content: flex-start;
}

.pdf-artifact-preview__toolbar-main-middle {
  flex: 0 0 auto;
  justify-content: center;
}

.pdf-artifact-preview__toolbar-main-right {
  flex: 1 1 0;
  justify-content: flex-end;
}

.pdf-artifact-preview__toolbar-page-group,
.pdf-artifact-preview__toolbar-icon-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pdf-artifact-preview__toolbar-page-group {
  gap: 4px;
  margin-inline-end: 2px;
}

.pdf-artifact-preview__toolbar-page-input {
  width: 38px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 24%, transparent);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  outline: 0;
}

.pdf-artifact-preview__toolbar-page-input:focus {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 44%, transparent);
}

.pdf-artifact-preview__toolbar-page-total {
  min-width: 28px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.pdf-artifact-preview__toolbar-search {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 16;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  min-width: 332px;
  max-width: min(430px, calc(100vw - 40px));
  padding: 6px 8px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 28%, transparent);
  background: color-mix(in srgb, var(--surface-raised) 68%, transparent);
  box-shadow:
    0 16px 34px color-mix(in srgb, black 12%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 16%, transparent);
  backdrop-filter: saturate(1.08) blur(18px);
}

.pdf-artifact-preview__search-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pdf-artifact-preview__search-row--filters {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.pdf-artifact-preview__search-shell {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 24%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-base) 60%, transparent),
      color-mix(in srgb, var(--surface-base) 42%, transparent)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 6px 16px color-mix(in srgb, black 6%, transparent);
}

.pdf-artifact-preview__search-shell:focus-within {
  border-color: color-mix(in srgb, var(--focus-ring) 42%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--focus-ring) 24%, transparent),
    0 8px 18px color-mix(in srgb, black 8%, transparent);
}

.pdf-artifact-preview__search-shell-icon {
  color: var(--text-muted);
}

.pdf-artifact-preview__search-field {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  outline: 0;
}

.pdf-artifact-preview__search-field::placeholder {
  color: color-mix(in srgb, var(--text-muted) 76%, transparent);
}

.pdf-artifact-preview__search-summary {
  max-width: 104px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pdf-artifact-preview__search-step {
  width: 24px;
  min-width: 24px;
}

.pdf-artifact-preview__search-row--filters :deep(.ui-button) {
  justify-content: center;
  width: 100%;
  height: 22px;
  border-radius: 8px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--surface-base) 22%, transparent);
}

.pdf-artifact-preview__search-row--filters :deep(.ui-button:hover:not(:disabled)),
.pdf-artifact-preview__search-row--filters :deep(.ui-button.is-active) {
  background: color-mix(in srgb, var(--surface-hover) 18%, transparent);
  color: var(--text-primary);
}

:deep(.ui-button) {
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

:deep(.ui-button:hover:not(:disabled)),
:deep(.ui-button.is-active) {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
  color: var(--text-primary);
}

:deep(.ui-button.is-icon-only) {
  width: 28px;
  padding: 0;
}

:deep(.pdf-artifact-preview__toolbar-select) {
  width: 94px;
  min-width: 94px;
}

:deep(.pdf-artifact-preview__toolbar-select .ui-select-trigger) {
  height: 28px;
  padding: 0 22px 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  box-shadow: none;
}

:deep(.pdf-artifact-preview__toolbar-select .ui-select-trigger:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
}

:deep(.pdf-artifact-preview__toolbar-select .ui-select-trigger:focus-visible) {
  background: color-mix(in srgb, var(--surface-hover) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 44%, transparent);
}

:deep(.pdf-artifact-preview__toolbar-select .ui-select-caret) {
  right: 8px;
}

@media (max-width: 720px) {
  .pdf-artifact-preview__toolbar-main {
    min-height: 54px;
    align-items: flex-start;
    flex-direction: column;
    justify-content: flex-start;
    gap: 2px;
  }

  .pdf-artifact-preview__toolbar-main-left,
  .pdf-artifact-preview__toolbar-main-middle,
  .pdf-artifact-preview__toolbar-main-right {
    width: 100%;
    justify-content: flex-start;
  }

  .pdf-artifact-preview__toolbar-search {
    left: 8px;
    right: 8px;
    transform: none;
    min-width: 0;
    max-width: none;
  }

  .pdf-artifact-preview__search-row {
    grid-template-columns: 24px minmax(0, 1fr) 24px;
    gap: 5px;
  }

  .pdf-artifact-preview__search-row--filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pdf-artifact-preview__search-shell {
    grid-template-columns: 16px minmax(0, 1fr);
  }

  .pdf-artifact-preview__search-summary {
    display: none;
  }
}
</style>
