<template>
  <section class="ai-agent-panel">
    <header class="ai-agent-panel__header">
      <div class="ai-agent-panel__session-control">
        <AiSessionRail
          :sessions="sessionItems"
          :current-session-id="aiStore.currentSessionId"
          @create="createSession"
          @switch="switchSessionTab"
          @rename="renameSession"
          @delete="deleteSession"
        />
      </div>
    </header>

    <div class="ai-agent-panel__workspace">
      <section class="ai-agent-panel__hero" :class="{ 'is-busy': aiStore.isRunning }">
        <div class="ai-agent-panel__hero-eyebrow">
          {{ heroTitle }}
        </div>
        <div class="ai-agent-panel__hero-note">
          {{ heroNote }}
        </div>
      </section>

      <div v-if="isAgentMode && hasRuntimeStateStack" class="ai-agent-panel__runtime-stack">
        <AiPlanModeBanner
          v-if="showPlanModeBanner"
          :plan-mode="planModeState"
        />
        <AiResumeBanner
          v-if="showResumeBanner"
          :resume-state="resumeState"
        />
        <AiTurnStatusCard
          v-if="showTurnStatusCard"
          :turn="activeTurnState"
        />
        <AiCompactingBanner
          v-if="showCompactingBanner"
          :compaction="compactionState"
        />
        <AiActiveTasksBar
          v-if="showActiveTasksBar"
          :tasks="backgroundTaskItems"
        />
      </div>

      <AiAskUserBanner
        v-if="isAgentMode && blockingState === 'ask-user'"
        :request="activeAskUserRequest"
        :context-items="blockingContextItems"
        :submitting="respondingAskUserRequestId === activeAskUserRequest?.requestId"
        @submit="submitAskUserResponse"
      />
      <AiExitPlanBanner
        v-else-if="isAgentMode && blockingState === 'exit-plan'"
        :request="activeExitPlanRequest"
        :context-items="blockingContextItems"
        :submitting="respondingExitPlanRequestId === activeExitPlanRequest?.requestId"
        @submit="submitExitPlanResponse"
      />
      <AiPermissionBanner
        v-else-if="isAgentMode && blockingState === 'permission' && activePermissionRequest"
        :request="activePermissionRequest"
        :context-items="blockingContextItems"
        :submitting="respondingPermissionRequestId === activePermissionRequest?.requestId"
        @deny="denyPermissionRequest"
        @allow-once="allowPermissionRequest"
        @allow-always="alwaysAllowPermissionRequest"
      />

      <div class="ai-agent-panel__thread-shell">
        <div
          ref="threadRef"
          class="ai-agent-panel__thread scrollbar-hidden"
          data-surface-context-guard="true"
          @contextmenu="openThreadContextMenu"
        >
          <div class="ai-agent-panel__messages">
            <div v-if="messages.length === 0" class="ai-agent-panel__empty">
              <div class="ai-agent-panel__empty-title">
                {{ emptyStateTitle }}
              </div>
              <div class="ai-agent-panel__empty-note">
                {{ emptyStateNote }}
              </div>
            </div>

            <AiConversationMessage
              v-for="(message, index) in messages"
              :key="message.id"
              :message="message"
              :artifacts-by-id="artifactsById"
              :animate-latest="message.role === 'assistant' && index === messages.length - 1"
              @apply-artifact="aiStore.applyArtifact($event)"
              @dismiss-artifact="aiStore.dismissArtifact($event)"
              @rollback-artifact="aiStore.rollbackArtifact($event)"
            />
          </div>
          <div ref="threadBottomRef"></div>
        </div>
      </div>
      <footer class="ai-agent-panel__composer">
        <AiAttachmentList :attachments="attachments" @remove="removeAttachment" />

        <div class="ai-agent-panel__composer-well">
          <div class="ai-agent-panel__composer-input">
            <UiTextarea
              ref="composerTextareaRef"
              :model-value="aiStore.promptDraft"
              variant="ghost"
              :rows="1"
              class="ai-agent-panel__textarea"
              shell-class="ai-agent-panel__textarea-shell"
              :placeholder="composerPlaceholder"
              @keydown="handlePromptKeydown"
              @update:model-value="aiStore.setPromptDraft($event)"
            />

            <AiInvocationDropdown
              :visible="composerSuggestions.length > 0"
              :suggestions="composerSuggestions"
              :active-index="activeInvocationIndex"
              @select="applyInvocationSuggestion"
            />
          </div>

          <div class="ai-agent-panel__composer-actions">
            <div class="ai-agent-panel__composer-tools">
              <UiButton
                variant="ghost"
                size="sm"
                icon-only
                class="ai-agent-panel__tool-button"
                :disabled="isComposerLockedByBlockingState"
                @click="attachFiles"
                :title="isComposerLockedByBlockingState ? blockedComposerMessage : t('Attach files')"
              >
                <IconPaperclip :size="17" :stroke-width="1.6" />
              </UiButton>

              <div v-if="showExecutionPolicyControls" class="ai-agent-panel__execution-policy">
                <button
                  type="button"
                  class="ai-agent-panel__policy-pill"
                  :class="{
                    'is-warning': isFullAccessMode,
                    'is-disabled': isExecutionPolicyLocked,
                  }"
                  :disabled="isExecutionPolicyLocked"
                  :title="permissionModeButtonTitle"
                  :aria-label="permissionModeButtonTitle"
                  @click="cyclePermissionMode"
                >
                  <IconShieldBolt v-if="isFullAccessMode" :size="14" :stroke-width="1.8" />
                  <IconShieldHalf v-else :size="14" :stroke-width="1.8" />
                  <span>
                    {{ isFullAccessMode ? t('Full access') : t('Ask before edits') }}
                  </span>
                </button>

                <button
                  type="button"
                  class="ai-agent-panel__policy-pill"
                  :class="{
                    'is-active': isPlanModeEnabled,
                    'is-disabled': isExecutionPolicyLocked,
                  }"
                  :disabled="isExecutionPolicyLocked"
                  :title="planModeButtonTitle"
                  :aria-label="planModeButtonTitle"
                  @click="togglePlanMode(!isPlanModeEnabled)"
                >
                  <IconChecklist :size="14" :stroke-width="1.8" />
                  <span>{{ t('Plan mode') }}</span>
                </button>
              </div>
            </div>

            <div class="ai-agent-panel__composer-primary">
              <UiSelect
                :model-value="selectedModelValue"
                size="sm"
                shell-class="ai-agent-panel__model-chip-shell"
                :options="modelOptions"
                :placeholder="t('Use Codex defaults')"
                :disabled="aiStore.isRunning || modelUpdatePending"
                :aria-label="t('Model')"
                @update:model-value="handleModelChange"
              />

              <button
                type="button"
                class="ai-agent-panel__send-button"
                :class="{
                  'is-disabled': !aiStore.isRunning && isSendBlocked,
                  'ai-agent-panel__stop-button': aiStore.isRunning,
                  'is-blocked': isComposerLockedByBlockingState,
                }"
                :disabled="!aiStore.isRunning && isSendBlocked"
                :title="aiStore.isRunning ? stopButtonTitle : sendButtonTitle"
                :aria-label="aiStore.isRunning ? stopButtonTitle : sendButtonTitle"
                @click.prevent.stop="handlePrimaryActionClick"
              >
                <IconPlayerStop v-if="aiStore.isRunning" :size="14" :stroke-width="2.2" />
                <IconArrowUp v-else :size="14" :stroke-width="2.5" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>

    <SurfaceContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :groups="menuGroups"
      @close="closeSurfaceContextMenu"
      @select="handleSurfaceContextMenuSelect"
    />
  </section>
