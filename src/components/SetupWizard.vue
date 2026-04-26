<template>
  <UiModalShell
    :visible="visible"
    size="md"
    :body-padding="false"
    surface-class="wizard-modal"
    body-class="wizard-modal-body"
    @close="emit('close')"
  >
    <div class="wizard-step">
      <div class="wizard-brand">
        <img src="/icon.png" alt="" class="wizard-icon" draggable="false" />
        <div class="wizard-wordmark">ScribeFlow</div>
      </div>

      <h2 class="wizard-step-title">{{ t('Choose a theme for your Markdown and LaTeX workspace') }}</h2>
      <p class="wizard-step-hint">
        {{ t('This build focuses on local Markdown and LaTeX writing.') }}
      </p>
      <p class="wizard-step-hint wizard-step-hint-secondary">
        {{ t('You can change this any time in Settings.') }}
      </p>

      <div class="wizard-theme-grid">
        <button
          v-for="theme in themes"
          :key="theme.id"
          class="wizard-theme-card"
          :class="{ active: selectedTheme === theme.id }"
          @click="selectTheme(theme.id)"
        >
          <div class="wizard-theme-preview" :style="{ background: theme.colors.bgPrimary }">
            <div class="wizard-theme-sidebar" :style="{ background: theme.colors.bgSecondary }"></div>
            <div class="wizard-theme-editor">
              <div
                class="wizard-theme-line"
                :style="{ background: theme.colors.fgMuted, width: '60%' }"
              ></div>
              <div
                class="wizard-theme-line"
                :style="{ background: theme.colors.accent, width: '45%' }"
              ></div>
              <div
                class="wizard-theme-line"
                :style="{ background: theme.colors.fgMuted, width: '70%' }"
              ></div>
              <div
                class="wizard-theme-line"
                :style="{ background: theme.colors.accentSecondary, width: '35%' }"
              ></div>
            </div>
          </div>
          <div class="wizard-theme-label">{{ t(theme.label) }}</div>
          <div class="wizard-theme-description">{{ t(theme.description) }}</div>
        </button>
      </div>

      <div class="wizard-nav">
        <UiButton variant="primary" size="md" @click="finish">
          {{ t('Start Writing') }}
        </UiButton>
      </div>
    </div>
  </UiModalShell>
</template>

<script setup>
import { ref } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
import { useI18n } from '../i18n'
import { WORKSPACE_THEME_OPTIONS } from '../shared/workspaceThemeOptions.js'
import UiButton from './shared/ui/UiButton.vue'
import UiModalShell from './shared/ui/UiModalShell.vue'

defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const workspace = useWorkspaceStore()
const { t } = useI18n()
const selectedTheme = ref(workspace.theme || 'system')
const themes = WORKSPACE_THEME_OPTIONS

function selectTheme(id) {
  selectedTheme.value = id
  workspace.setTheme(id)
}

async function finish() {
  await workspace.completeSetupWizard()
  emit('close')
}
</script>

<style scoped>
:deep(.wizard-modal) {
  width: 520px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.wizard-step {
  padding: 28px 36px 32px;
}

.wizard-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
}

.wizard-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
}

.wizard-wordmark {
  font-family: var(--font-display);
  font-size: var(--ui-font-hero-md);
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--fg-primary);
}

.wizard-step-title {
  margin: 0 0 16px;
  font-size: var(--ui-font-title);
  font-weight: 500;
  color: var(--fg-secondary);
}

.wizard-step-hint {
  margin: 0 0 8px;
  font-size: var(--ui-font-label);
  color: var(--fg-muted);
}

.wizard-step-hint-secondary {
  margin-bottom: 16px;
}

.wizard-theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.wizard-theme-card {
  border: 2px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.15s ease;
}

.wizard-theme-card:hover {
  border-color: var(--fg-muted);
  transform: translateY(-1px);
}

.wizard-theme-card.active {
  border-color: var(--accent);
}

.wizard-theme-preview {
  display: flex;
  height: 48px;
  margin-bottom: 4px;
  overflow: hidden;
  border-radius: 4px;
}

.wizard-theme-sidebar {
  width: 22%;
}

.wizard-theme-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 5px 6px;
}

.wizard-theme-line {
  height: 2.5px;
  border-radius: 1px;
  opacity: 0.7;
}

.wizard-theme-label {
  margin-bottom: 4px;
  font-size: var(--ui-font-caption);
  font-weight: 500;
  color: var(--fg-primary);
}

.wizard-theme-description {
  font-size: var(--ui-font-micro);
  line-height: 1.45;
  color: var(--fg-muted);
}

.wizard-nav {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

@media (max-width: 760px) {
  :deep(.wizard-modal) {
    width: min(92vw, 520px);
  }

  .wizard-step {
    padding: 24px 20px 24px;
  }

  .wizard-theme-grid {
    grid-template-columns: 1fr;
  }
}
</style>
