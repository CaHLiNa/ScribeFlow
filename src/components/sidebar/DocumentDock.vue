<template>
  <section class="document-dock inline-dock" :aria-label="t('Document sidebar')">
    <InlineDockTabBar
      v-if="hasDockTabs"
      :active-key="activeDockKey"
      :aria-label="t('Document sidebar')"
      :pages="dockPages"
      tabbar-class="document-dock__tabbar"
      tabs-class="document-dock__tabs"
      @activate="activateDockPage"
      @close="closeDockPage"
    />

    <div class="document-dock__body inline-dock__body" :class="{ 'is-immersive': usesImmersivePreview }">
      <component
        :is="activeDockPage?.component"
        v-if="activeDockPage?.component"
        v-bind="activeDockPage?.componentProps || {}"
      />
      <div v-else class="document-dock__empty inline-dock__empty">
        {{ t('No preview') }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'
import {
  DOCUMENT_DOCK_FILE_PAGE,
  DOCUMENT_DOCK_PROBLEMS_PAGE,
  DOCUMENT_DOCK_PREVIEW_PAGE,
  DOCUMENT_DOCK_REFERENCES_PAGE,
  documentDockFileKey,
  isDocumentDockPluginPage,
} from '../../domains/editor/documentDockPages.ts'
import {
  findInlineDockPage,
  resolveInlineDockActivePageKey,
  resolveInlineDockFallbackPage,
} from '../../domains/workbench/inlineDockPageRegistry.ts'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { useExtensionsStore } from '../../stores/extensions'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { getDocumentWorkflowKind } from '../../domains/document/documentWorkflowPolicy.ts'
import { useBasename } from '../../composables/useFileMetadata.ts'
import { buildExtensionContext } from '../../domains/extensions/extensionContext.ts'
import InlineDockTabBar from '../layout/InlineDockTabBar.vue'
import { documentDockPageRegistry } from './documentDockPageRegistry.ts'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  previewState: { type: Object, default: null },
  documentDockResizing: { type: Boolean, default: false },
  documentDockMotionActive: { type: Boolean, default: false },
  problemsRevealPath: { type: String, default: '' },
  problemsRevealToken: { type: Number, default: 0 },
})

const emit = defineEmits(['close'])

const workflowStore = useDocumentWorkflowStore()
const editorStore = useEditorStore()
const extensionsStore = useExtensionsStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const dismissedProblemsRevealToken = ref(0)

