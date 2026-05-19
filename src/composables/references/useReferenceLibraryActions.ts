import { unref } from 'vue'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { useWorkspaceStore } from '../../stores/workspace'
import { useSurfaceContextMenu } from '../useSurfaceContextMenu.ts'
import { openNativeDialog, saveNativeDialog } from '../../services/nativeDialog.ts'
import {
  buildReferenceContextMenuGroups,
  buildReferenceExportDefaultPath,
  normalizeReferenceFilenameSegment,
} from '../../domains/references/referenceWorkbenchPresentation.ts'

function resolveReferenceList(source) {
  const value = typeof source === 'function' ? source() : unref(source)
  return Array.isArray(value) ? value : []
}

export function useReferenceLibraryActions({ filteredReferences = [] } = {}) {
  const { t } = useI18n()
  const referencesStore = useReferencesStore()
  const workspace = useWorkspaceStore()
  const toastStore = useToastStore()
  const uxStatusStore = useUxStatusStore()
  const {
    menuVisible,
    menuX,
    menuY,
    menuGroups,
    closeSurfaceContextMenu,
    openSurfaceContextMenu,
    handleSurfaceContextMenuSelect,
  } = useSurfaceContextMenu()

  async function getReferenceBibTeX(reference = {}) {
    if (!reference?.id) return ''
    return referencesStore.exportBibTeXAsync([reference.id])
  }

  async function copyTextToClipboard(text = '', successMessage = t('Copied to clipboard')) {
    if (!text) return
    if (typeof navigator?.clipboard?.writeText !== 'function') {
      throw new Error(t('Clipboard is unavailable'))
    }

    await navigator.clipboard.writeText(text)
    toastStore.show(successMessage, {
      type: 'success',
      duration: 1800,
    })
  }

  async function handleRenameReferencePdf(reference = {}) {
    if (!String(reference?.pdfPath || '').trim()) {
      toastStore.show(t('No PDF attached'), {
        type: 'error',
        duration: 2800,
      })
      return
    }

    const defaultName = normalizeReferenceFilenameSegment(reference.citationKey || reference.title, 'reference')
    const nextName = window.prompt(t('Rename PDF'), defaultName)
    if (nextName == null) return

    const normalizedBaseName = normalizeReferenceFilenameSegment(nextName, defaultName)
    if (!normalizedBaseName || normalizedBaseName === defaultName) return

    try {
      await referencesStore.renameReferencePdfAsset(
        workspace.globalConfigDir,
        reference.id,
        normalizedBaseName
      )
    } catch (error) {
      toastStore.show(error?.message || t('Failed to rename PDF'), {
        type: 'error',
        duration: 3600,
      })
    }
  }

  async function handleRefreshReferenceMetadata(reference = {}) {
    try {
      const refreshed = await referencesStore.refreshReferenceMetadata(
        workspace.globalConfigDir,
        reference.id
      )
      if (!refreshed) {
        toastStore.show(t('No metadata match found'), {
          type: 'error',
          duration: 3200,
        })
      }
    } catch (error) {
      toastStore.show(error?.message || t('Failed to refresh metadata'), {
        type: 'error',
        duration: 3600,
      })
    }
  }

  async function handleExportReferenceBibTeX(reference = {}) {
    if (!reference?.id) return

    const target = await saveNativeDialog({
      title: t('Export BibTeX'),
      defaultPath: buildReferenceExportDefaultPath(reference, { extension: 'bib' }),
      filters: [{ name: 'BibTeX', extensions: ['bib'] }],
    })

    if (!target) return

    try {
      await referencesStore.writeBibTeXExportFile(String(target), [reference.id])
      uxStatusStore.success(t('Exported BibTeX'), { duration: 2200 })
    } catch (error) {
      toastStore.show(error?.message || t('Failed to export BibTeX'), {
        type: 'error',
        duration: 5000,
      })
    }
  }

  async function handleDetailedExport(reference = {}) {
    const target = await saveNativeDialog({
      title: t('Detailed Export'),
      defaultPath: buildReferenceExportDefaultPath(reference, { extension: 'json' }),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (!target) return

    try {
      await referencesStore.writeReferenceJsonExportFile(String(target), reference.id)
      uxStatusStore.success(t('Detailed export saved'), { duration: 2200 })
    } catch (error) {
      toastStore.show(error?.message || t('Failed to export reference details'), {
        type: 'error',
        duration: 5000,
      })
    }
  }

  async function handleCopyReferenceBibTeX(reference = {}) {
    try {
      await copyTextToClipboard(await getReferenceBibTeX(reference), t('Copied to clipboard'))
    } catch (error) {
      toastStore.show(error?.message || t('Failed to copy citation'), {
        type: 'error',
        duration: 3200,
      })
    }
  }

  function handleReferenceContextMenuAction(item = {}, reference = {}) {
    const referenceId = String(item.referenceId || reference?.id || '').trim()
    if (!referenceId) return

    if (item.actionId === 'rename-pdf') {
      return handleRenameReferencePdf(reference)
    }
    if (item.actionId === 'refresh-metadata') {
      return handleRefreshReferenceMetadata(reference)
    }
    if (item.actionId === 'toggle-collection') {
      return referencesStore.toggleReferenceCollection(
        workspace.globalConfigDir,
        referenceId,
        item.collectionKey
      )
    }
    if (item.actionId === 'export-bibtex') {
      return handleExportReferenceBibTeX(reference)
    }
    if (item.actionId === 'export-detailed') {
      return handleDetailedExport(reference)
    }
    if (item.actionId === 'copy-bibtex') {
      return handleCopyReferenceBibTeX(reference)
    }
    if (item.actionId === 'delete') {
      return referencesStore.removeReference(workspace.globalConfigDir, referenceId)
    }
  }

  function bindReferenceContextMenuActions(groups = [], reference = {}) {
    const bindItem = (item = {}) => {
      const nextItem = { ...item }
      if (nextItem.actionId && nextItem.actionId !== 'noop') {
        nextItem.action = () => handleReferenceContextMenuAction(nextItem, reference)
      }
      if (Array.isArray(nextItem.children)) {
        nextItem.children = nextItem.children.map(bindItem)
      }
      return nextItem
    }

    return (Array.isArray(groups) ? groups : []).map((group) => ({
      ...group,
      items: Array.isArray(group?.items) ? group.items.map(bindItem) : [],
    }))
  }

  function openReferenceContextMenu(event, reference = {}) {
    if (!reference?.id) return
    void referencesStore.selectReference(reference.id).catch(() => {})

    openSurfaceContextMenu({
      x: event.clientX,
      y: event.clientY,
      groups: bindReferenceContextMenuActions(
        buildReferenceContextMenuGroups({
          reference,
          collections: referencesStore.collections,
          translate: t,
        }),
        reference
      ),
    })
  }

  function handleManualImport(importedCount = 0) {
    if (importedCount > 0) {
      uxStatusStore.success(t('Imported {count} references', { count: importedCount }), {
        duration: 2200,
      })
    }
  }

  async function handleImportBibTeX() {
    const selected = await openNativeDialog({
      multiple: false,
      title: t('Import BibTeX'),
      filters: [{ name: 'BibTeX', extensions: ['bib'] }],
    })

    if (!selected || Array.isArray(selected)) return

    const statusId = uxStatusStore.show(t('Importing BibTeX...'), {
      type: 'info',
      duration: 0,
    })

    try {
      const importResult = await referencesStore.importReferenceFile(
        workspace.globalConfigDir,
        String(selected),
        'bibtex'
      )
      const importedCount = Number(importResult?.importedCount || 0)

      uxStatusStore.success(
        importedCount > 0
          ? t('Imported {count} references', { count: importedCount })
          : t('No new references were added'),
        { duration: 2200 }
      )
    } catch (error) {
      const message = error?.message || String(error || 'Failed to import BibTeX')
      uxStatusStore.error(t('Failed to import BibTeX'), { duration: 3200 })
      toastStore.show(message, { type: 'error', duration: 5000 })
    } finally {
      uxStatusStore.clear(statusId)
    }
  }

  async function handleImportPdf() {
    const selected = await openNativeDialog({
      multiple: false,
      title: t('Import PDF'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (!selected || Array.isArray(selected)) return

    const statusId = uxStatusStore.show(t('Importing PDF...'), {
      type: 'info',
      duration: 0,
    })

    try {
      const importedReference = await referencesStore.importReferencePdf(
        workspace.globalConfigDir,
        String(selected)
      )
      uxStatusStore.success(
        importedReference ? t('Imported PDF into reference library') : t('No new references were added'),
        { duration: 2200 }
      )
    } catch (error) {
      const message = error?.message || String(error || 'Failed to import PDF')
      uxStatusStore.error(t('Failed to import PDF'), { duration: 3200 })
      toastStore.show(message, { type: 'error', duration: 5000 })
    } finally {
      uxStatusStore.clear(statusId)
    }
  }

  async function handleExportBibTeX() {
    const references = resolveReferenceList(filteredReferences)
    if (!references.length) return
    const target = await saveNativeDialog({
      title: t('Export BibTeX'),
      defaultPath: 'references.bib',
      filters: [{ name: 'BibTeX', extensions: ['bib'] }],
    })

    if (!target) return

    try {
      await referencesStore.writeBibTeXExportFile(
        String(target),
        references.map((reference) => reference.id)
      )
      uxStatusStore.success(t('Exported BibTeX'), { duration: 2200 })
    } catch (error) {
      toastStore.show(error?.message || t('Failed to export BibTeX'), {
        type: 'error',
        duration: 5000,
      })
    }
  }

  return {
    closeSurfaceContextMenu,
    handleExportBibTeX,
    handleImportBibTeX,
    handleImportPdf,
    handleManualImport,
    handleSurfaceContextMenuSelect,
    menuGroups,
    menuVisible,
    menuX,
    menuY,
    openReferenceContextMenu,
  }
}
