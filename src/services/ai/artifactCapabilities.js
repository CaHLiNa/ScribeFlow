import { applyTextPatchToContent } from '../../domains/ai/aiArtifactRuntime.js'

export const AI_ARTIFACT_CAPABILITY_DEFINITIONS = Object.freeze([
  {
    artifactType: 'doc_patch',
    toolId: 'apply-document-patch',
    labelKey: 'Apply to draft',
  },
  {
    artifactType: 'note_draft',
    toolId: 'open-note-draft',
    labelKey: 'Open as draft',
  },
])

export function getAiArtifactCapability(artifact = null) {
  if (!artifact?.type) return null
  return AI_ARTIFACT_CAPABILITY_DEFINITIONS.find(
    (entry) => entry.artifactType === artifact.type
  ) || null
}

export function canApplyAiArtifact(artifact = null, enabledToolIds = []) {
  const capability = getAiArtifactCapability(artifact)
  if (!capability) return false
  return Array.isArray(enabledToolIds) && enabledToolIds.includes(capability.toolId)
}

export async function applyAiArtifactCapability(
  artifact = null,
  {
    enabledToolIds = [],
    filesStore,
    editorStore,
    toastStore,
    translate,
  } = {}
) {
  if (!artifact) return false
  const t = typeof translate === 'function' ? translate : (value) => value

  if (!canApplyAiArtifact(artifact, enabledToolIds)) {
    throw new Error(t('The required artifact capability is disabled.'))
  }

  if (artifact.type === 'doc_patch') {
    let currentContent = ''
    const view = editorStore.getAnyEditorView(artifact.filePath)
    if (view?.altalsGetContent) {
      currentContent = view.altalsGetContent()
    } else if (artifact.filePath in filesStore.fileContents) {
      currentContent = filesStore.fileContents[artifact.filePath]
    } else {
      currentContent = await filesStore.readFile(artifact.filePath)
    }

    const nextContent = applyTextPatchToContent(currentContent, artifact)
    const saved = await filesStore.saveFile(artifact.filePath, nextContent)
    if (!saved) {
      throw new Error(t('Failed to save AI patch to the document.'))
    }

    if (view?.altalsApplyExternalContent) {
      await view.altalsApplyExternalContent(nextContent)
    }
    editorStore.clearFileDirty(artifact.filePath)
    artifact.status = 'applied'
    toastStore.show(t('AI patch applied to the active document.'), { type: 'success' })
    return true
  }

  if (artifact.type === 'note_draft') {
    const draftPath = filesStore.createDraftFile({
      ext: '.md',
      suggestedName: artifact.suggestedName || 'ai-note.md',
      initialContent: artifact.content,
    })
    editorStore.openFile(draftPath)
    artifact.status = 'applied'
    toastStore.show(t('AI note opened as a draft.'), { type: 'success' })
    return true
  }

  return false
}
