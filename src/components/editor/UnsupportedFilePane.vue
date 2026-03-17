<template>
  <div class="unsupported-file-root">
    <div class="unsupported-file-card">
      <div class="unsupported-file-badge">{{ t('Legacy file') }}</div>
      <div class="unsupported-file-title">{{ fileName }}</div>
      <div class="unsupported-file-copy">
        {{ t('DOCX support has been removed from Altals.') }}
      </div>
      <div class="unsupported-file-copy unsupported-file-copy-muted">
        {{ t('This legacy Word document can stay in your workspace, but it can no longer be opened, edited, or reviewed inside Altals.') }}
      </div>
      <div class="unsupported-file-copy unsupported-file-copy-muted">
        {{ t('Open it in an external app if you still need to work with it.') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
})

const { t } = useI18n()
const fileName = computed(() => props.filePath.split('/').pop() || props.filePath)
</script>

<style scoped>
.unsupported-file-root {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  background: var(--bg-secondary);
}

.unsupported-file-card {
  width: min(560px, 100%);
  padding: 24px 26px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
}

.unsupported-file-badge {
  margin-bottom: 10px;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.unsupported-file-title {
  margin-bottom: 14px;
  color: var(--fg-primary);
  font-size: var(--ui-font-title);
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
}

.unsupported-file-copy {
  color: var(--fg-secondary);
  font-size: var(--ui-font-body);
  line-height: 1.7;
}

.unsupported-file-copy + .unsupported-file-copy {
  margin-top: 10px;
}

.unsupported-file-copy-muted {
  color: var(--fg-muted);
}
</style>
