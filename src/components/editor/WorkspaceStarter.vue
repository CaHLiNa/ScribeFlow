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
  gap: 24px;
  width: min(100%, 520px); /* 略微收紧宽度 */
}

.workspace-starter-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.workspace-starter-copy.is-empty-state {
  gap: 12px;
}

.workspace-starter-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.workspace-starter-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 26px; /* 固定原生字号，去除浮夸的流式缩放 */
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.workspace-starter-copy.is-empty-state .workspace-starter-title {
  font-size: 28px;
}

.workspace-starter-subtitle {
  margin: 0;
  max-width: 36ch;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.workspace-starter-open-folder {
  min-width: 160px;
}

.workspace-starter-secondary-label {
  margin-top: -4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.workspace-starter-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.workspace-starter-action {
  min-height: 100px; /* 降低高度 */
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px; /* 从 24px 收紧到原生的 8px */
  background: var(--surface-base);
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  transition: all 0.15s ease;
}

.workspace-starter-action:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: var(--surface-hover);
}

.workspace-starter-action.is-preview-state {
  min-height: 90px;
  background: transparent;
  border-color: color-mix(in srgb, var(--border) 60%, transparent);
  opacity: 0.8;
}

.workspace-starter-action-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.workspace-starter-action-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-starter-action-description {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
  text-align: left;
}

.workspace-starter-action-meta {
  margin-top: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

@container (max-width: 720px) {
  .workspace-starter-shell {
    padding: 24px 16px;
  }

  .workspace-starter-stage {
    gap: 20px;
  }

  .workspace-starter-actions {
    grid-template-columns: 1fr;
  }

  .workspace-starter-action {
    min-height: 80px;
  }
}
</style>
