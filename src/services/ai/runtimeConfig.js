import { resolveApiAccess } from '../apiClient'
import { getThinkingConfig } from '../chatModels'
import { buildBaseSystemPrompt } from '../systemPrompt'
import { buildWorkspaceMeta } from '../workspaceMeta'
import { normalizeRuntimeId } from './runtimeAdapter'

function buildWorkflowPrompt(session) {
  const workflow = session?._workflow
  if (!workflow?.run?.id || !workflow?.template?.id) return ''

  const steps = Array.isArray(workflow.run.steps) ? workflow.run.steps : []
  const currentStep = steps.find((step) => step.id === workflow.run.currentStepId)
    || steps.find((step) => step.status === 'running')
    || steps.find((step) => step.status === 'pending')
    || null
  const checkpoint = (workflow.run.checkpoints || []).find((item) => item.status === 'open') || null
  const lines = [
    'Workflow session context:',
    `- Template: ${workflow.template.label || workflow.template.id}`,
    `- Template ID: ${workflow.template.id}`,
    `- Run status: ${workflow.run.status || 'draft'}`,
  ]

  if (currentStep) {
    lines.push(`- Current step: ${currentStep.label || currentStep.kind || currentStep.id}`)
    lines.push(`- Current step kind: ${currentStep.kind || currentStep.id}`)
  }
  if (checkpoint) {
    lines.push(`- Awaiting approval: ${checkpoint.type || checkpoint.label || checkpoint.id}`)
  }

  return lines.join('\n')
}

export async function buildChatRuntimeConfig({ session, workspace } = {}) {
  const role = session?._ai?.role || 'general'
  const profile = session?._ai?.toolProfile || role
  const profileRuntime = workspace?.aiRuntime?.profileRuntimes?.[profile]
    || workspace?.aiRuntime?.profileRuntimes?.[role]
    || null
  const runtimeId = normalizeRuntimeId(
    session?._ai?.runtimeId ||
    profileRuntime ||
    workspace?.aiRuntime?.defaultRuntime,
  )

  const access = await resolveApiAccess({ modelId: session?.modelId }, workspace)
  const provider = access ? (access.providerHint || access.provider) : null
  const modelEntry = workspace?.modelsConfig?.models?.find((model) => model.id === session?.modelId)
  const thinkingConfig = access ? getThinkingConfig(access.model, provider, modelEntry?.thinking) : null

  let systemPrompt = buildBaseSystemPrompt(workspace)
  if (workspace?.systemPrompt) systemPrompt += '\n\n' + workspace.systemPrompt
  if (workspace?.instructions) systemPrompt += '\n\n' + workspace.instructions

  try {
    const meta = await buildWorkspaceMeta(workspace?.path)
    if (meta) systemPrompt += '\n\n' + meta
  } catch {
    // Workspace metadata is optional for runtime config assembly.
  }
  const workflowPrompt = buildWorkflowPrompt(session)
  if (workflowPrompt) systemPrompt += '\n\n' + workflowPrompt
  if (!access && runtimeId !== 'opencode') return null

  return {
    access,
    workspace,
    provider,
    thinkingConfig,
    systemPrompt,
    runtimeId,
    strictRuntime: session?._ai?.strictRuntime ?? !!workspace?.aiRuntime?.opencode?.strict,
    sessionLabel: session?.label || session?._ai?.label || 'AI',
    runtimeSessionId: session?._ai?.runtimeSessionId || null,
    opencodeEndpoint: workspace?.aiRuntime?.opencode?.endpoint || null,
    opencodeIdleDisposeMs: workspace?.aiRuntime?.opencode?.idleDisposeMs || null,
    toolRole: role,
    toolProfile: session?._ai?.toolProfile || null,
    allowedTools: session?._ai?.allowedTools || null,
    initialToolChoice: session?._ai?.initialToolChoice || null,
  }
}