</template>

<script setup>
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { useI18n } from '../../i18n'
import { useAiStore } from '../../stores/ai'
import { useFilesStore } from '../../stores/files'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  applyAiComposerSuggestion,
  detectAiComposerToken,
  getAiComposerSuggestions,
} from '../../domains/ai/aiMentionRuntime.js'
import {
  IconPaperclip,
  IconArrowUp,
  IconChecklist,
  IconPlayerStop,
  IconShieldBolt,
  IconShieldHalf,
} from '@tabler/icons-vue'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'
import AiActiveTasksBar from './AiActiveTasksBar.vue'
import AiAskUserBanner from './AiAskUserBanner.vue'
import AiAttachmentList from './AiAttachmentList.vue'
import AiCompactingBanner from './AiCompactingBanner.vue'
import AiConversationMessage from './AiConversationMessage.vue'
import AiExitPlanBanner from './AiExitPlanBanner.vue'
import AiInvocationDropdown from './AiInvocationDropdown.vue'
import AiPlanModeBanner from './AiPlanModeBanner.vue'
import AiPermissionBanner from './AiPermissionBanner.vue'
import AiResumeBanner from './AiResumeBanner.vue'
import AiSessionRail from './AiSessionRail.vue'
import AiTurnStatusCard from './AiTurnStatusCard.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const filesStore = useFilesStore()
const toastStore = useToastStore()
const workspace = useWorkspaceStore()
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()

void aiStore.resetTransientRuntimeState()

const threadRef = ref(null)
const threadBottomRef = ref(null)
const composerTextareaRef = ref(null)
const activeInvocationIndex = ref(0)
const respondingPermissionRequestId = ref('')
const respondingAskUserRequestId = ref('')
const respondingExitPlanRequestId = ref('')
const modelUpdatePending = ref(false)
const COMPOSER_MIN_HEIGHT = 38
const COMPOSER_MAX_HEIGHT = 220

