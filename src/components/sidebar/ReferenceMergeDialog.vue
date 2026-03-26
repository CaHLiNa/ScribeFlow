<template>
  <UiModalShell
    visible
    close-on-backdrop
    :body-padding="false"
    overlay-class="ref-merge-overlay"
    surface-class="ref-merge-modal"
    :surface-style="{ width: 'min(980px, calc(100vw - 48px))', maxHeight: 'min(82vh, 920px)' }"
    @close="$emit('close')"
  >
    <template #header>
      <div class="ref-merge-header">
        <div>
          <div class="ref-merge-title">{{ t('Merge Duplicate Reference') }}</div>
          <div class="ref-merge-subtitle">
            {{
              t(
                'Review each field and choose whether to keep the current library value or use the imported value.'
              )
            }}
          </div>
        </div>
        <UiButton
          variant="ghost"
          size="icon-sm"
          icon-only
          :title="t('Close pane')"
          :aria-label="t('Close pane')"
          @click="$emit('close')"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </UiButton>
      </div>
    </template>

    <div class="ref-merge-body">
      <div class="ref-merge-summary">
        <span class="ref-merge-chip">{{ duplicateLabel }}</span>
        <span v-if="item?.existingKey" class="ref-merge-chip">{{
          t('Matches existing reference @{key}', { key: item.existingKey })
        }}</span>
        <span v-if="item?.matchReason" class="ref-merge-chip">{{
          matchReasonLabel(item.matchReason)
        }}</span>
      </div>

      <div v-if="fieldRows.length > 0" class="ref-merge-fields">
        <section v-for="field in fieldRows" :key="field.key" class="ref-merge-field">
          <div class="ref-merge-field-top">
            <div class="ref-merge-field-label">{{ field.label }}</div>
            <div class="ref-merge-toggle">
              <UiButton
                class="ref-merge-toggle-btn"
                :active="selections[field.key] === 'existing'"
                variant="secondary"
                size="sm"
                @click="selectField(field.key, 'existing')"
              >
                {{ t('Keep current') }}
              </UiButton>
              <UiButton
                class="ref-merge-toggle-btn"
                :active="selections[field.key] === 'incoming'"
                variant="secondary"
                size="sm"
                @click="selectField(field.key, 'incoming')"
              >
                {{ t('Use imported') }}
              </UiButton>
            </div>
          </div>

          <div class="ref-merge-values">
            <div
              class="ref-merge-value"
              :class="{ 'ref-merge-value-active': selections[field.key] === 'existing' }"
            >
              <div class="ref-merge-value-label">{{ t('Current library value') }}</div>
              <div class="ref-merge-value-text">{{ field.existingDisplay || t('No value') }}</div>
            </div>
            <div
              class="ref-merge-value"
              :class="{ 'ref-merge-value-active': selections[field.key] === 'incoming' }"
            >
              <div class="ref-merge-value-label">{{ t('Imported value') }}</div>
              <div class="ref-merge-value-text">{{ field.incomingDisplay || t('No value') }}</div>
            </div>
          </div>
        </section>
      </div>

      <div v-else class="ref-merge-empty">
        {{ t('No differing fields found.') }}
      </div>

      <div class="ref-merge-footer">
        <UiButton
          v-if="item?.existingKey"
          variant="secondary"
          size="sm"
          @click="$emit('view-existing', item.existingKey)"
        >
          {{ t('View') }}
        </UiButton>
        <div class="ref-merge-footer-spacer"></div>
        <UiButton variant="secondary" size="sm" @click="$emit('close')">
          {{ t('Cancel') }}
        </UiButton>
        <UiButton variant="primary" size="sm" @click="$emit('confirm', { ...selections })">
          {{ t('Merge into library') }}
        </UiButton>
      </div>
    </div>
  </UiModalShell>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiModalShell from '../shared/ui/UiModalShell.vue'

const FIELD_PRIORITY = [
  'title',
  'author',
  'issued',
  'type',
  'container-title',
  'DOI',
  'URL',
  'abstract',
  'publisher',
  'volume',
  'issue',
  'page',
]

const FIELD_LABELS = {
  title: 'Title',
  author: 'Authors',
  issued: 'Year',
  type: 'Reference Type',
  'container-title': 'Journal / Conference',
  DOI: 'DOI',
  URL: 'URL',
  abstract: 'Abstract',
  publisher: 'Publisher',
  volume: 'Vol',
  issue: 'Issue',
  page: 'Pages',
}

const props = defineProps({
  item: { type: Object, default: null },
  existingRef: { type: Object, default: null },
})

