import { createDocumentWorkflowBuildOperationRuntime } from './documentWorkflowBuildOperationRuntime.ts'
import { resolveDocumentWorkflowAction } from '../services/documentWorkflow/actionRuntimeBridge.ts'

function planHasFollowUp(plan = null) {
  return !!(plan && typeof plan === 'object' && plan.followUpAction && typeof plan.followUpAction === 'object')
}

export function createDocumentWorkflowActionRuntime({
  getWorkflowStore,
  getBuildOperationRuntime = () => createDocumentWorkflowBuildOperationRuntime(),
  openOutputPath = async () => false,
} = {}) {
  async function resolveActionPlan(filePath, intent, options = {}) {
    const workflowStore = getWorkflowStore?.() || null
    if (!filePath || !workflowStore) return null

    const uiState = options.uiState || null
    const previewState = resolveWorkspacePreviewState(filePath, options)
    const artifactPath = workflowStore.getArtifactPathForFile?.(filePath, options.buildOptions || {}) || ''

    return resolveDocumentWorkflowAction({
      filePath,
      intent,
      uiState,
      previewState,
      artifactPath,
    }).catch(() => null)
  }

  async function executeActionPlan(filePath, plan = null, options = {}) {
    if (!filePath || !plan?.actionType) return null

    const workflowStore = getWorkflowStore?.() || null
    if (!workflowStore) return null

    switch (plan.actionType) {
      case 'run-build': {
        const buildOperationRuntime = getBuildOperationRuntime?.() || null
        const buildResult = await (buildOperationRuntime?.runBuildForFile?.(filePath, {
          ...(options.buildOptions || {}),
          sourcePaneId: options.sourcePaneId,
          trigger: options.trigger || `${options.uiState?.kind || 'document'}-compile-button`,
        }) || null)

        if (!planHasFollowUp(plan)) {
          return buildResult
        }

        const followUpPlan = {
          ...plan.followUpAction,
        }
        const followUpArtifactPath = workflowStore.getArtifactPathForFile?.(
          filePath,
          options.buildOptions || {},
        ) || ''
        if (
          followUpPlan.actionType === 'open-external-output'
          && !String(followUpArtifactPath || '').trim()
        ) {
          return buildResult
        }
        if (followUpPlan.actionType === 'open-external-output') {
          followUpPlan.artifactPath = followUpArtifactPath
        }

        const followUpResult = await executeActionPlan(filePath, followUpPlan, options)
        return followUpResult || buildResult
      }
      case 'show-workspace-preview':
        return workflowStore.showWorkspacePreviewForFile?.(filePath, {
          previewKind: plan.previewKind || options.previewKind,
          persistPreference: plan.persistPreference !== false,
          sourcePaneId: options.sourcePaneId,
          trigger: options.trigger || 'workflow-toggle-preview',
        }) || null
      case 'hide-workspace-preview':
        return workflowStore.hideWorkspacePreviewForFile?.(filePath) || null
      case 'open-external-output': {
        const artifactPath = String(plan.artifactPath || '').trim()
        if (!artifactPath) return null
        await openOutputPath(artifactPath)
        return {
          type: 'external-output-opened',
          filePath,
          artifactPath,
          trigger: options.trigger || `${options.adapterKind || options.uiState?.kind || 'document'}-open-output`,
        }
      }
      default:
        return null
    }
  }

  function resolveWorkspacePreviewState(filePath, options = {}) {
    const workflowStore = getWorkflowStore?.() || null
    return workflowStore?.getWorkspacePreviewStateForFile?.(filePath, options.buildOptions || {}) || null
  }

  async function toggleMarkdownPreviewForFile(filePath, options = {}) {
    const plan = await resolveActionPlan(filePath, 'toggle-markdown-preview', {
      ...options,
      uiState: options.uiState || { kind: 'markdown', previewKind: 'html' },
    })
    return executeActionPlan(filePath, plan, {
      ...options,
      previewKind: 'html',
      trigger: options.trigger || 'markdown-preview-toggle',
    })
  }

  async function openWorkflowOutputForFile(filePath, options = {}) {
    const plan = await resolveActionPlan(filePath, 'open-output', options)
    return executeActionPlan(filePath, plan, {
      ...options,
      trigger: options.trigger || `${options.adapterKind || options.uiState?.kind || 'document'}-open-output`,
    })
  }

  async function runPrimaryActionForFile(filePath, options = {}) {
    const plan = await resolveActionPlan(filePath, 'primary-action', options)
    return executeActionPlan(filePath, plan, options)
  }

  async function revealPreviewForFile(filePath, options = {}) {
    const plan = await resolveActionPlan(filePath, 'reveal-preview', options)
    return executeActionPlan(filePath, plan, {
      ...options,
      trigger: options.trigger || 'workflow-toggle-preview',
    })
  }

  async function togglePdfPreviewForFile(filePath, options = {}) {
    const plan = await resolveActionPlan(filePath, 'toggle-pdf-preview', options)
    return executeActionPlan(filePath, plan, {
      ...options,
      trigger: options.trigger || `${options.adapterKind || options.uiState?.kind || 'document'}-open-output`,
    })
  }

  function revealPdfForFile(filePath, options = {}) {
    return togglePdfPreviewForFile(filePath, {
      ...options,
      trigger: options.trigger || `${options.uiState?.kind || 'document'}-open-output`,
    })
  }

  return {
    toggleMarkdownPreviewForFile,
    togglePdfPreviewForFile,
    openWorkflowOutputForFile,
    runPrimaryActionForFile,
    revealPreviewForFile,
    revealPdfForFile,
  }
}