const messages = computed(() => aiStore.messages)
const artifacts = computed(() => aiStore.artifacts)
const attachments = computed(() => aiStore.attachments)
const activePermissionRequest = computed(() => aiStore.activePermissionRequest)
const activeAskUserRequest = computed(() => aiStore.activeAskUserRequest)
const activeExitPlanRequest = computed(() => aiStore.activeExitPlanRequest)
const activeBackgroundTasks = computed(() => aiStore.activeBackgroundTasks)
const planModeState = computed(() => aiStore.planModeState)
const compactionState = computed(() => aiStore.compactionState)
const resumeState = computed(() => aiStore.resumeState)
const activeTurnState = computed(() => aiStore.activeTurnState)
const sessionItems = computed(() => aiStore.sessionList)
const currentPermissionMode = computed(() => aiStore.currentPermissionMode)
const selectedModelValue = computed(() => String(aiStore.providerState.model || '').trim())
const modelOptions = computed(() => {
  const options = [
    {
      value: '',
      label: t('Use Codex defaults'),
      triggerLabel: t('Use Codex defaults'),
    },
    { value: 'gpt-5.4', label: 'GPT-5.4', triggerLabel: 'GPT-5.4' },
    { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', triggerLabel: 'GPT-5.3-Codex' },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex', triggerLabel: 'GPT-5.2-Codex' },
    { value: 'gpt-5-codex', label: 'GPT-5-Codex', triggerLabel: 'GPT-5-Codex' },
  ]
  if (
    selectedModelValue.value &&
    !options.some((option) => String(option.value || '').trim() === selectedModelValue.value)
  ) {
    options.push({
      value: selectedModelValue.value,
      label: selectedModelValue.value,
      triggerLabel: selectedModelValue.value,
    })
  }
  return options
})

const artifactsById = computed(() =>
  Object.fromEntries(artifacts.value.map((artifact) => [artifact.id, artifact]))
)

const transcriptText = computed(() =>
  messages.value
    .map(
      (message) =>
        `${message.role === 'assistant' ? t('Assistant') : t('You')}\n${String(message.content || '').trim()}`
    )
    .filter(Boolean)
    .join('\n\n')
    .trim()
)