defineEmits(['close', 'confirm', 'view-existing'])

const { t } = useI18n()
const selections = ref({})

const duplicateLabel = computed(() =>
  props.item?.matchType === 'strong' ? t('Strong duplicate') : t('Possible duplicate')
)

const fieldRows = computed(() => {
  const existing = props.existingRef || {}
  const incoming = props.item?.csl || {}
  const fieldKeys = Array.from(
    new Set([...Object.keys(existing), ...Object.keys(incoming)])
  ).filter((field) => field && field !== 'id' && field !== '_key' && !field.startsWith('_'))

  return fieldKeys
    .map((key) => {
      const existingRaw = existing[key]
      const incomingRaw = incoming[key]
      const existingDisplay = formatFieldValue(key, existingRaw)
      const incomingDisplay = formatFieldValue(key, incomingRaw)
      if (existingDisplay === incomingDisplay) return null
      return {
        key,
        label: t(FIELD_LABELS[key] || key),
        existingRaw,
        incomingRaw,
        existingDisplay,
        incomingDisplay,
      }
    })
    .filter(Boolean)
    .sort((a, b) => sortFieldKeys(a.key, b.key))
})

watch(
  fieldRows,
  (rows) => {
    const nextSelections = {}
    for (const row of rows) {
      nextSelections[row.key] =
        !hasValue(row.existingRaw) && hasValue(row.incomingRaw) ? 'incoming' : 'existing'
    }
    selections.value = nextSelections
  },
  { immediate: true }
)

function selectField(key, value) {
  selections.value = {
    ...selections.value,
    [key]: value,
  }
}

function sortFieldKeys(a, b) {
  const aIndex = FIELD_PRIORITY.indexOf(a)
  const bIndex = FIELD_PRIORITY.indexOf(b)
  if (aIndex !== -1 || bIndex !== -1) {
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  }
  return a.localeCompare(b)
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value !== null && value !== undefined && value !== ''
}

function formatFieldValue(key, value) {
  if (!hasValue(value)) return ''
  if (key === 'author' && Array.isArray(value)) {
    return value
      .map((author) => [author.family, author.given].filter(Boolean).join(', '))
      .filter(Boolean)
      .join('; ')
  }
  if (key === 'issued') {
    return String(value?.['date-parts']?.[0]?.[0] || '')
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function matchReasonLabel(reason) {
  return (
    {
      doi: t('Exact DOI match'),
      'title-author-year': t('Title, first author, and year match'),
    }[reason] || reason
  )
}
</script>

<style scoped>
.ref-merge-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(6, 8, 15, 0.48);
  backdrop-filter: blur(10px);
}

.ref-merge-modal {
  width: min(980px, calc(100vw - 48px));
  max-height: min(82vh, 920px);
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary));
  box-shadow: 0 36px 90px rgba(0, 0, 0, 0.34);
}

.ref-merge-header,
.ref-merge-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ref-merge-header {
  padding: 18px 18px 0;
}

.ref-merge-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--fg-primary);
}

.ref-merge-subtitle {
  margin-top: 4px;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.ref-merge-body {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  min-height: 0;
  padding: 0 18px 18px;
}

.ref-merge-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ref-merge-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: var(--ui-font-micro);
  color: var(--fg-secondary);
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary));
}

.ref-merge-fields {
  overflow: auto;
  display: grid;
  gap: 12px;
  padding-right: 2px;
}

.ref-merge-field {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 80%, var(--bg-secondary));
}

.ref-merge-field-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ref-merge-field-label {
  font-size: var(--ui-font-caption);
  font-weight: 700;
  color: var(--fg-primary);
}

.ref-merge-toggle {
  display: inline-flex;
  gap: 6px;
}

.ref-merge-toggle-btn {
  min-width: 112px;
}

.ref-merge-toggle-btn.is-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.ref-merge-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ref-merge-value {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-primary));
}

.ref-merge-value-active {
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.ref-merge-value-label {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.ref-merge-value-text {
  font-size: var(--ui-font-caption);
  color: var(--fg-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ref-merge-empty {
  padding: 16px;
  border-radius: 14px;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  border: 1px dashed color-mix(in srgb, var(--border) 86%, transparent);
}

.ref-merge-footer-spacer {
  flex: 1;
}

@media (max-width: 860px) {
  .ref-merge-values {
    grid-template-columns: 1fr;
  }

  .ref-merge-field-top,
  .ref-merge-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .ref-merge-footer-spacer {
    display: none;
  }
}
</style>
