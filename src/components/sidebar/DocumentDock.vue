<template>
  <section class="document-dock inline-dock" :aria-label="t('Document sidebar')">
    <header v-if="hasDockTabs" class="document-dock__tabbar inline-dock__tabbar">
      <div class="document-dock__tabs inline-dock__tabs" role="tablist" :aria-label="t('Document sidebar')">
        <div
          v-if="hasPreview"
          class="document-dock__preview-tab document-dock__preview-tab--icon inline-dock__tab"
          :class="{ 'is-active': activeDockKey === PREVIEW_DOCK_KEY }"
          role="tab"
          :aria-selected="activeDockKey === PREVIEW_DOCK_KEY"
          :aria-label="documentLabel"
          tabindex="0"
          :title="documentLabel"
          @click="activatePreviewTab"
          @keydown.enter.prevent="activatePreviewTab"
          @keydown.space.prevent="activatePreviewTab"
        >
          <div class="document-dock__preview-label inline-dock__tab-label">
            <component
              :is="previewTabIcon"
              class="document-dock__preview-icon inline-dock__tab-icon"
              :size="15"
              :stroke-width="1.8"
            />
          </div>
          <button
            v-if="activeDockKey === PREVIEW_DOCK_KEY"
            type="button"
            class="document-dock__tab-close inline-dock__tab-close"
            :title="t('Hide preview')"
            :aria-label="t('Hide preview')"
            @click.stop="closePreview"
          >
            <IconX :size="12" :stroke-width="2" />
          </button>
        </div>

        <div
          v-for="tabPath in comparisonTabs"
          :key="tabPath"
          class="document-dock__preview-tab inline-dock__tab"
          :class="{ 'is-active': activeDockKey === fileDockKey(tabPath) }"
          role="tab"
          :aria-selected="activeDockKey === fileDockKey(tabPath)"
          tabindex="0"
          :title="labelForPath(tabPath)"
          @click="activateComparisonTab(tabPath)"
          @keydown.enter.prevent="activateComparisonTab(tabPath)"
          @keydown.space.prevent="activateComparisonTab(tabPath)"
        >
          <div class="document-dock__preview-label inline-dock__tab-label">
            <component
              :is="iconForPath(tabPath)"
              class="document-dock__preview-icon inline-dock__tab-icon"
              :size="15"
              :stroke-width="1.8"
            />
            <span>{{ labelForPath(tabPath) }}</span>
          </div>
          <button
            type="button"
            class="document-dock__tab-close inline-dock__tab-close"
            :title="t('Close tab')"
            :aria-label="t('Close tab')"
            @click.stop="closeComparisonTab(tabPath)"
          >
            <IconX :size="12" :stroke-width="2" />
          </button>
        </div>
      </div>
    </header>

    <div class="document-dock__body inline-dock__body" :class="{ 'is-immersive': usesImmersivePreview }">
      <DocumentDockFileSurface
        v-if="activeComparisonPath"
        :file-path="activeComparisonPath"
        :pane-id="paneId"
        :document-dock-resizing="documentDockResizing"
      />
      <DocumentPreviewDock
        v-else-if="hasPreview"
        :file-path="filePath"
        :pane-id="paneId"
        :preview-state="previewState"
        :compact-pdf-toolbar="usesImmersivePreview"
        :document-dock-resizing="documentDockResizing"
      />
      <div v-else class="document-dock__empty inline-dock__empty">
        {{ t('No preview') }}
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import {
  IconBraces,
  IconBrandCss3,
  IconBrandHtml5,
  IconBrandJavascript,
  IconBrandPython,
  IconBrandTypescript,
  IconBrandVue,
  IconBook2,
  IconDatabase,
  IconFile,
  IconFileCode,
  IconFileText,
  IconFileTypeDoc,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconMath,
  IconNotebook,
  IconPhoto,
  IconSparkles,
  IconTable,
  IconTerminal2,
  IconX,
} from '@tabler/icons-vue'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { useI18n } from '../../i18n'
import { getDocumentWorkflowKind } from '../../services/documentWorkflow/policy.js'
import { getFileIconName } from '../../utils/fileTypes'
import { basenamePath } from '../../utils/path'

const DocumentPreviewDock = defineAsyncComponent(() => import('./DocumentPreviewDock.vue'))
const DocumentDockFileSurface = defineAsyncComponent(() => import('./DocumentDockFileSurface.vue'))

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  previewState: { type: Object, default: null },
  documentDockResizing: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const workflowStore = useDocumentWorkflowStore()
const editorStore = useEditorStore()
const { t } = useI18n()
const PREVIEW_DOCK_KEY = 'preview'
const requestedDockKey = ref('')

