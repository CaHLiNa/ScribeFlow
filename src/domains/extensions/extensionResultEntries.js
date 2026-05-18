function normalizeText(value = '') {
  return String(value || '').trim()
}

function titleCaseKey(value = '') {
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function titleForArtifact(artifact = {}) {
  const kind = normalizeText(artifact.kind)
  if (!kind) return 'Artifact Preview'
  return titleCaseKey(kind)
}

function buildArtifactPreviewEntry(artifact = {}, index = 0) {
  const path = normalizeText(artifact.path)
  if (!path) return null
  const mediaType = normalizeText(artifact.mediaType || artifact.media_type)
  const title = titleForArtifact(artifact)
  const lowerPath = path.toLowerCase()

  let previewMode = ''
  if (mediaType === 'application/pdf' || lowerPath.endsWith('.pdf')) {
    previewMode = 'pdf'
  } else if (mediaType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lowerPath)) {
    previewMode = 'image'
  } else if (mediaType === 'text/html' || /\.html?$/i.test(lowerPath)) {
    previewMode = 'html'
  } else if (
    mediaType.startsWith('text/') ||
    /\.(txt|md|markdown|json|log|csv|tex|py|bib)$/i.test(lowerPath)
  ) {
    previewMode = 'text'
  }

  return {
    id: normalizeText(artifact.id) || `artifact-preview:${index}`,
    label: title,
    description: path,
    path,
    action: 'open',
    previewMode,
    previewPath: path,
    previewTitle: title,
    mediaType,
  }
}

function buildArtifactPreviewEntries(artifacts = []) {
  return (Array.isArray(artifacts) ? artifacts : [])
    .map((artifact, index) => buildArtifactPreviewEntry(artifact, index))
    .filter(Boolean)
}

function buildStructuredOutputEntries(outputs = []) {
  return (Array.isArray(outputs) ? outputs : [])
    .map((output, index) => {
      const id = normalizeText(output?.id) || `result-output:${index + 1}`
      const outputType = normalizeText(output?.type || output?.outputType || output?.output_type).toLowerCase()
      const mediaType = normalizeText(output?.mediaType || output?.media_type)
      const label = normalizeText(output?.title) || normalizeText(output?.label)
      const description = normalizeText(output?.description)
      const text = normalizeText(output?.text)
      const html = normalizeText(output?.html)

      if (outputType === 'inlinetext' && text) {
        return {
          id,
          label: label || 'Inline Text Output',
          description,
          action: 'open',
          previewMode: 'text',
          previewTitle: label || 'Inline Text Output',
          mediaType: mediaType || 'text/plain',
          payload: { text },
        }
      }

      if (outputType === 'inlinehtml' && html) {
        return {
          id,
          label: label || 'Inline HTML Output',
          description,
          action: 'open',
          previewMode: 'html',
          previewTitle: label || 'Inline HTML Output',
          mediaType: mediaType || 'text/html',
          payload: { html },
        }
      }

      return null
    })
    .filter(Boolean)
}

export function buildDefaultResultEntries({
  artifacts = [],
  outputs = [],
} = {}) {
  return [
    ...buildArtifactPreviewEntries(artifacts),
    ...buildStructuredOutputEntries(outputs),
  ]
}

export function mergeDefaultResultEntries({
  existingEntries = [],
  artifacts = [],
  outputs = [],
} = {}) {
  const preserved = Array.isArray(existingEntries) ? existingEntries : []
  const generated = buildDefaultResultEntries({ artifacts, outputs })
  if (!generated.length) return preserved

  const preservedIds = new Set(
    preserved.map((entry) => normalizeText(entry?.id)).filter(Boolean),
  )
  const generatedMissing = generated.filter((entry) => !preservedIds.has(normalizeText(entry?.id)))
  return [...preserved, ...generatedMissing]
}

function buildTaskLogEntry(task = {}) {
  const taskId = normalizeText(task?.id)
  const logPath = normalizeText(task?.logPath || task?.log_path)
  if (!taskId || !logPath) return null
  return {
    id: `${taskId}:log`,
    label: 'Task Log',
    description: logPath,
    path: logPath,
    action: 'open',
    previewMode: 'text',
    previewPath: logPath,
    previewTitle: 'Task Log',
    mediaType: 'text/plain',
  }
}

function buildTaskRerunEntry(task = {}) {
  const taskId = normalizeText(task?.id)
  const extensionId = normalizeText(task?.extensionId || task?.extension_id)
  const commandId = normalizeText(task?.commandId || task?.command_id)
  if (!taskId || !extensionId || !commandId) return null
  const target = task?.target && typeof task.target === 'object' && !Array.isArray(task.target)
    ? task.target
    : {}
  return {
    id: `${taskId}:rerun`,
    label: 'Run Again',
    action: 'execute-command',
    extensionId,
    commandId,
    targetKind: normalizeText(target.kind),
    referenceId: normalizeText(target.referenceId || target.reference_id),
    targetPath: normalizeText(target.path),
    payload: {
      settings: task?.settings && typeof task.settings === 'object' && !Array.isArray(task.settings)
        ? { ...task.settings }
        : {},
    },
  }
}

function hasEquivalentTaskLogEntry(entries = [], task = {}) {
  const logPath = normalizeText(task?.logPath || task?.log_path)
  if (!logPath) return true
  return entries.some((entry) =>
    normalizeText(entry?.path || entry?.targetPath || entry?.target_path) === logPath ||
    [
      entry?.id,
      entry?.label,
      entry?.previewTitle,
      entry?.preview_title,
    ].some((value) => normalizeText(value).toLowerCase().includes('log'))
  )
}

function hasEquivalentTaskRerunEntry(entries = [], task = {}) {
  const commandId = normalizeText(task?.commandId || task?.command_id)
  if (!commandId) return true
  return entries.some((entry) =>
    normalizeText(entry?.action).toLowerCase() === 'execute-command' &&
    normalizeText(entry?.commandId || entry?.command_id || entry?.command) === commandId
  )
}

export function buildExtensionTaskResultEntries(task = {}) {
  const explicitEntries = Array.isArray(task?.resultEntries) ? task.resultEntries : []
  const entries = mergeDefaultResultEntries({
    existingEntries: explicitEntries,
    artifacts: task?.artifacts,
    outputs: task?.outputs,
  })
  const taskEntries = []
  const logEntry = buildTaskLogEntry(task)
  if (logEntry && !hasEquivalentTaskLogEntry(explicitEntries, task)) {
    taskEntries.push(logEntry)
  }
  const rerunEntry = buildTaskRerunEntry(task)
  if (rerunEntry && !hasEquivalentTaskRerunEntry(entries, task)) {
    taskEntries.push(rerunEntry)
  }

  return [...entries, ...taskEntries]
}

export {
  buildArtifactPreviewEntries as buildExtensionArtifactPreviewEntries,
  buildArtifactPreviewEntry as extensionArtifactToPreviewEntry,
  titleCaseKey,
}