const isAgentMode = computed(() => true)
const canSend = computed(
  () => String(aiStore.promptDraft || '').trim().length > 0 || attachments.value.length > 0
)
const isProviderReady = computed(() => aiStore.providerState.ready === true)
const showExecutionPolicyControls = computed(
  () => aiStore.providerState.runtimeBackend !== 'codex-acp'
)
const isComposerLockedByBlockingState = computed(() => hasBlockingState.value && !aiStore.isRunning)
const permissionModeFallbackBySession = ref({})
const isPlanModeEnabled = computed(() => currentPermissionMode.value === 'plan')
const resolvedPermissionMode = computed(() =>
  currentPermissionMode.value === 'plan'
    ? permissionModeFallbackBySession.value[aiStore.currentSessionId] || 'accept-edits'
    : currentPermissionMode.value
)
const isFullAccessMode = computed(() => resolvedPermissionMode.value === 'bypass-permissions')
const isExecutionPolicyLocked = computed(() => aiStore.isRunning || hasBlockingState.value)
const executionPolicyControlTitle = computed(() => {
  if (aiStore.isRunning) return t('Execution mode cannot change while a task is running.')
  if (hasBlockingState.value) {
    return t('Resolve the current blocking state before changing execution mode.')
  }
  return ''
})
const planModeButtonTitle = computed(() => {
  if (executionPolicyControlTitle.value) return executionPolicyControlTitle.value
  if (isPlanModeEnabled.value) return t('Plan mode is on. Click to return to normal execution.')
  return t('Plan mode is off. Click to plan before acting.')
})
const permissionModeButtonTitle = computed(() => {
  if (executionPolicyControlTitle.value) return executionPolicyControlTitle.value
  if (isPlanModeEnabled.value && isFullAccessMode.value) {
    return t('Full access will be used after plan mode exits. Click to switch back to ask before edits.')
  }
  if (isPlanModeEnabled.value) {
    return t('Ask before edits will be used after plan mode exits. Click to switch to full access.')
  }
  if (isFullAccessMode.value) {
    return t('Full access is on. Click to switch to ask before edits.')
  }
  return t('Ask before edits is on. Click to switch to full access.')
})
const blockedComposerMessage = computed(() =>
  t('Resolve the current blocking state before sending a new task.')
)
const providerNotReadyMessage = computed(() =>
  t('Codex ACP runtime is not ready. Install Codex CLI or fix the configured command path first.')
)
const isSendBlocked = computed(
  () => isComposerLockedByBlockingState.value || !isProviderReady.value || !canSend.value
)
const sendButtonTitle = computed(() => {
  if (isComposerLockedByBlockingState.value) return blockedComposerMessage.value
  if (!isProviderReady.value) return providerNotReadyMessage.value
  if (!canSend.value) return t('Type a message or attach a file to send.')
  if (aiStore.isRunning) return t('Queue message')
  return t('Run task')
})
const stopButtonTitle = computed(() => t('Stop response'))
const composerPlaceholder = computed(() =>
  isAgentMode.value
    ? t('Describe the next task.')
    : t('Ask anything about this project.')
)
const emptyStateTitle = computed(() =>
  isAgentMode.value ? t('Describe the next task.') : t('What do you want to build?')
)
const emptyStateNote = computed(() =>
  isAgentMode.value
    ? t('This workspace and its files are already available.')
    : t('Operate on the current workspace or type / for commands.')
)
const blockingState = computed(() => {
  if (activePermissionRequest.value) return 'permission'
  if (activeAskUserRequest.value) return 'ask-user'
  if (activeExitPlanRequest.value) return 'exit-plan'
  return ''
})
const hasBlockingState = computed(() => blockingState.value !== '')
const heroTitle = computed(() => {
  if (blockingState.value === 'permission') return t('Awaiting permission')
  if (blockingState.value === 'ask-user') return t('Awaiting user input')
  if (blockingState.value === 'exit-plan') return t('Awaiting plan confirmation')

  const turnStatus = String(activeTurnState.value?.status || '').trim().toLowerCase()
  if (['running', 'responding', 'preparing'].includes(turnStatus) || aiStore.isRunning) {
    return t('Thinking')
  }
  if (messages.value.length > 0) return t('Ready for next task')
  return emptyStateTitle.value
})
const heroNote = computed(() => {
  if (blockingState.value === 'permission') {
    return (
      String(activePermissionRequest.value?.title || '').trim()
      || String(activePermissionRequest.value?.description || '').trim()
      || t('The model is waiting for your approval before using a built-in tool.')
    )
  }
  if (blockingState.value === 'ask-user') {
    return (
      String(activeAskUserRequest.value?.question || '').trim()
      || t('The model needs your answer before it can continue.')
    )
  }
  if (blockingState.value === 'exit-plan') {
    return (
      String(activeExitPlanRequest.value?.summary || '').trim()
      || t('Review the plan outcome before the run continues.')
    )
  }

  const summary = String(activeTurnState.value?.summary || '').trim()
  if (summary) return summary
  const lastToolName = String(activeTurnState.value?.lastToolName || '').trim()
  if (lastToolName) return `${t('Running')} · ${lastToolName}`
  if (messages.value.length > 0) return t('Continue from the current workspace, references, and active draft.')
  return emptyStateNote.value
})
const showPlanModeBanner = computed(
  () => planModeState.value?.active === true && blockingState.value !== 'exit-plan' && !hasBlockingState.value
)
const showResumeBanner = computed(
  () => resumeState.value?.active === true && !hasBlockingState.value
)
const showTurnStatusCard = computed(
  () => !!activeTurnState.value && !hasBlockingState.value
)
const showCompactingBanner = computed(
  () => compactionState.value?.active === true && !hasBlockingState.value && !resumeState.value?.active
)
const backgroundTaskItems = computed(() =>
  activeBackgroundTasks.value.slice(0, 3).map((task) => ({
    ...task,
    detail: summarizeStatusDetail(task.detail || task.lastToolName || '', 72),
  }))
)
const showActiveTasksBar = computed(() => backgroundTaskItems.value.length > 0 && !hasBlockingState.value)
const hasRuntimeStateStack = computed(
  () =>
    showPlanModeBanner.value ||
    showResumeBanner.value ||
    showTurnStatusCard.value ||
    showCompactingBanner.value ||
    showActiveTasksBar.value
)
const blockingContextItems = computed(() => {
  if (!hasBlockingState.value) return []

  const items = []
  if (planModeState.value?.active === true && blockingState.value !== 'exit-plan') {
    const planItemCount = Array.isArray(planModeState.value.items) ? planModeState.value.items.length : 0
    items.push({
      key: 'plan',
      tone: 'accent',
      label: t('Plan mode'),
      detail: summarizeStatusDetail(
        [
          planModeState.value.summary || planModeState.value.note,
          planItemCount > 0 ? t('{count} steps', { count: planItemCount }) : '',
        ]
          .filter(Boolean)
          .join(' · '),
        48
      ),
    })
  }
  if (resumeState.value?.active === true) {
    items.push({
      key: 'resume',
      tone: 'info',
      label: t('Waiting to resume'),
      detail: summarizeStatusDetail(resumeState.value.message, 48),
    })
  }
  if (activeTurnState.value) {
    items.push({
      key: 'turn-status',
      tone: 'info',
      label: t('Turn'),
      detail: summarizeStatusDetail(
        [
          String(activeTurnState.value.status || '').trim(),
          String(activeTurnState.value.lastToolName || '').trim(),
          String(activeTurnState.value.pendingRequestKind || '').trim(),
        ]
          .filter(Boolean)
          .join(' · '),
        48
      ),
    })
  }
  if (compactionState.value?.active === true) {
    items.push({
      key: 'compacting',
      tone: 'warning',
      label: t('Compacting'),
      detail: t('Preparing earlier context'),
    })
  }
  if (activeBackgroundTasks.value.length > 0) {
    items.push({
      key: 'tasks',
      tone: 'warning',
      label: t('Running tasks'),
      detail: t('{count} active', { count: activeBackgroundTasks.value.length }),
    })
  }
  return items
})