const ICON_COMPONENTS = {
  IconFile,
  IconFileText,
  IconBraces,
  IconFileCode,
  IconTerminal2,
  IconBrandJavascript,
  IconBrandTypescript,
  IconBrandPython,
  IconBrandHtml5,
  IconBrandCss3,
  IconBrandVue,
  IconPhoto,
  IconFileTypePdf,
  IconTable,
  IconDatabase,
  IconSparkles,
  IconFileTypeDocx,
  IconFileTypeDoc,
  IconMath,
  IconNotebook,
  IconBook2,
}

const hasPreview = computed(() => props.previewState?.previewVisible === true)
const comparisonTabs = computed(() => editorStore.documentDockTabs || [])
const hasDockTabs = computed(() => hasPreview.value || comparisonTabs.value.length > 0)
const previewMode = computed(() => props.previewState?.previewMode || null)
const previewKind = computed(() => getDocumentWorkflowKind(props.filePath) || 'document')
const documentLabel = computed(() => basenamePath(props.filePath) || props.filePath)
const usesImmersivePreview = computed(
  () =>
    activeDockKey.value === PREVIEW_DOCK_KEY &&
    previewMode.value === 'pdf-artifact' &&
    previewKind.value === 'latex'
)
const previewTabIcon = computed(() => {
  if (previewMode.value === 'pdf-artifact') return IconFileTypePdf
  if (previewMode.value === 'terminal-output') return IconTerminal2
  return IconFileText
})
const activeDockKey = computed(() => {
  const requestedKey = requestedDockKey.value
  if (requestedKey === PREVIEW_DOCK_KEY && hasPreview.value) return PREVIEW_DOCK_KEY

  if (requestedKey.startsWith('file:')) {
    const path = requestedKey.slice('file:'.length)
    if (comparisonTabs.value.includes(path)) return requestedKey
  }

  if (editorStore.activeDocumentDockTab && comparisonTabs.value.includes(editorStore.activeDocumentDockTab)) {
    return fileDockKey(editorStore.activeDocumentDockTab)
  }

  if (hasPreview.value) return PREVIEW_DOCK_KEY
  return comparisonTabs.value.length > 0 ? fileDockKey(comparisonTabs.value[0]) : ''
})
const activeComparisonPath = computed(() => {
  if (!activeDockKey.value.startsWith('file:')) return ''
  return activeDockKey.value.slice('file:'.length)
})

function closePreview() {
  void workflowStore.hideWorkspacePreviewForFile(props.filePath)
  if (comparisonTabs.value.length > 0) {
    requestedDockKey.value = fileDockKey(editorStore.activeDocumentDockTab || comparisonTabs.value[0])
    return
  }
  emit('close')
}

function fileDockKey(path) {
  return `file:${path}`
}

function labelForPath(path) {
  return basenamePath(path) || path
}

function iconForPath(path) {
  return ICON_COMPONENTS[getFileIconName(path)] || IconFile
}

function activatePreviewTab() {
  requestedDockKey.value = PREVIEW_DOCK_KEY
}

function activateComparisonTab(path) {
  editorStore.setActiveDocumentDockFile(path)
  requestedDockKey.value = fileDockKey(path)
}

function closeComparisonTab(path) {
  const onlyComparisonTab = comparisonTabs.value.length === 1 && comparisonTabs.value[0] === path
  editorStore.closeDocumentDockFile(path)
  if (!hasPreview.value && onlyComparisonTab) {
    emit('close')
  }
}

watch(
  () => editorStore.activeDocumentDockTab,
  (path) => {
    if (path && comparisonTabs.value.includes(path)) {
      requestedDockKey.value = fileDockKey(path)
    }
  },
  { flush: 'post', immediate: true }
)
</script>

<style scoped>
.document-dock {
  flex: 0 0 auto;
  width: 100%;
}

.document-dock__preview-tab--icon {
  flex: 0 0 30px;
  justify-content: center;
  width: 30px;
  min-width: 30px;
  max-width: 30px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}

.document-dock__preview-tab--icon .document-dock__preview-label {
  flex: 0 0 auto;
  justify-content: center;
  gap: 0;
}

.document-dock__preview-tab--icon .document-dock__preview-icon {
  opacity: 1;
  transform: none;
}

.document-dock__preview-tab--icon:hover .document-dock__preview-icon,
.document-dock__preview-tab--icon:focus-within .document-dock__preview-icon {
  opacity: 1;
  transform: none;
}

.document-dock__preview-tab--icon .document-dock__tab-close {
  left: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%) scale(0.94);
}

.document-dock__preview-tab--icon:hover .document-dock__tab-close,
.document-dock__preview-tab--icon:focus-within .document-dock__tab-close {
  transform: translate(-50%, -50%) scale(1);
}
</style>
