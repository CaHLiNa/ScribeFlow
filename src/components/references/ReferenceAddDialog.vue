<template>
  <UiModalShell
    :visible="visible"
    size="md"
    @close="emit('close')"
  >
    <template #header>
      <div class="reference-add-dialog__header">
        <div>
          <div class="reference-add-dialog__title">{{ t('Add Reference') }}</div>
          <div class="reference-add-dialog__subtitle">
            {{ t('Paste DOI, BibTeX, RIS, CSL-JSON, or plain citation text.') }}
          </div>
        </div>
      </div>
    </template>

    <div class="reference-add-dialog__body">
      <UiTextarea
        v-model="inputText"
        :rows="7"
        :placeholder="t('Paste DOI, BibTeX, RIS, CSL-JSON, or plain citation text.')"
        shell-class="reference-add-dialog__textarea"
      />

      <div v-if="errorMessage" class="reference-add-dialog__error">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="reference-add-dialog__success">
        {{ successMessage }}
      </div>
    </div>

    <template #footer>
      <div class="reference-add-dialog__footer">
        <UiButton variant="ghost" size="sm" @click="emit('close')">
          {{ t('Cancel') }}
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          :disabled="!canImport"
          :loading="loading"
          @click="handleImport"
        >
          {{ t('Add Reference') }}
        </UiButton>
      </div>
    </template>
  </UiModalShell>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import UiButton from '../shared/ui/UiButton.vue'
import UiModalShell from '../shared/ui/UiModalShell.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'imported'])

const { t } = useI18n()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()

const inputText = ref('')
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const canImport = computed(() => String(inputText.value || '').trim().length > 0 && !loading.value)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      inputText.value = ''
      loading.value = false
      errorMessage.value = ''
      successMessage.value = ''
    }
  }
)

async function handleImport() {
  if (!canImport.value) return

  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const importedCount = await referencesStore.importResolvedReferenceText(
      workspace.globalConfigDir,
      inputText.value
    )

    if (importedCount > 0) {
      successMessage.value = t('Imported {count} references', { count: importedCount })
      emit('imported', importedCount)
      emit('close')
      return
    }

    errorMessage.value = t('No new references were added')
  } catch (error) {
    errorMessage.value = error?.message || t('Failed to add reference')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.reference-add-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 0;
}

.reference-add-dialog__title {
  color: var(--text-primary);
  font-size: var(--ui-font-body);
  font-weight: var(--workbench-weight-strong);
  line-height: 1.35;
}

.reference-add-dialog__subtitle {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: var(--ui-font-small);
  line-height: 1.5;
}

.reference-add-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reference-add-dialog__textarea {
  width: 100%;
}

.reference-add-dialog__error,
.reference-add-dialog__success {
  font-size: var(--ui-font-small);
  line-height: 1.5;
}

.reference-add-dialog__error {
  color: var(--status-danger-text);
}

.reference-add-dialog__success {
  color: var(--status-success-text);
}

.reference-add-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 16px;
}
</style>
