<template>
  <div class="starter-state-unopened">
    <div class="starter-card">
      <div class="starter-kicker">{{ t('Workspace') }}</div>
      <h1 class="starter-title">{{ t('ScribeFlow Workspace') }}</h1>
      <p class="starter-subtitle">
        {{ t('Open a local project folder to organize your research, references, and documents.') }}
      </p>
      <div class="starter-primary-action">
        <UiButton variant="primary" size="md" @click="$emit('open-folder')">
          {{ t('Open Folder...') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

defineEmits(['open-folder'])

const { t } = useI18n()
</script>

<style scoped>
.starter-state-unopened {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  padding: 32px;
}

.starter-card {
  width: min(100%, 560px);
  padding: 40px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--surface-base) 96%, var(--surface-raised));
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.10);
  text-align: center;
}

.starter-kicker {
  margin-bottom: 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.starter-title {
  margin: 0 0 14px;
  color: var(--text-primary);
  font-size: 34px;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.starter-subtitle {
  margin: 0 auto 28px;
  max-width: 420px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.65;
}

.starter-primary-action {
  display: flex;
  justify-content: center;
}

.starter-primary-action :deep(.ui-button) {
  min-width: 180px;
  min-height: 42px;
  font-size: 14px;
}

@media (max-width: 720px) {
  .starter-state-unopened {
    padding: 20px;
  }

  .starter-card {
    padding: 28px 22px;
    border-radius: 16px;
  }

  .starter-title {
    font-size: 28px;
  }
}
</style>
