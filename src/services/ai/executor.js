import { normalizeAiArtifact } from '../../domains/ai/aiArtifactRuntime.js'
import { getAiSkillBehaviorId, getAiSkillById } from './skillRegistry.js'
import { isAltalsManagedFilesystemSkill } from './skillDiscovery.js'
import { loadSkillSupportingFiles } from './skillSupportFiles.js'
import { resolveRuntimeAiToolIds } from './toolRegistry.js'
import {
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  requiresStructuredAgentResponse,
} from './agentPromptBuilder.js'
import { runAiAgentExecutionRuntime } from './agentExecutionRuntime.js'

export async function executeAiAgentEntry({
  skillId = '',
  skill = null,
  contextBundle = {},
  config = {},
  apiKey = '',
  userInstruction = '',
  conversation = [],
  altalsSkills = [],
  attachments = [],
  referencedFiles = [],
  requestedTools = [],
  runtimeIntent = 'chat',
  toolRuntime = {},
  onEvent,
  signal,
} = {}) {
  const resolvedSkill = skill || getAiSkillById(skillId, altalsSkills)
  if (!resolvedSkill) {
    throw new Error('AI skill is not available.')
  }
  if (resolvedSkill.kind === 'filesystem-skill' && !isAltalsManagedFilesystemSkill(resolvedSkill)) {
    throw new Error('AI skill is not available.')
  }

  const enabledToolIds = resolveRuntimeAiToolIds(config?.enabledTools, { runtimeIntent })
  const enabledToolSet = new Set(enabledToolIds)
  const promptSkill = {
    ...resolvedSkill,
    enabledToolIds,
  }

  let supportFiles = []
  if (resolvedSkill.kind === 'filesystem-skill' && enabledToolSet.has('load-skill-support-files')) {
    supportFiles = await loadSkillSupportingFiles(resolvedSkill)
  }

  const behaviorId = getAiSkillBehaviorId(resolvedSkill, skillId)
  const structured = requiresStructuredAgentResponse({
    behaviorId,
    runtimeIntent,
  })
  const systemPrompt = buildAgentSystemPrompt({
    skill: resolvedSkill,
    runtimeIntent,
    behaviorId,
    structured,
  })
  const userPrompt = buildAgentUserPrompt({
    skill: promptSkill,
    contextBundle,
    userInstruction,
    conversation,
    altalsSkills,
    supportFiles,
    attachments,
    referencedFiles,
    requestedTools,
    enabledToolIds,
    runtimeIntent,
  })

  const { content, payload, events, transport } = await runAiAgentExecutionRuntime({
    providerId: config.providerId || 'openai',
    config,
    apiKey,
    conversation,
    userPrompt,
    systemPrompt,
    contextBundle,
    supportFiles,
    enabledToolIds,
    toolRuntime,
    onEvent,
    signal,
  })

  const artifact = normalizeAiArtifact(behaviorId, payload, contextBundle, content)

  return {
    skill: resolvedSkill,
    behaviorId,
    supportFiles,
    events,
    transport,
    content,
    payload,
    artifact,
  }
}

export async function executeAiSkill(options = {}) {
  return executeAiAgentEntry(options)
}
