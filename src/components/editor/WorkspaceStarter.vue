<!-- START OF FILE src/components/editor/WorkspaceStarter.vue -->
<template>
  <div class="workspace-starter" data-surface-context-guard="true">
    <div class="workspace-starter-shell">
      <WorkspaceStarterEmptyState v-if="!hasWorkspace" @open-folder="openFolder" />
      <WorkspaceTemplateGrid
        v-else
        :templates="templates"
        @create-template="createTemplateDraft"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import WorkspaceStarterEmptyState from './WorkspaceStarterEmptyState.vue'
import WorkspaceTemplateGrid from './WorkspaceTemplateGrid.vue'

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
  color: var(--text-primary);
  container-type: inline-size;
  overflow: hidden;
}

.workspace-starter-shell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  position: relative;
  z-index: 1;
}
</style>