const hasPreview = computed(() => props.previewState?.previewVisible === true)
const comparisonTabs = computed(() => editorStore.documentDockTabs || [])
const documentProblems = computed(() =>
  workflowStore.getProblemsForFile(props.filePath, { t })
)
const problemCount = computed(() =>
  getDocumentWorkflowKind(props.filePath) ? documentProblems.value.length : 0
)
const hasProblemsPage = computed(
  () =>
    problemCount.value > 0 &&
    props.problemsRevealPath === props.filePath &&
    props.problemsRevealToken > 0 &&
    dismissedProblemsRevealToken.value !== props.problemsRevealToken
)
const previewMode = computed(() => props.previewState?.previewMode || null)
const documentBasename = useBasename(toRef(props, 'filePath'))
const documentLabel = computed(() => documentBasename.value || props.filePath)
const pluginTarget = computed(() => ({
  kind: String(props.filePath || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'workspace',
  referenceId: '',
  path: String(props.filePath || ''),
}))
const pluginContainers = computed(() =>
  extensionsStore.sidebarViewContainers
    .map((container) => {
      const target = extensionsStore.sidebarTargetForPanel(container.panelId, pluginTarget.value)
      const context = buildExtensionContext(target, {
        workbench: {
          surface: 'workspace',
          panel: 'documentDock',
          activeView: container.panelId,
          hasWorkspace: workspace.isOpen,
          workspaceFolder: workspace.path || '',
        },
      })
      const views = extensionsStore.viewsForContainer(container.id, context)
      if (views.length === 0) return null
      const firstView = views[0]
      const state = extensionsStore.viewStateFor(`${firstView.extensionId}:${firstView.id}`) || {}
      return {
        ...container,
        badgeValue: Number.isInteger(state.badgeValue) ? state.badgeValue : null,
        badgeTooltip: String(state.badgeTooltip || ''),
      }
    })
    .filter(Boolean)
    .filter((container) => {
      if (!container?.panelId) return false
      const target = extensionsStore.sidebarTargetForPanel(container.panelId, pluginTarget.value)
      return String(target.kind || '').trim() === 'pdf'
    })
)
const hasPluginViews = computed(() => pluginContainers.value.length > 0)
const allowedDocumentDockPageIds = computed(() => {
  const baseIds = Array.isArray(workspace.documentDockPageIds) ? [...workspace.documentDockPageIds] : []
  const pageIds = new Set(baseIds)
  for (const container of pluginContainers.value) {
    if (container?.panelId) {
      pageIds.add(container.panelId)
    }
  }
  return [...pageIds]
})
const dockPages = computed(() =>
  documentDockPageRegistry.resolvePages({
    allowedPageIds: allowedDocumentDockPageIds.value,
    comparisonTabs: comparisonTabs.value,
    documentDockResizing: props.documentDockResizing,
    documentDockMotionActive: props.documentDockMotionActive,
    documentLabel: documentLabel.value,
    filePath: props.filePath,
    hasPreview: hasPreview.value,
    pageDefinitions: workspace.documentDockPageDefinitions,
    paneId: props.paneId,
    hasPluginViews: hasPluginViews.value,
    pluginContainers: pluginContainers.value,
    problemCount: hasProblemsPage.value ? problemCount.value : 0,
    previewMode: previewMode.value,
    previewState: props.previewState,
    t,
  })
)
const hasDockTabs = computed(() => dockPages.value.length > 0)
const activeDockKey = computed(() => {
  return resolveInlineDockActivePageKey(dockPages.value, workspace.documentDockActivePage, {
    defaultType: pluginContainers.value[0]?.panelId || workspace.documentDockDefaultPage || DOCUMENT_DOCK_PREVIEW_PAGE,
    fallbackTypes: [DOCUMENT_DOCK_REFERENCES_PAGE, ...pluginContainers.value.map((container) => container.panelId), DOCUMENT_DOCK_FILE_PAGE, DOCUMENT_DOCK_PROBLEMS_PAGE],
    preferredKeysByType: documentDockPreferredKeysByType(),
  })
})
const activeDockPage = computed(() => findInlineDockPage(dockPages.value, activeDockKey.value))
const usesImmersivePreview = computed(() => activeDockPage.value?.immersive === true)

function documentDockPreferredKeysByType() {
  const activeFileKey =
    editorStore.activeDocumentDockTab && comparisonTabs.value.includes(editorStore.activeDocumentDockTab)
      ? documentDockFileKey(editorStore.activeDocumentDockTab)
      : ''
  return {
    [DOCUMENT_DOCK_FILE_PAGE]: activeFileKey,
  }
}

function resolveDocumentDockFallbackPage(closedPage = {}) {
  const remainingPages = dockPages.value.filter((page) => page.key !== closedPage.key)
  return resolveInlineDockFallbackPage(remainingPages, closedPage, {
    defaultType: workspace.documentDockDefaultPage || DOCUMENT_DOCK_PREVIEW_PAGE,
    preferredKeysByType: documentDockPreferredKeysByType(),
  })
}

function resolveDocumentDockLifecyclePage(type = '') {
  const definition = workspace.documentDockPageDefinitions.find((page) => page.id === type) || {}
  return {
    key: type,
    type,
    fallbackPage: definition.fallbackPage || workspace.documentDockDefaultPage || DOCUMENT_DOCK_PREVIEW_PAGE,
    lifecycle: definition,
  }
}

function activateResolvedDockPage(page = null) {
  if (!page) {
    emit('close')
    return
  }

  if (page.type === DOCUMENT_DOCK_FILE_PAGE && page.path) {
    editorStore.setActiveDocumentDockFile(page.path)
  }

  void workspace.setDocumentDockActivePage(page.type)
}

function settleClosedActivePage(page = {}, wasActive = true) {
  if (!wasActive) return
  activateResolvedDockPage(resolveDocumentDockFallbackPage(page))
}

watch(
  () => hasProblemsPage.value,
  (hasProblems) => {
    if (hasProblems || workspace.documentDockActivePage !== DOCUMENT_DOCK_PROBLEMS_PAGE) return
    settleClosedActivePage(resolveDocumentDockLifecyclePage(DOCUMENT_DOCK_PROBLEMS_PAGE))
  },
  { immediate: true }
)

function activateDockPage(page = {}) {
  if (page.type === DOCUMENT_DOCK_PREVIEW_PAGE) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PREVIEW_PAGE)
    return
  }

  if (page.type === DOCUMENT_DOCK_FILE_PAGE && page.path) {
    editorStore.setActiveDocumentDockFile(page.path)
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_FILE_PAGE)
    return
  }

  if (page.type === DOCUMENT_DOCK_PROBLEMS_PAGE) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PROBLEMS_PAGE)
    return
  }

  if (page.type === DOCUMENT_DOCK_REFERENCES_PAGE) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_REFERENCES_PAGE)
    return
  }

  if (isDocumentDockPluginPage(page.type)) {
    void workspace.setDocumentDockActivePage(page.type)
  }
}

