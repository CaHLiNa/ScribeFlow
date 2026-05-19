import { computed } from 'vue'
import { buildReferenceDetailPdfExtensionTarget, resolveReferenceDetailPdfPath } from '../../domains/references/referenceDetailDraft.ts'
import { useI18n } from '../../i18n'
import { revealPathInFileManager } from '../../services/fileTreeSystem'
import { openNativeDialog } from '../../services/nativeDialog.ts'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'

export function useReferenceDetailActions({ selectedReference, emit } = {}) {
  const { t } = useI18n()
  const editorStore = useEditorStore()
  const referencesStore = useReferencesStore()
  const workspace = useWorkspaceStore()

  const selectedReferencePdfPath = computed(() => resolveReferenceDetailPdfPath(selectedReference?.value))
  const canOpenPdf = computed(() => selectedReferencePdfPath.value.length > 0)
  const pdfExtensionActionTarget = computed(() =>
    buildReferenceDetailPdfExtensionTarget(selectedReference?.value)
  )

  function handlePreviewPdf() {
    if (!canOpenPdf.value) return
    emit?.('open-pdf-preview')
  }

  async function handleOpenPdfInEditor() {
    if (!canOpenPdf.value) return
    editorStore.openFile(selectedReferencePdfPath.value)
    workspace.setLeftSidebarPanel('files')
  }

  async function handleRevealPdf() {
    if (!canOpenPdf.value) return
    await revealPathInFileManager({ path: selectedReferencePdfPath.value })
  }

  async function handleAttachPdf() {
    const referenceId = String(selectedReference?.value?.id || '').trim()
    if (!referenceId) return

    const selected = await openNativeDialog({
      multiple: false,
      title: t('Attach PDF'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (!selected || Array.isArray(selected)) return
    await referencesStore.attachReferencePdf(
      workspace.globalConfigDir,
      referenceId,
      String(selected)
    )
  }

  return {
    canOpenPdf,
    handleAttachPdf,
    handleOpenPdfInEditor,
    handlePreviewPdf,
    handleRevealPdf,
    pdfExtensionActionTarget,
    selectedReferencePdfPath,
  }
}