function summarizeStatusDetail(value = '', maxLength = 72) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}
const composerToken = computed(() => detectAiComposerToken(aiStore.promptDraft))

const composerSuggestions = computed(() => {
  const suggestions = getAiComposerSuggestions({
    prompt: aiStore.promptDraft,
    workspacePath: workspace.path || '',
    files: isAgentMode.value ? filesStore.flatFiles : [],
    tools: [],
    slashSuggestions: [],
    skillSuggestions: [],
  })

  return suggestions.map((suggestion) => ({
    ...suggestion,
    groupLabel: t(suggestion.groupLabel || ''),
  }))
})

async function runSkill() {
  if (aiStore.isRunning) return
  const rawTextareaValue = String(
    composerTextareaRef.value?.textareaEl?.value ?? composerTextareaRef.value?.value ?? ''
  )
  if (!String(aiStore.promptDraft || '').trim() && rawTextareaValue.trim()) {
    aiStore.setPromptDraft(rawTextareaValue)
  }
  if (
    !String(aiStore.promptDraft || '').trim() &&
    !rawTextareaValue.trim() &&
    attachments.value.length === 0
  ) {
    composerTextareaRef.value?.focus?.()
    toastStore.show(t('Type a message or attach a file to send.'), { type: 'warning' })
    return
  }
  if (!isProviderReady.value) {
    await aiStore.refreshProviderState().catch(() => {})
    toastStore.show(providerNotReadyMessage.value, { type: 'warning' })
    workspace.openSettings('agent')
    return
  }
  await aiStore.runActiveSkill()
}

async function handleModelChange(nextValue = '') {
  const normalizedValue = String(nextValue || '').trim()
  if (aiStore.isRunning || modelUpdatePending.value) return

  modelUpdatePending.value = true
  try {
    await aiStore.setPreferredModel(normalizedValue)
  } catch (error) {
    toastStore.show(
      error instanceof Error ? error.message : String(error || t('Failed to save AI settings.')),
      { type: 'error' }
    )
  } finally {
    modelUpdatePending.value = false
  }
}

function handleSendClick() {
  if (isSendBlocked.value) return
  if (aiStore.isRunning) {
    const queued = aiStore.queueCurrentSubmission()
    if (queued) {
      toastStore.show(t('Message queued for the current session.'))
    }
    return
  }
  void runSkill()
}

function handleStopClick() {
  if (!aiStore.isRunning) return
  void aiStore.stopCurrentRun()
}

function handlePrimaryActionClick() {
  if (aiStore.isRunning) {
    handleStopClick()
    return
  }
  handleSendClick()
}

async function setResolvedPermissionMode(mode = 'accept-edits') {
  const normalizedMode = mode === 'bypass-permissions' ? 'bypass-permissions' : 'accept-edits'
  permissionModeFallbackBySession.value = {
    ...permissionModeFallbackBySession.value,
    [aiStore.currentSessionId]: normalizedMode,
  }
  if (isPlanModeEnabled.value) return
  await aiStore.setSessionPermissionMode(normalizedMode)
}

async function cyclePermissionMode() {
  const nextMode = isFullAccessMode.value ? 'accept-edits' : 'bypass-permissions'
  await setResolvedPermissionMode(nextMode)
}

async function togglePlanMode(nextValue = false) {
  if (!nextValue) {
    const fallbackMode =
      permissionModeFallbackBySession.value[aiStore.currentSessionId] || 'accept-edits'
    await aiStore.setSessionPermissionMode(fallbackMode)
    return
  }
  await aiStore.setSessionPermissionMode('plan')
}

async function respondPermissionRequest(request = null, behavior = 'deny', persist = false) {
  if (!request?.requestId) return
  respondingPermissionRequestId.value = request.requestId
  try {
    await aiStore.respondToPermissionRequest({
      requestId: request.requestId,
      behavior,
      persist,
    })
  } finally {
    respondingPermissionRequestId.value = ''
  }
}