async function closePreview(page = {}) {
  await workflowStore.hideWorkspacePreviewForFile(props.filePath).catch(() => null)
  await nextTick()
  if (hasPreview.value) return
  settleClosedActivePage(page)
}

function closeFilePage(page = {}) {
  const path = page.path
  if (!path) return

  const isActivePage = activeDockKey.value === page.key
  editorStore.closeDocumentDockFile(path)
  settleClosedActivePage(page, isActivePage)
}

function closeProblemsPage(page = {}) {
  dismissedProblemsRevealToken.value = props.problemsRevealToken
  settleClosedActivePage(page)
}

async function closeDockPage(page = {}) {
  if (page.closeable !== true) return

  if (page.type === DOCUMENT_DOCK_PREVIEW_PAGE) {
    await closePreview(page)
    return
  }
  if (page.type === DOCUMENT_DOCK_FILE_PAGE) {
    closeFilePage(page)
    return
  }
  if (page.type === DOCUMENT_DOCK_PROBLEMS_PAGE) {
    closeProblemsPage(page)
  }
}

</script>

<style scoped>
.document-dock {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

:deep(.document-dock__preview-tab--icon) {
  flex: 0 0 30px;
  justify-content: center;
  width: 30px;
  min-width: 30px;
  max-width: 30px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}

:deep(.document-dock__preview-tab--icon .document-dock__preview-label) {
  flex: 0 0 auto;
  justify-content: center;
  gap: 0;
}

:deep(.document-dock__preview-tab--icon .document-dock__preview-icon) {
  opacity: 1;
  transform: scale(1);
}

:deep(.document-dock__preview-tab--icon:not(.has-close-action):hover .document-dock__preview-icon),
:deep(.document-dock__preview-tab--icon:not(.has-close-action):focus-within .document-dock__preview-icon) {
  opacity: 1;
  transform: scale(1);
}

:deep(.document-dock__preview-tab--icon.has-close-action:focus-within .document-dock__preview-icon) {
  opacity: 1;
  transform: scale(1);
}

:deep(.document-dock__preview-tab--icon.has-close-action:hover .document-dock__preview-icon) {
  opacity: 0;
  transform: scale(0.86);
}

:deep(.document-dock__preview-tab--icon .document-dock__tab-close) {
  left: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%) scale(0.86);
}

:deep(.document-dock__preview-tab--icon:focus-within .document-dock__tab-close) {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.86);
}

:deep(.document-dock__preview-tab--icon.has-close-action:hover .document-dock__tab-close) {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}
</style>
