<template>
  <section class="research-note-card" :class="{ 'research-note-card-active': isActive }">
    <div class="research-note-card-header">
      <div>
        <div class="research-note-card-title">{{ t('Research note') }}</div>
        <div class="research-note-card-meta">
          {{ sourceLabel }}
        </div>
      </div>
      <div v-if="insertedLabel" class="research-note-card-status">
        {{ insertedLabel }}
      </div>
    </div>

    <div class="research-note-card-quote">
      {{ note.quote }}
    </div>

    <UiTextarea
      v-model="draftComment"
      class="research-note-card-textarea"
      rows="3"
      :placeholder="t('Add a note about why this quote matters...')"
      @blur="flushComment"
      @keydown.enter.meta.prevent="emit('insert')"
      @keydown.enter.ctrl.prevent="emit('insert')"
    />

    <div class="research-note-card-actions">
      <UiButton
        type="button"
        class="research-note-card-primary"
        variant="primary"
        size="sm"
        @click="emit('insert')"
      >
        {{ t('Insert into manuscript') }}
      </UiButton>
      <UiButton
        type="button"
        class="research-note-card-secondary"
        variant="danger"
        size="sm"
        @click="emit('delete')"
      >
        {{ t('Delete note') }}
      </UiButton>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

const props = defineProps({
  note: { type: Object, required: true },
  annotation: { type: Object, default: null },
  isActive: { type: Boolean, default: false },
})

const emit = defineEmits(['update-comment', 'insert', 'delete'])

const { t } = useI18n()
const draftComment = ref(props.note?.comment || '')

watch(
  () => props.note?.comment,
  (value) => {
    draftComment.value = value || ''
  }
)

const sourceLabel = computed(() => {
  const parts = []
  const page = Number(props.annotation?.page || props.note?.sourceRef?.page || 0)
  if (Number.isInteger(page) && page > 0) {
    parts.push(t('Page {page}', { page }))
  }
  const referenceKey = props.annotation?.referenceKey || props.note?.sourceRef?.referenceKey || null
  if (referenceKey) {
    parts.push(`[@${referenceKey}]`)
  }
  return parts.join(' | ') || t('Linked note')
})

const insertedLabel = computed(() => {
  const targetPath = props.note?.insertedInto?.path
  if (!targetPath) return ''
  const name = targetPath.split('/').pop() || targetPath
  return t('Inserted into {name}', { name })
})

function flushComment() {
  if ((props.note?.comment || '') === draftComment.value) return
  emit('update-comment', draftComment.value)
}
</script>

<style scoped>
.research-note-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 86%, var(--bg-secondary));
}

.research-note-card-active {
  border-color: color-mix(in srgb, var(--accent) 24%, transparent);
}

.research-note-card-header,
.research-note-card-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.research-note-card-title {
  font-size: var(--ui-font-caption);
  font-weight: 700;
  color: var(--fg-primary);
}

.research-note-card-meta,
.research-note-card-status {
  color: var(--fg-muted);
  font-size: var(--ui-font-micro);
}

.research-note-card-quote {
  color: var(--fg-secondary);
  font-size: var(--ui-font-caption);
  line-height: 1.45;
}

.research-note-card-textarea {
  width: 100%;
  font-size: var(--ui-font-caption);
}

.research-note-card-textarea :deep(.ui-textarea-control) {
  min-height: 64px;
  line-height: 1.45;
}

.research-note-card-primary,
.research-note-card-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-font-caption);
}
</style>
