import { defineAsyncComponent } from 'vue'
import {
  IconAlertTriangle,
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
} from '@tabler/icons-vue'
import {
  DOCUMENT_DOCK_FILE_PAGE,
  DOCUMENT_DOCK_PROBLEMS_PAGE,
  DOCUMENT_DOCK_PREVIEW_PAGE,
  DOCUMENT_DOCK_REFERENCES_PAGE,
  documentDockFileKey,
} from '../../domains/editor/documentDockPages.js'
import { createInlineDockPageRegistry } from '../../domains/workbench/inlineDockPageRegistry.js'
import { getDocumentWorkflowKind } from '../../services/documentWorkflow/policy.js'
import { getFileIconName } from '../../utils/fileTypes.js'
import { basenamePath } from '../../utils/path.js'

const DocumentPreviewDock = defineAsyncComponent(() => import('./DocumentPreviewDock.vue'))
const DocumentDockFileSurface = defineAsyncComponent(() => import('./DocumentDockFileSurface.vue'))
const DocumentProblemsPanel = defineAsyncComponent(() => import('./DocumentProblemsPanel.vue'))
const DocumentReferencesPanel = defineAsyncComponent(() => import('./DocumentReferencesPanel.vue'))

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
  IconAlertTriangle,
}

function previewIconForMode(previewMode = '') {
  if (previewMode === 'pdf-artifact') return IconFileTypePdf
  if (previewMode === 'terminal-output') return IconTerminal2
  return IconFileText
}

function iconForPath(path = '') {
  return ICON_COMPONENTS[getFileIconName(path)] || IconFile
}

export const documentDockPageRegistry = createInlineDockPageRegistry([
  {
    id: DOCUMENT_DOCK_PREVIEW_PAGE,
    resolve(context = {}) {
      if (context.hasPreview !== true) return null

      const previewKind = getDocumentWorkflowKind(context.filePath) || 'document'
      const immersive =
        context.previewMode === 'pdf-artifact' &&
        previewKind === 'latex'

      return {
        key: DOCUMENT_DOCK_PREVIEW_PAGE,
        type: DOCUMENT_DOCK_PREVIEW_PAGE,
        icon: previewIconForMode(context.previewMode),
        title: context.documentLabel,
        ariaLabel: context.documentLabel,
        tabClass: 'document-dock__preview-tab document-dock__preview-tab--icon',
        labelClass: 'document-dock__preview-label',
        iconClass: 'document-dock__preview-icon',
        closeClass: 'document-dock__tab-close',
        closeTitle: context.t?.('Hide preview') || 'Hide preview',
        closeable: true,
        closeWhenActiveOnly: true,
        component: DocumentPreviewDock,
        componentProps: {
          filePath: context.filePath,
          paneId: context.paneId,
          previewState: context.previewState,
          compactPdfToolbar: immersive,
          documentDockResizing: context.documentDockResizing,
        },
        immersive,
      }
    },
  },
  {
    id: DOCUMENT_DOCK_REFERENCES_PAGE,
    resolve(context = {}) {
      if (getDocumentWorkflowKind(context.filePath) !== 'latex') return null

      const label = context.t?.('References') || 'References'
      return {
        key: DOCUMENT_DOCK_REFERENCES_PAGE,
        type: DOCUMENT_DOCK_REFERENCES_PAGE,
        icon: IconBook2,
        title: label,
        ariaLabel: label,
        tabClass: 'document-dock__preview-tab document-dock__preview-tab--icon',
        labelClass: 'document-dock__preview-label',
        iconClass: 'document-dock__preview-icon',
        closeClass: 'document-dock__tab-close',
        closeable: false,
        component: DocumentReferencesPanel,
        componentProps: {
          filePath: context.filePath,
          paneId: context.paneId,
        },
      }
    },
  },
  {
    id: DOCUMENT_DOCK_PROBLEMS_PAGE,
    resolve(context = {}) {
      const count = Number(context.problemCount || 0)
      if (count <= 0) return null

      const label = `${context.t?.('Problems') || 'Problems'} (${count})`

      return {
        key: DOCUMENT_DOCK_PROBLEMS_PAGE,
        type: DOCUMENT_DOCK_PROBLEMS_PAGE,
        icon: IconAlertTriangle,
        title: label,
        ariaLabel: label,
        tabClass: 'document-dock__preview-tab document-dock__preview-tab--icon',
        labelClass: 'document-dock__preview-label',
        iconClass: 'document-dock__preview-icon',
        closeClass: 'document-dock__tab-close',
        closeTitle: context.t?.('Hide problems') || 'Hide problems',
        closeable: true,
        closeWhenActiveOnly: true,
        component: DocumentProblemsPanel,
        componentProps: {
          filePath: context.filePath,
          paneId: context.paneId,
        },
      }
    },
  },
  {
    id: DOCUMENT_DOCK_FILE_PAGE,
    resolve(context = {}) {
      return (context.comparisonTabs || []).map((path) => {
        const label = basenamePath(path) || path
        return {
          key: documentDockFileKey(path),
          type: DOCUMENT_DOCK_FILE_PAGE,
          path,
          icon: iconForPath(path),
          label,
          title: label,
          ariaLabel: label,
          tabClass: 'document-dock__preview-tab',
          labelClass: 'document-dock__preview-label',
          iconClass: 'document-dock__preview-icon',
          closeClass: 'document-dock__tab-close',
          closeTitle: context.t?.('Close tab') || 'Close tab',
          closeable: true,
          component: DocumentDockFileSurface,
          componentProps: {
            filePath: path,
            paneId: context.paneId,
            documentDockResizing: context.documentDockResizing,
          },
        }
      })
    },
  },
])
