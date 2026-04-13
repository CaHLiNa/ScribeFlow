<template>
  <div class="workspace-starter" data-surface-context-guard="true">
    <div class="workspace-starter-shell">
      <div class="workspace-starter-stage">
        <div class="workspace-starter-copy" :class="{ 'is-empty-state': !hasWorkspace }">
          <div class="workspace-starter-kicker">
            {{ hasWorkspace ? t('New draft') : t('Ready to start') }}
          </div>
          <h1 class="workspace-starter-title">
            {{ hasWorkspace ? t('Choose Markdown or LaTeX') : t('Open a folder to start') }}
          </h1>
          <p class="workspace-starter-subtitle">
            {{
              hasWorkspace
                ? t('Start with a note or article shell in this pane.')
                : t(
                    'Altals works with local project folders. Open one first, then create a Markdown note or LaTeX draft.'
                  )
            }}
          </p>
        </div>

        <UiButton
          v-if="!hasWorkspace"
          type="button"
          variant="primary"
          size="lg"
          class="workspace-starter-open-folder"
          @click="openFolder"
        >
          {{ t('Open Folder') }}
        </UiButton>

        <div v-if="!hasWorkspace" class="workspace-starter-secondary-label">
          {{ t('Then create') }}
        </div>

        <div class="workspace-starter-actions" :class="{ 'is-preview-state': !hasWorkspace }">
          <UiButton
            v-for="template in templates"
            :key="template.id"
            type="button"
            variant="secondary"
            size="lg"
            content-mode="raw"
            class="workspace-starter-action"
            :class="{ 'is-preview-state': !hasWorkspace }"
            :disabled="!hasWorkspace"
            @click="createTemplateDraft(template)"
          >
            <span class="workspace-starter-action-main">
              <span class="workspace-starter-action-label">{{ template.label }}</span>
              <span class="workspace-starter-action-description">{{ template.description }}</span>
              <span class="workspace-starter-action-meta">{{ template.ext }}</span>
            </span>
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  paneId: { type: String, default: '' },
})

const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const hasWorkspace = computed(() => !!workspace.path)
const templates = computed(() => listWorkspaceDocumentTemplates(t))

async function createTemplateDraft(template) {
  if (!hasWorkspace.value) return
  if (props.paneId) editorStore.setActivePane(props.paneId)
  window.dispatchEvent(
    new CustomEvent('app:begin-new-file', {
      detail: {
        ext: template.ext,
        suggestedName: template.filename,
        initialContent: template.content,
      },
    })
  )
}

function openFolder() {
  window.dispatchEvent(new CustomEvent('app:open-folder'))
}
</script>

<style scoped>
.workspace-starter {
  display: flex;
  height: 100%;
  background: transparent;
  container-type: inline-size;
}

.workspace-starter-shell {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}

.workspace-starter-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  width: min(100%, 560px);
}

.workspace-starter-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.workspace-starter-copy.is-empty-state {
  gap: 12px;
}

.workspace-starter-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
  opacity: 0.9;
}

.workspace-starter-title {
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif;
  font-size: clamp(2rem, 4.2cqi, 3.1rem);
  font-weight: 600;
  line-height: 0.98;
  letter-spacing: -0.05em;
  color: var(--text-primary);
}

.workspace-starter-copy.is-empty-state .workspace-starter-title {
  font-size: clamp(1.8rem, 3.6cqi, 2.8rem);
  line-height: 1.03;
  letter-spacing: -0.045em;
}

.workspace-starter-subtitle {
  margin: 0;
  max-width: 36ch;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.workspace-starter-open-folder {
  min-width: 184px;
}

.workspace-starter-secondary-label {
  margin-top: -6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  opacity: 0.8;
}

.workspace-starter-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  width: 100%;
}

.workspace-starter-actions.is-preview-state {
  gap: 12px;
}

.workspace-starter-action {
  min-height: 132px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--shell-border) 36%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--shell-surface) 78%, transparent);
  box-shadow: none;
}

.workspace-starter-action:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--shell-border) 62%, transparent);
  background: color-mix(in srgb, var(--shell-surface) 90%, transparent);
}

.workspace-starter-action.is-preview-state {
  min-height: 118px;
  border-color: color-mix(in srgb, var(--shell-border) 22%, transparent);
  background: color-mix(in srgb, var(--shell-surface) 50%, transparent);
  opacity: 0.78;
  box-shadow: none;
}

.workspace-starter-action-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 22px;
  box-sizing: border-box;
}

.workspace-starter-action-label {
  font-size: 1.08rem;
  line-height: 1.2;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-starter-action-description {
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.workspace-starter-action-meta {
  margin-top: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.8rem;
  line-height: 1.2;
  color: var(--text-muted);
}

.workspace-starter-action.is-preview-state .workspace-starter-action-description,
.workspace-starter-action.is-preview-state .workspace-starter-action-meta {
  color: color-mix(in srgb, var(--text-muted) 84%, transparent);
}

@container (max-width: 720px) {
  .workspace-starter-shell {
    padding: 24px 16px;
  }

  .workspace-starter-stage {
    gap: 22px;
  }

  .workspace-starter-actions {
    grid-template-columns: 1fr;
  }

  .workspace-starter-action {
    min-height: 112px;
    border-radius: 20px;
  }
}
</style>
