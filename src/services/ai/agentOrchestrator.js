import {
  parseAiPromptResourceMentions,
  resolveMentionedWorkspaceFiles,
} from '../../domains/ai/aiMentionRuntime.js'
import { extractAiMessageText } from '../../domains/ai/aiConversationRuntime.js'
import { DEFAULT_AGENT_ACTION_ID } from './builtInActions.js'
import { resolveAiInvocation } from './invocationRouting.js'
import { getBuiltInAiActionById } from './skillRegistry.js'
import { getAiProviderConfig, loadAiApiKey, loadAiConfig } from './settings.js'
import { executeAiAgentEntry } from './executor.js'

function normalizeConversation(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      role: message.role,
      content: extractAiMessageText(message),
    }))
    .filter((message) => message.content)
}

function buildPreparationError(code = '', extra = {}) {
  return {
    ok: false,
    code: String(code || '').trim(),
    ...extra,
  }
}

async function resolveReferencedFiles({
  sessionMode = 'chat',
  promptMentions = {},
  workspacePath = '',
  flatFiles = [],
  ensureFlatFilesReady = async () => {},
  readWorkspaceFile = async () => '',
} = {}) {
  if (String(sessionMode || '').trim() !== 'agent') return []
  if (!Array.isArray(promptMentions?.fileMentions) || promptMentions.fileMentions.length === 0) {
    return []
  }

  await ensureFlatFilesReady()
  const mentionedEntries = resolveMentionedWorkspaceFiles(
    promptMentions.fileMentions,
    flatFiles,
    workspacePath
  )

  return Promise.all(
    mentionedEntries.map(async (entry) => {
      try {
        const content = await readWorkspaceFile(entry.path, { maxBytes: 64 * 1024 })
        return {
          path: entry.path,
          relativePath:
            workspacePath && entry.path.startsWith(workspacePath)
              ? entry.path.slice(workspacePath.length).replace(/^\/+/, '')
              : entry.path,
          content: String(content || ''),
        }
      } catch {
        return {
          path: entry.path,
          relativePath:
            workspacePath && entry.path.startsWith(workspacePath)
              ? entry.path.slice(workspacePath.length).replace(/^\/+/, '')
              : entry.path,
          content: '',
        }
      }
    })
  )
}