async function denyPermissionRequest(request = null) {
  await respondPermissionRequest(request, 'deny', false)
}

async function allowPermissionRequest(request = null) {
  await respondPermissionRequest(request, 'allow', false)
}

async function alwaysAllowPermissionRequest(request = null) {
  await respondPermissionRequest(request, 'allow', true)
}

async function submitAskUserResponse(payload = {}) {
  const requestId = String(payload?.requestId || '').trim()
  if (!requestId) return
  respondingAskUserRequestId.value = requestId
  try {
    await aiStore.respondToAskUserRequest({
      requestId,
      answers: payload?.answers || {},
    })
  } finally {
    respondingAskUserRequestId.value = ''
  }
}

async function submitExitPlanResponse(payload = {}) {
  const requestId = String(payload?.requestId || '').trim()
  if (!requestId) return
  respondingExitPlanRequestId.value = requestId
  try {
    await aiStore.respondToExitPlanRequest({
      requestId,
      action: payload?.action || 'deny',
      feedback: payload?.feedback || '',
    })
  } finally {
    respondingExitPlanRequestId.value = ''
  }
}

async function attachFiles() {
  const selected = await open({
    multiple: true,
    directory: false,
    title: t('Attach files'),
  })
  const selectedPaths = !selected ? [] : Array.isArray(selected) ? selected : [selected]
  if (!selectedPaths.length) return

  for (const path of selectedPaths) {
    await aiStore.addAttachmentFromPath(path)
  }
}

function removeAttachment(attachmentId = '') {
  aiStore.removeAttachment(attachmentId)
}

async function createSession() {
  await aiStore.createSession()
  activeInvocationIndex.value = 0
  nextTick(() => {
    composerTextareaRef.value?.focus?.()
  })
}

async function switchSessionTab(sessionId = '') {
  if (!(await aiStore.switchSession(sessionId))) return
  activeInvocationIndex.value = 0
  scrollToBottom('auto')
}

async function renameSession(payload = {}) {
  await aiStore.renameSession(payload.sessionId, payload.title)
}

async function deleteSession(sessionId = '') {
  if (!(await aiStore.deleteSession(sessionId))) return
  activeInvocationIndex.value = 0
  scrollToBottom('auto')
}

function applyInvocationSuggestion(suggestion = null) {
  aiStore.setPromptDraft(applyAiComposerSuggestion(aiStore.promptDraft, suggestion))
  activeInvocationIndex.value = 0
}

async function copyTextToClipboard(text = '') {
  const normalized = String(text || '').trim()
  if (!normalized) return
  await navigator.clipboard.writeText(normalized)
  toastStore.show(t('Copied to clipboard'), { type: 'success' })
}

function selectThreadContents() {
  if (!threadRef.value) return
  const selection = window.getSelection?.()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(threadRef.value)
  selection.removeAllRanges()
  selection.addRange(range)
}

function openThreadContextMenu(event) {
  const selectionText = String(window.getSelection?.()?.toString?.() || '').trim()

  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups: [
      {
        key: 'clipboard',
        items: [
          {
            key: 'copy-selection',
            label: t('Copy selected text'),
            disabled: !selectionText,
            action: () => {
              void copyTextToClipboard(selectionText)
            },
          },
          {
            key: 'copy-transcript',
            label: t('Copy conversation'),
            disabled: !transcriptText.value,
            action: () => {
              void copyTextToClipboard(transcriptText.value)
            },
          },
          {
            key: 'select-all',
            label: t('Select all'),
            disabled: messages.value.length === 0,
            action: () => {
              selectThreadContents()
            },
          },
        ],
      },
    ],
  })
  event.preventDefault()
}

function handlePromptKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    if (aiStore.isRunning) {
      handleStopClick()
    } else {
      handleSendClick()
    }
    return
  }

  if (!composerSuggestions.value.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeInvocationIndex.value =
      (activeInvocationIndex.value + 1) % composerSuggestions.value.length
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeInvocationIndex.value =
      (activeInvocationIndex.value - 1 + composerSuggestions.value.length) %
      composerSuggestions.value.length
    return
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    applyInvocationSuggestion(composerSuggestions.value[activeInvocationIndex.value])
    return
  }

  if (event.key === 'Escape') {
    activeInvocationIndex.value = 0
  }
}

function scrollToBottom(behavior = 'auto') {
  nextTick(() => {
    threadBottomRef.value?.scrollIntoView({ behavior })
  })
}

