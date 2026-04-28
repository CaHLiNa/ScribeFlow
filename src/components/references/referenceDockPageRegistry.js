import { defineAsyncComponent } from 'vue'
import { IconFileText, IconFileTypePdf, IconQuote } from '@tabler/icons-vue'
import {
  REFERENCE_DOCK_CITED_IN_PAGE,
  REFERENCE_DOCK_DETAILS_PAGE,
  REFERENCE_DOCK_PDF_PAGE,
} from '../../domains/references/referenceDockPages.js'
import { createInlineDockPageRegistry } from '../../domains/workbench/inlineDockPageRegistry.js'

const ReferenceDetailPanel = defineAsyncComponent(() => import('../panel/ReferenceDetailPanel.vue'))
const ReferenceCitedInPanel = defineAsyncComponent(() => import('./ReferenceCitedInPanel.vue'))
const DocumentDockFileSurface = defineAsyncComponent(() => import('../sidebar/DocumentDockFileSurface.vue'))

export const referenceDockPageRegistry = createInlineDockPageRegistry([
  {
    id: REFERENCE_DOCK_DETAILS_PAGE,
    resolve(context = {}) {
      const label = context.selectedReference?.title || context.t?.('Details') || 'Details'

      return {
        key: REFERENCE_DOCK_DETAILS_PAGE,
        type: REFERENCE_DOCK_DETAILS_PAGE,
        icon: IconFileText,
        title: label,
        ariaLabel: label,
        tabClass:
          'reference-workbench__detail-tab reference-workbench__detail-tab--icon reference-workbench__detail-tab--details',
        labelClass: 'reference-workbench__detail-tab-label',
        iconClass: 'reference-workbench__detail-tab-icon',
        component: ReferenceDetailPanel,
        componentClass: 'reference-workbench__detail-panel',
        componentEvents: {
          'open-pdf-preview': context.openPdfPreview,
        },
      }
    },
  },
  {
    id: REFERENCE_DOCK_CITED_IN_PAGE,
    resolve(context = {}) {
      const count = Number(context.citedInCount || 0)
      const label = count > 0
        ? `${context.t?.('Cited In') || 'Cited In'} (${count})`
        : context.t?.('Cited In') || 'Cited In'

      return {
        key: REFERENCE_DOCK_CITED_IN_PAGE,
        type: REFERENCE_DOCK_CITED_IN_PAGE,
        icon: IconQuote,
        title: label,
        ariaLabel: label,
        tabClass:
          'reference-workbench__detail-tab reference-workbench__detail-tab--icon reference-workbench__detail-tab--cited-in',
        labelClass: 'reference-workbench__detail-tab-label',
        iconClass: 'reference-workbench__detail-tab-icon',
        closeable: false,
        component: ReferenceCitedInPanel,
        componentClass: 'reference-workbench__detail-panel',
        componentProps: {
          reference: context.selectedReference,
        },
      }
    },
  },
  {
    id: REFERENCE_DOCK_PDF_PAGE,
    resolve(context = {}) {
      if (context.showReferencePdfTab !== true || !context.selectedReferencePdfPath) {
        return null
      }

      const label = context.t?.('PDF') || 'PDF'
      return {
        key: REFERENCE_DOCK_PDF_PAGE,
        type: REFERENCE_DOCK_PDF_PAGE,
        icon: IconFileTypePdf,
        title: label,
        ariaLabel: label,
        tabClass:
          'reference-workbench__detail-tab reference-workbench__detail-tab--icon reference-workbench__detail-tab--pdf',
        labelClass: 'reference-workbench__detail-tab-label',
        iconClass: 'reference-workbench__detail-tab-icon',
        closeClass: 'reference-workbench__detail-tab-close',
        closeTitle: context.t?.('Close') || 'Close',
        closeable: true,
        closeWhenActiveOnly: true,
        component: DocumentDockFileSurface,
        componentClass: 'reference-workbench__detail-panel',
        componentProps: {
          filePath: context.selectedReferencePdfPath,
          paneId: 'reference-library',
          documentDockResizing: context.referenceDetailResizing,
        },
      }
    },
  },
])
