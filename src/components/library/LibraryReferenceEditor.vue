<template>
  <div v-if="refItem" class="library-ref-editor">
    <div v-if="refItem._needsReview" class="library-ref-editor-banner">
      <span>{{ t('Unverified — review metadata before citing') }}</span>
      <UiButton
        type="button"
        variant="secondary"
        size="sm"
        class="library-ref-editor-banner-button"
        @click="confirmRef"
      >
        {{ t('Confirm') }}
      </UiButton>
    </div>

    <div class="library-ref-editor-meta">
      <span class="library-ref-editor-key">@{{ refItem._key }}</span>
      <div class="library-ref-editor-pdf">
        <span class="library-ref-editor-pdf-label">
          {{ pdfPath ? pdfLabel : t('No PDF attached') }}
        </span>
        <UiButton
          type="button"
          variant="ghost"
          size="sm"
          class="library-ref-editor-link"
          @click="pdfPath ? openPdf() : attachPdf()"
        >
          {{ pdfPath ? t('Open PDF') : t('Attach PDF...') }}
        </UiButton>
      </div>
    </div>

    <section class="library-ref-editor-section">
      <div class="library-ref-editor-grid">
        <label class="library-ref-editor-field is-wide">
          <span class="library-ref-editor-label">{{ t('Title') }}</span>
          <UiInput
            :model-value="refItem.title || ''"
            class="library-ref-editor-input is-title"
            size="md"
            @update:modelValue="update('title', $event)"
          />
        </label>

        <label class="library-ref-editor-field span-2">
          <span class="library-ref-editor-label">{{ t('Citation Key') }}</span>
          <UiInput
            :model-value="refItem._key || ''"
            class="library-ref-editor-input library-ref-editor-input-mono"
            monospace
            size="sm"
            :placeholder="t('Example: Wang2019')"
            @update:modelValue="updateCitationKey($event)"
          />
        </label>

        <label class="library-ref-editor-field span-1">
          <span class="library-ref-editor-label">{{ t('Year') }}</span>
          <UiInput
            :model-value="year"
            class="library-ref-editor-input"
            type="number"
            size="sm"
            @update:modelValue="updateYear($event)"
          />
        </label>

        <label class="library-ref-editor-field span-3">
          <span class="library-ref-editor-label">{{ t('Reference Type') }}</span>
          <UiSelect
            :model-value="refItem.type || 'article-journal'"
            class="library-ref-editor-input library-ref-editor-select"
            size="sm"
            @update:modelValue="update('type', $event)"
          >
            <option value="article-journal">{{ t('Journal Article') }}</option>
            <option value="paper-conference">{{ t('Conference Paper') }}</option>
            <option value="book">{{ t('Book') }}</option>
            <option value="chapter">{{ t('Book Chapter') }}</option>
            <option value="thesis">{{ t('Thesis') }}</option>
            <option value="report">{{ t('Report') }}</option>
            <option value="article">{{ t('Preprint / Article') }}</option>
            <option value="webpage">{{ t('Webpage') }}</option>
          </UiSelect>
        </label>

        <label class="library-ref-editor-field is-wide">
          <span class="library-ref-editor-label">{{ t('Authors') }}</span>
          <UiInput
            :model-value="authorsString"
            class="library-ref-editor-input"
            size="sm"
            :placeholder="t('Last, First and Last, First')"
            @update:modelValue="updateAuthors($event)"
          />
        </label>
      </div>
    </section>

    <section class="library-ref-editor-section">
      <div class="library-ref-editor-grid">
        <label class="library-ref-editor-field span-3">
          <span class="library-ref-editor-label">{{ t('Journal / Conference') }}</span>
          <UiInput
            :model-value="refItem['container-title'] || ''"
            class="library-ref-editor-input"
            size="sm"
            @update:modelValue="update('container-title', $event)"
          />
        </label>

        <label class="library-ref-editor-field span-3">
          <span class="library-ref-editor-label">DOI</span>
          <UiInput
            :model-value="refItem.DOI || ''"
            class="library-ref-editor-input library-ref-editor-input-mono"
            monospace
            size="sm"
            @update:modelValue="update('DOI', $event)"
          />
        </label>

        <label class="library-ref-editor-field span-2">
          <span class="library-ref-editor-label">{{ t('Vol') }}</span>
          <UiInput
            :model-value="refItem.volume || ''"
            class="library-ref-editor-input"
            size="sm"
            @update:modelValue="update('volume', $event)"
          />
        </label>

        <label class="library-ref-editor-field span-2">
          <span class="library-ref-editor-label">{{ t('Issue') }}</span>
          <UiInput
            :model-value="refItem.issue || ''"
            class="library-ref-editor-input"
            size="sm"
            @update:modelValue="update('issue', $event)"
          />
        </label>

        <label class="library-ref-editor-field span-2">
          <span class="library-ref-editor-label">{{ t('Pages') }}</span>
          <UiInput
            :model-value="refItem.page || ''"
            class="library-ref-editor-input"
            size="sm"
            @update:modelValue="update('page', $event)"
          />
        </label>
      </div>
    </section>

    <section class="library-ref-editor-section">
      <div class="library-ref-editor-grid">
        <div class="library-ref-editor-field is-wide">
          <span class="library-ref-editor-label">{{ t('Tags') }}</span>
          <div v-if="(refItem._tags || []).length > 0" class="library-ref-editor-tag-row">
            <span v-for="tag in refItem._tags || []" :key="tag" class="library-ref-editor-tag-chip">
              {{ tag }}
            </span>
          </div>
          <div v-else class="library-ref-editor-muted">
            {{ t('Untagged') }}
          </div>
        </div>

        <label class="library-ref-editor-field is-wide">
          <span class="library-ref-editor-label">{{ t('Abstract') }}</span>
          <UiTextarea
            :model-value="refItem.abstract || ''"
            class="library-ref-editor-textarea"
            :rows="7"
            :placeholder="t('No abstract available.')"
            @update:modelValue="update('abstract', $event)"
          />
        </label>
      </div>
    </section>
  </div>

  <div v-else class="library-ref-editor-empty">
    {{ t('Reference not found') }}
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { useReferencesStore } from '../../stores/references'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../i18n'
import { openReferencePdfInWorkspace } from '../../domains/reference/referenceNavigation'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

