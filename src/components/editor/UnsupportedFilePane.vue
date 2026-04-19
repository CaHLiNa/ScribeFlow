<template>
  <div class="unsupported-file-root">
    <div class="unsupported-file-card">
      <div class="unsupported-file-badge">{{ t('Removed surface') }}</div>
      <div class="unsupported-file-title">{{ fileName }}</div>
      <div class="unsupported-file-copy">
        {{ t('ScribeFlow now only opens Markdown and LaTeX documents in the main workspace.') }}
      </div>
      <div class="unsupported-file-copy unsupported-file-copy-muted">
        {{ t('This file can stay in your project, but this trimmed build no longer opens or edits this file type inside ScribeFlow.') }}
      </div>
      <div class="unsupported-file-copy unsupported-file-copy-muted">
        {{ t('Keep it as a project asset or open it in another app when you still need it.') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { basenamePath } from '../../utils/path'

const props = defineProps({
  filePath: { type: String, required: true },
})

const { t } = useI18n()
const fileName = computed(() => basenamePath(props.filePath) || props.filePath)
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
