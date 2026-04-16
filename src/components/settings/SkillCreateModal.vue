<template>
  <UiModalShell :visible="visible" size="md" @close="$emit('close')">
    <template #header>
      <div class="skill-create-modal__header">
        <h3 class="skill-create-modal__title">{{ title || t('Create skill') }}</h3>
      </div>
    </template>

    <div class="skill-create-modal__body">
      <label class="skill-create-modal__field">
        <span class="skill-create-modal__label">{{ t('Scope') }}</span>
        <UiSelect
          :model-value="scope"
          size="md"
          :options="scopeOptions"
          :disabled="disableScope"
          @update:model-value="$emit('update:scope', $event)"
        />
      </label>

      <label class="skill-create-modal__field">
        <span class="skill-create-modal__label">{{ t('Skill name') }}</span>
        <UiInput
          :model-value="name"
          size="md"
          :placeholder="t('e.g. academic-researcher')"
          @update:model-value="$emit('update:name', $event)"
        />
      </label>

      <label class="skill-create-modal__field">
        <span class="skill-create-modal__label">{{ t('Description') }}</span>
        <UiInput
          :model-value="description"
          size="md"
          :placeholder="t('Short summary of what this skill does')"
          @update:model-value="$emit('update:description', $event)"
        />
      </label>

      <label class="skill-create-modal__field skill-create-modal__field--grow">
        <span class="skill-create-modal__label">{{ t('Skill content') }}</span>
        <UiTextarea
          :model-value="content"
          :rows="14"
          monospace
          :placeholder="t('Write your prompt instructions here...')"
          @update:model-value="$emit('update:content', $event)"
        />
      </label>
    </div>

    <template #footer>
      <div class="skill-create-modal__footer">
        <UiButton variant="ghost" size="md" @click="$emit('close')">
          {{ t('Cancel') }}
        </UiButton>
        <UiButton variant="primary" size="md" :disabled="!canSubmit" @click="$emit('submit')">
          {{ submitLabel || t('Create skill') }}
        </UiButton>
      </div>
    </template>
  </UiModalShell>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiModalShell from '../shared/ui/UiModalShell.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  submitLabel: { type: String, default: '' },
  scope: { type: String, default: 'workspace' },
  disableScope: { type: Boolean, default: false },
  name: { type: String, default: '' },
  description: { type: String, default: '' },
  content: { type: String, default: '' },
})

defineEmits([
  'close',
  'submit',
  'update:scope',
  'update:name',
  'update:description',
  'update:content',
])

const { t } = useI18n()

const scopeOptions = [
  { value: 'workspace', label: t('Workspace scope') },
  { value: 'user', label: t('User scope') },
]

const canSubmit = computed(() => String(props.name || '').trim().length > 0)
</script>

<style scoped>
.skill-create-modal__header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
}

.skill-create-modal__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.skill-create-modal__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
}

.skill-create-modal__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skill-create-modal__field--grow {
  flex: 1;
}

.skill-create-modal__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.skill-create-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  background: color-mix(in srgb, var(--panel-muted) 30%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
}
</style>