const props = defineProps({
  refKey: { type: String, required: true },
})

const referencesStore = useReferencesStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const { t } = useI18n()

const refItem = computed(() => referencesStore.getByKey(props.refKey))
const pdfPath = computed(() => referencesStore.pdfPathForKey(props.refKey))
const pdfLabel = computed(() => pdfPath.value?.split('/').pop() || t('PDF'))

const authorsString = computed(() => {
  if (!refItem.value?.author) return ''
  return refItem.value.author
    .map((author) => (author?.given ? `${author.family}, ${author.given}` : author?.family || ''))
    .filter(Boolean)
    .join(' and ')
})

const year = computed(() => refItem.value?.issued?.['date-parts']?.[0]?.[0] || '')

function update(field, value) {
  if (!refItem.value) return
  referencesStore.updateReference(refItem.value._key, { [field]: value || undefined })
}

function updateCitationKey(value) {
  if (!refItem.value) return

  const oldKey = refItem.value._key
  const result = referencesStore.renameReferenceKey(oldKey, value)
  if (!result?.ok) {
    toastStore.show(t(result?.error || 'Failed to update citation key.'), {
      type: 'error',
      duration: 3600,
    })
  }
}

function updateAuthors(value) {
  if (!refItem.value) return
  const authors = String(value || '')
    .split(/\s+and\s+/i)
    .map((part) => {
      const next = part.trim()
      if (!next) return null
      if (next.includes(',')) {
        const [family, ...rest] = next.split(',')
        return { family: family.trim(), given: rest.join(',').trim() }
      }
      const words = next.split(/\s+/)
      return {
        family: words[words.length - 1],
        given: words.slice(0, -1).join(' '),
      }
    })
    .filter((author) => author?.family)

  referencesStore.updateReference(refItem.value._key, { author: authors })
}

function updateYear(value) {
  if (!refItem.value) return
  const numeric = parseInt(value, 10)
  if (Number.isNaN(numeric)) return
  referencesStore.updateReference(refItem.value._key, {
    issued: { 'date-parts': [[numeric]] },
  })
}

function confirmRef() {
  if (!refItem.value) return
  referencesStore.updateReference(refItem.value._key, { _needsReview: false })
}

function openPdf() {
  openReferencePdfInWorkspace({
    key: props.refKey,
    referencesStore,
    editorStore,
    workspace,
  })
}

async function attachPdf() {
  if (!refItem.value) return
  const selected = await open({
    multiple: false,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!selected) return
  await referencesStore.storePdf(refItem.value._key, selected)
}
</script>

<style scoped>
.library-ref-editor,
.library-ref-editor-empty {
  height: 100%;
}

.library-ref-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 14px 14px;
  overflow: auto;
  background: var(--bg-primary);
}

.library-ref-editor-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--warning) 32%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--warning) 8%, var(--bg-primary));
  color: var(--warning);
  font-size: 11px;
}

.library-ref-editor-banner-button {
  min-height: 24px;
  padding: 0 8px;
  color: var(--warning);
  white-space: nowrap;
}

.library-ref-editor-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.library-ref-editor-key {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--fg-secondary);
  font-size: 11px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.library-ref-editor-pdf {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.library-ref-editor-pdf-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--fg-muted);
}

.library-ref-editor-link {
  color: var(--accent);
  font-size: 11px;
  white-space: nowrap;
}

.library-ref-editor-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.library-ref-editor-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.library-ref-editor-field.is-wide {
  grid-column: 1 / -1;
}

.library-ref-editor-field.span-1 {
  grid-column: span 1;
}

.library-ref-editor-field.span-2 {
  grid-column: span 2;
}

.library-ref-editor-field.span-3 {
  grid-column: span 3;
}

.library-ref-editor-section {
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.library-ref-editor-section:first-of-type {
  padding-top: 0;
  border-top: none;
}

.library-ref-editor-label {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--fg-muted) 92%, var(--fg-primary));
  font-weight: 600;
}

.library-ref-editor-input,
.library-ref-editor-textarea {
  width: 100%;
  min-width: 0;
  font-size: 12px;
}

.library-ref-editor-input {
  min-height: 29px;
}

.library-ref-editor-input.is-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.library-ref-editor-input-mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.library-ref-editor-textarea :deep(.ui-textarea-control) {
  min-height: 120px;
  line-height: 1.55;
}

.library-ref-editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-muted);
  font-size: 12px;
}

.library-ref-editor-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 29px;
  padding-top: 1px;
}

.library-ref-editor-tag-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--fg-secondary);
  font-size: 9px;
  line-height: 1;
}

.library-ref-editor-muted {
  min-height: 29px;
  display: flex;
  align-items: center;
  color: var(--fg-muted);
  font-size: 11px;
}

@media (max-width: 980px) {
  .library-ref-editor-grid {
    grid-template-columns: 1fr;
  }

  .library-ref-editor-field.is-wide,
  .library-ref-editor-field.span-1,
  .library-ref-editor-field.span-2,
  .library-ref-editor-field.span-3 {
    grid-column: auto;
  }
}
</style>