export async function prepareAgentRun({
  activeSession = null,
  activeSkill = null,
  builtInActions = [],
  altalsSkills = [],
  contextBundle = {},
  sessionMode = 'chat',
  resolveEffectivePermissionMode = () => 'accept-edits',
  skillHasRequiredContext = () => true,
  refreshProviderState = async () => ({ ready: false }),
  loadConfig = loadAiConfig,
  getProviderConfig = getAiProviderConfig,
  loadApiKey = loadAiApiKey,
  workspacePath = '',
  flatFiles = [],
  ensureFlatFilesReady = async () => {},
  readWorkspaceFile = async () => '',
} = {}) {
  const session = activeSession && typeof activeSession === 'object' ? activeSession : null
  if (!session) {
    return buildPreparationError('SESSION_UNAVAILABLE')
  }

  const normalizedSessionMode =
    String(sessionMode || session.mode || '').trim() === 'agent' ? 'agent' : 'chat'
  const isAgentSession = normalizedSessionMode === 'agent'
  const promptDraft = String(session.promptDraft || '').trim()
  const promptMentions = parseAiPromptResourceMentions(promptDraft)
  const defaultAgentSkill =
    getBuiltInAiActionById(DEFAULT_AGENT_ACTION_ID) ||
    (Array.isArray(builtInActions)
      ? builtInActions.find(
          (entry) => String(entry?.id || '').trim() === DEFAULT_AGENT_ACTION_ID
        ) || null
      : null)
  const invocation = resolveAiInvocation({
    prompt: promptDraft,
    mode: normalizedSessionMode,
    activeSkill: isAgentSession ? defaultAgentSkill : activeSkill,
    builtInActions,
    altalsSkills,
    contextBundle,
  })
  const skill = invocation.resolvedSkill || (isAgentSession ? defaultAgentSkill : activeSkill)

  if (!skill) {
    return buildPreparationError('AI_SKILL_UNAVAILABLE', {
      invocation,
      promptDraft,
    })
  }

  if (skill.kind !== 'filesystem-skill' && !skillHasRequiredContext(skill, contextBundle)) {
    return buildPreparationError('MISSING_CONTEXT', {
      skill,
      invocation,
      promptDraft,
    })
  }

  const providerState = await refreshProviderState()
  if (!providerState?.ready) {
    return buildPreparationError('PROVIDER_NOT_READY', {
      skill,
      invocation,
      providerState,
      promptDraft,
    })
  }

  const fullConfig = await loadConfig()
  const providerId = String(fullConfig?.currentProviderId || 'openai').trim()
  const [baseConfig, apiKey] = await Promise.all([
    Promise.resolve(getProviderConfig(fullConfig, providerId)),
    loadApiKey(providerId),
  ])

  const effectivePermissionMode = resolveEffectivePermissionMode({
    session,
    mode: normalizedSessionMode,
    providerId,
    providerConfig: baseConfig,
  })
  const config = {
    ...baseConfig,
    enabledTools: Array.isArray(fullConfig?.enabledTools) ? [...fullConfig.enabledTools] : [],
    sdk:
      providerId === 'anthropic'
        ? {
            ...(baseConfig.sdk || {}),
            runtimeMode: !isAgentSession ? 'http' : String(baseConfig?.sdk?.runtimeMode || 'sdk'),
            approvalMode: effectivePermissionMode === 'plan' ? 'plan' : 'per-tool',
            autoAllowAll: effectivePermissionMode === 'bypass-permissions',
          }
        : baseConfig.sdk,
  }
  const userInstruction = String(
    isAgentSession ? invocation.userInstruction || promptDraft : invocation.userInstruction
  ).trim()
  const runtimeIntent = isAgentSession ? 'agent' : invocation.invocation ? 'skill' : 'chat'
  const referencedFiles = await resolveReferencedFiles({
    sessionMode: normalizedSessionMode,
    promptMentions,
    workspacePath,
    flatFiles,
    ensureFlatFilesReady,
    readWorkspaceFile,
  })
  const priorConversation = normalizeConversation((session.messages || []).slice(-6))

  return {
    ok: true,
    session,
    sessionMode: normalizedSessionMode,
    isAgentSession,
    promptDraft,
    promptMentions,
    invocation,
    skill,
    providerState,
    providerId,
    apiKey: apiKey || '',
    effectivePermissionMode,
    config,
    contextBundle,
    userInstruction,
    runtimeIntent,
    referencedFiles,
    priorConversation,
    attachments: session.attachments || [],
    requestedTools: isAgentSession ? promptMentions.toolMentions : [],
  }
}

export async function executePreparedAgentRun(preparedRun = null, options = {}) {
  if (!preparedRun?.ok) {
    throw new Error('Prepared agent run is not available.')
  }

  const executeRun =
    typeof options.executeRun === 'function' ? options.executeRun : executeAiAgentEntry

  return executeRun({
    skillId: preparedRun.skill.id,
    skill: preparedRun.skill,
    contextBundle: preparedRun.contextBundle,
    config: {
      ...preparedRun.config,
      providerId: preparedRun.providerId,
    },
    apiKey: preparedRun.apiKey || '',
    userInstruction: preparedRun.userInstruction,
    conversation: preparedRun.priorConversation,
    altalsSkills: options.altalsSkills || [],
    attachments: preparedRun.attachments || [],
    referencedFiles: preparedRun.referencedFiles || [],
    requestedTools: preparedRun.requestedTools || [],
    runtimeIntent: preparedRun.runtimeIntent || 'chat',
    toolRuntime: options.toolRuntime || {},
    onEvent: options.onEvent,
    signal: options.signal,
  })
}