function syncComposerTextareaHeight() {
  nextTick(() => {
    const textareaEl = composerTextareaRef.value?.textareaEl
    if (!textareaEl) return
    textareaEl.style.height = 'auto'
    const nextHeight = Math.min(
      Math.max(Number(textareaEl.scrollHeight || 0), COMPOSER_MIN_HEIGHT),
      COMPOSER_MAX_HEIGHT
    )
    textareaEl.style.height = `${nextHeight}px`
    textareaEl.style.overflowY = nextHeight >= COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  })
}

async function refreshProviderRuntime() {
  await aiStore.refreshProviderState()
}

async function hydrateWorkspaceSessions() {
  await aiStore.restoreWorkspaceSessions(workspace.path || '')
  await aiStore.ensureSessionState()
}

onMounted(() => {
  void hydrateWorkspaceSessions()
  void refreshProviderRuntime()
  scrollToBottom('auto')
  syncComposerTextareaHeight()
})

onActivated(() => {
  void hydrateWorkspaceSessions()
  void refreshProviderRuntime()
  scrollToBottom('auto')
  syncComposerTextareaHeight()
})

watch(
  () => [workspace.path, workspace.globalConfigDir],
  () => {
    void hydrateWorkspaceSessions()
    void filesStore.ensureFlatFilesReady({ force: true }).catch(() => {})
  }
)

watch(
  messages,
  () => {
    scrollToBottom(messages.value.length > 0 ? 'smooth' : 'auto')
  },
  { deep: true }
)

watch(
  () => aiStore.currentSessionId,
  () => {
    scrollToBottom('auto')
    syncComposerTextareaHeight()
  }
)

watch(
  () => [aiStore.currentSessionId, currentPermissionMode.value],
  ([sessionId, permissionMode]) => {
    if (!String(sessionId || '').trim() || permissionMode === 'plan') return
    permissionModeFallbackBySession.value = {
      ...permissionModeFallbackBySession.value,
      [sessionId]: permissionMode,
    }
  },
  { immediate: true }
)

watch(composerSuggestions, (next) => {
  if (!next.length || activeInvocationIndex.value >= next.length) {
    activeInvocationIndex.value = 0
  }
})

watch(
  () => aiStore.promptDraft,
  () => {
    syncComposerTextareaHeight()
  },
  { immediate: true }
)

watch(
  composerToken,
  (token) => {
    if (isAgentMode.value && token?.prefix === '@' && workspace.path) {
      void filesStore.ensureFlatFilesReady({ force: false }).catch(() => {})
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.ai-agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  container-type: inline-size;
  color: var(--text-primary);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 70%, var(--surface-raised) 30%), transparent 34%),
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 8%, transparent), transparent 42%);
  isolation: isolate;
}

.ai-agent-panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 12%, transparent);
  background: transparent;
  z-index: 10;
}

.ai-agent-panel__workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px 14px 12px;
}

.ai-agent-panel__session-control {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
}

.ai-agent-panel__hero {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 2px 2px;
}

.ai-agent-panel__hero.is-busy .ai-agent-panel__hero-eyebrow {
  color: color-mix(in srgb, var(--text-primary) 86%, var(--accent) 14%);
}

.ai-agent-panel__hero-eyebrow {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-secondary);
}

.ai-agent-panel__hero-note {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-tertiary);
  max-width: 34ch;
}

.ai-agent-panel__runtime-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-agent-panel__thread-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  border-radius: 24px;
  border: 1px solid color-mix(in srgb, var(--border-color) 16%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 92%, transparent), color-mix(in srgb, var(--surface-raised) 96%, transparent));
  box-shadow:
    0 18px 50px rgba(15, 23, 42, 0.05),
    inset 0 1px 0 color-mix(in srgb, white 55%, transparent);
}

.ai-agent-panel__thread {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 14px 18px;
  background: transparent;
}

.ai-agent-panel__messages {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-agent-panel__composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  background: transparent;
}

.ai-agent-panel__composer-well {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-agent-panel__composer-input {
  position: relative;
}

.ai-agent-panel__composer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
}

.ai-agent-panel__composer-tools {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

.ai-agent-panel__execution-policy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

.ai-agent-panel__policy-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 22%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-base) 92%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.12s ease,
    background-color 0.12s ease,
    border-color 0.12s ease,
    opacity 0.12s ease,
    transform 0.12s ease;
}

.ai-agent-panel__policy-pill:hover:not(:disabled) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 26%, transparent);
  transform: translateY(-0.5px);
}

.ai-agent-panel__policy-pill:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent),
    0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
}

.ai-agent-panel__policy-pill.is-active {
  color: color-mix(in srgb, var(--accent) 82%, var(--text-primary) 18%);
  border-color: color-mix(in srgb, var(--accent) 26%, transparent);
}

.ai-agent-panel__policy-pill.is-warning {
  color: color-mix(in srgb, var(--warning) 86%, var(--text-primary) 14%);
  border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}

