<template>
  <div class="reference-workbench__content">
    <div class="reference-workbench__table-head">
      <button
        type="button"
        class="reference-workbench__head-button"
        :class="{ 'is-active': isSortActive('title') }"
        @click="$emit('toggle-title-sort')"
      >
        <span>{{ t('Title') }}</span>
        <IconChevronDown
          v-if="isSortActive('title')"
          class="sort-arrow"
          :class="{ 'is-asc': sortKey === 'title-asc' }"
          :size="12"
          :stroke-width="2.5"
        />
      </button>
      <button
        type="button"
        class="reference-workbench__head-button"
        :class="{ 'is-active': isSortActive('author') }"
        @click="$emit('toggle-author-sort')"
      >
        <span>{{ t('Authors') }}</span>
        <IconChevronDown
          v-if="isSortActive('author')"
          class="sort-arrow"
          :class="{ 'is-asc': sortKey === 'author-asc' }"
          :size="12"
          :stroke-width="2.5"
        />
      </button>
      <button
        type="button"
        class="reference-workbench__head-button"
        :class="{ 'is-active': isSortActive('year') }"
        @click="$emit('toggle-year-sort')"
      >
        <span>{{ t('Year') }}</span>
        <IconChevronDown
          v-if="isSortActive('year')"
          class="sort-arrow"
          :class="{ 'is-asc': sortKey === 'year-asc' }"
          :size="12"
          :stroke-width="2.5"
        />
      </button>
      <div class="reference-workbench__head-label">{{ t('Source') }}</div>
    </div>

    <div
      v-for="reference in references"
      :key="reference.id"
      class="reference-workbench__row"
      :class="{ 'is-active': reference.id === selectedReferenceId }"
      @click="$emit('select-reference', reference)"
      @contextmenu.prevent="$emit('open-context-menu', $event, reference)"
    >
      <div class="reference-workbench__cell reference-workbench__cell--title">
        <span class="reference-workbench__title-icon" aria-hidden="true">
          <IconFileText :size="14" :stroke-width="1.8" />
        </span>
        <span class="reference-workbench__truncate">{{ reference.title }}</span>
      </div>
      <div class="reference-workbench__cell">
        <span class="reference-workbench__truncate">{{ getReferenceAuthorLabel(reference) }}</span>
      </div>
      <div class="reference-workbench__cell">
        {{ reference.year || '—' }}
      </div>
      <div class="reference-workbench__cell">
        <span class="reference-workbench__truncate">{{ reference.source || '—' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronDown, IconFileText } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { getReferenceAuthorLabel } from '../../domains/references/referenceDisplayLabels.ts'

defineEmits([
  'open-context-menu',
  'select-reference',
  'toggle-author-sort',
  'toggle-title-sort',
  'toggle-year-sort',
])

const props = defineProps({
  references: { type: Array, default: () => [] },
  selectedReferenceId: { type: [String, Number], default: '' },
  sortKey: { type: String, default: '' },
})

const { t } = useI18n()

function isSortActive(group) {
  return props.sortKey.startsWith(`${group}-`)
}
</script>

<style scoped>
.reference-workbench__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 0 20px;
}

.reference-workbench__table-head,
.reference-workbench__row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 1.35fr) 64px minmax(0, 1.4fr);
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.reference-workbench__table-head {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 28px;
  padding: 0 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: var(--panel-surface);
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  backdrop-filter: blur(20px);
}

.reference-workbench__head-label {
  user-select: none;
}

.reference-workbench__head-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.reference-workbench__head-button:hover {
  color: var(--text-secondary);
}

.reference-workbench__head-button.is-active {
  color: var(--text-primary);
}

.sort-arrow {
  color: var(--text-primary);
  opacity: 0.8;
  transition: transform 0.2s ease;
}

.sort-arrow.is-asc {
  transform: rotate(180deg);
}

.reference-workbench__row {
  min-height: 28px;
  padding: 0 16px;
  border-radius: 4px;
  margin: 1px 0;
  cursor: pointer;
  transition: none;
}

.reference-workbench__row:hover {
  background: var(--sidebar-item-hover);
}

.reference-workbench__row.is-active {
  background: var(--list-active-bg);
  color: var(--list-active-fg) !important;
  box-shadow: none;
}

.reference-workbench__row.is-active .reference-workbench__cell,
.reference-workbench__row.is-active .reference-workbench__title-icon {
  color: var(--list-active-fg) !important;
}

.reference-workbench__cell {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
}

.reference-workbench__cell--title {
  gap: 8px;
  font-weight: 500;
}

.reference-workbench__title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
}

.reference-workbench__truncate {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1200px) {
  .reference-workbench__table-head,
  .reference-workbench__row {
    grid-template-columns: minmax(0, 2.5fr) minmax(0, 1.2fr) 62px minmax(0, 1.2fr);
    gap: 12px;
  }
}
</style>
