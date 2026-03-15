import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { importFromPdf, importFromText } from '../services/referenceImport'
import { pickCitationStyleFile, readReferenceFile, writeReferenceFile } from '../services/referenceFiles'

async function parseCslFile(filePath) {
  const { parseCslMetadata, deriveStyleId } = await import('../utils/cslParser')
  const xml = await readReferenceFile(filePath)
  const meta = parseCslMetadata(xml)
  const id = deriveStyleId(meta.id, meta.title)
  return { id, meta, xml }
}

export function useReferenceImports(options) {
  const { referencesStore, workspace, t, showImportMessage, showImportSummary } = options

  const dropActive = ref(false)
  const importing = reactive([])
  let importId = 0

  async function importCitationStyle(filePath) {
    const { id, meta, xml } = await parseCslFile(filePath)
    await writeReferenceFile(`${workspace.projectDir}/styles/${id}.csl`, xml)
    await referencesStore._loadUserStyles(workspace.projectDir)
    referencesStore.setCitationStyle(id)
    showImportMessage(t('Added style: {title}', { title: meta.title }), true)
    return { id, meta }
  }

  async function importCustomStyle() {
    const selected = await pickCitationStyleFile()
    if (!selected) return null
    try {
      return await importCitationStyle(selected)
    } catch (error) {
      console.warn('Failed to import CSL style:', error)
      return null
    }
  }

  function onRefDragOver() {
    dropActive.value = true
  }

  function onRefDragLeave() {
    dropActive.value = false
  }

  async function onRefFileDrop(event) {
    dropActive.value = false
    const { paths } = event.detail || {}
    if (!paths?.length) return

    let totalAdded = 0
    let totalDuplicates = 0
    const textExts = ['.bib', '.ris', '.json', '.nbib', '.enw', '.txt']
    const pdfs = []
    const textFiles = []
    const cslFiles = []

    for (const path of paths) {
      const lower = path.toLowerCase()
      if (lower.endsWith('.pdf')) pdfs.push(path)
      else if (lower.endsWith('.csl')) cslFiles.push(path)
      else if (textExts.some((ext) => lower.endsWith(ext))) textFiles.push(path)
    }

    for (const filePath of cslFiles) {
      try {
        await importCitationStyle(filePath)
      } catch (error) {
        console.warn('CSL import failed:', filePath, error)
      }
    }

    for (const filePath of textFiles) {
      const id = ++importId
      const name = filePath.split('/').pop()
      importing.push({ id, name })
      try {
        const content = await readReferenceFile(filePath)
        const result = await importFromText(content, workspace)
        if (result.results?.length > 0) {
          const report = referencesStore.addReferences(result.results.map((item) => item.csl))
          totalAdded += report.added.length
          totalDuplicates += report.duplicates.length
        }
      } catch (error) {
        console.warn('File import failed:', filePath, error)
      }
      const index = importing.findIndex((item) => item.id === id)
      if (index !== -1) importing.splice(index, 1)
    }

    const pdfPromises = pdfs.map(async (filePath) => {
      const id = ++importId
      const name = filePath.split('/').pop()
      importing.push({ id, name })
      try {
        const result = await importFromPdf(filePath, workspace, referencesStore)
        if (result) totalAdded += 1
        else totalDuplicates += 1
      } catch (error) {
        console.warn('PDF import failed:', filePath, error)
      }
      const index = importing.findIndex((item) => item.id === id)
      if (index !== -1) importing.splice(index, 1)
    })

    await Promise.all(pdfPromises)
    showImportSummary(totalAdded, totalDuplicates)
  }

  onMounted(() => {
    window.addEventListener('ref-drag-over', onRefDragOver)
    window.addEventListener('ref-drag-leave', onRefDragLeave)
    window.addEventListener('ref-file-drop', onRefFileDrop)
  })

  onUnmounted(() => {
    window.removeEventListener('ref-drag-over', onRefDragOver)
    window.removeEventListener('ref-drag-leave', onRefDragLeave)
    window.removeEventListener('ref-file-drop', onRefFileDrop)
  })

  return {
    dropActive,
    importing,
    importCustomStyle,
  }
}