.ai-agent-panel__policy-pill.is-disabled,
.ai-agent-panel__policy-pill:disabled {
  opacity: 0.46;
  cursor: default;
  transform: none;
}

.ai-agent-panel__composer-primary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  margin-left: auto;
}

.ai-agent-panel__send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-primary) 92%, transparent);
  color: color-mix(in srgb, var(--surface-base) 88%, black 12%);
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.14);
  cursor: pointer;
  transition:
    transform 0.1s ease,
    opacity 0.1s ease,
    background-color 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease;
}

.ai-agent-panel__send-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-primary) 98%, transparent);
  transform: translateY(-0.5px);
  box-shadow: 0 20px 32px rgba(15, 23, 42, 0.18);
}

.ai-agent-panel__stop-button {
  background: color-mix(in srgb, var(--text-primary) 10%, var(--surface-base) 90%);
  color: var(--text-primary);
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.08);
}

.ai-agent-panel__stop-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-primary) 14%, var(--surface-base) 86%);
  color: var(--text-primary);
}

.ai-agent-panel__send-button:active:not(:disabled) {
  transform: translateY(0.5px);
}

.ai-agent-panel__send-button:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent),
    0 0 0 1px var(--accent),
    0 18px 30px rgba(15, 23, 42, 0.16);
}

.ai-agent-panel__send-button.is-disabled,
.ai-agent-panel__send-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.ai-agent-panel__send-button.is-blocked {
  opacity: 0.42;
}

.ai-agent-panel__textarea {
  padding: 2px 4px !important;
  min-height: 24px;
  max-height: 400px;
}

.ai-agent-panel__error {
  font-size: 12px;
  line-height: 1.5;
  color: var(--error);
}

.ai-agent-panel__empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 4px 22px;
  align-items: flex-start;
  text-align: left;
  max-width: 280px;
}

.ai-agent-panel__empty-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

.ai-agent-panel__empty-note {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell) {
  border: 1px solid color-mix(in srgb, var(--border-color) 18%, transparent) !important;
  border-radius: 28px !important;
  background: color-mix(in srgb, var(--surface-base) 94%, transparent) !important;
  box-shadow:
    0 14px 30px rgba(15, 23, 42, 0.06),
    inset 0 1px 0 color-mix(in srgb, white 46%, transparent) !important;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell.ui-textarea-shell--ghost:hover),
.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell.ui-textarea-shell--ghost:focus-within) {
  background: color-mix(in srgb, var(--surface-base) 96%, transparent) !important;
  border-color: color-mix(in srgb, var(--border-color) 24%, transparent) !important;
  box-shadow:
    0 18px 32px rgba(15, 23, 42, 0.08),
    0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent) !important;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell .ui-textarea-control) {
  min-height: 132px;
  height: 132px;
  max-height: 240px;
  padding: 18px 22px 8px !important;
  resize: none;
  font-size: 17px;
  line-height: 1.6;
  color: var(--text-primary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell) {
  width: auto;
  max-width: 168px;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger) {
  height: 38px;
  width: auto;
  max-width: 168px;
  padding: 0 30px 0 14px;
  border-color: color-mix(in srgb, var(--border-color) 16%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-hover) 55%, transparent);
  box-shadow: none;
  color: var(--text-secondary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger:hover),
.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-trigger:focus-visible) {
  border-color: color-mix(in srgb, var(--border-color) 26%, transparent);
  background: color-mix(in srgb, var(--surface-hover) 78%, transparent);
  color: var(--text-primary);
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell.is-disabled .ui-select-trigger) {
  opacity: 0.55;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-value) {
  font-size: 12px;
  font-weight: 600;
}

.ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell .ui-select-caret) {
  right: 7px;
  opacity: 0.7;
}

.ai-agent-panel__tool-button {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: color-mix(in srgb, var(--surface-hover) 60%, transparent);
  color: var(--text-secondary);
  box-shadow: none;
}

.ai-agent-panel__tool-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 92%, transparent);
  color: var(--text-primary);
}

@container (max-width: 380px) {
  .ai-agent-panel__workspace {
    padding-inline: 10px;
  }

  .ai-agent-panel__composer :deep(.ai-agent-panel__textarea-shell .ui-textarea-control) {
    min-height: 110px;
    height: 110px;
    padding-inline: 18px !important;
  }
}

@container (max-width: 320px) {
  .ai-agent-panel__composer-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .ai-agent-panel__composer-primary {
    margin-left: 0;
    justify-content: space-between;
    width: 100%;
  }

  .ai-agent-panel__composer :deep(.ai-agent-panel__model-chip-shell) {
    max-width: none;
    flex: 1 1 auto;
  }

  .ai-agent-panel__empty {
    max-width: none;
  }
}
</style>
