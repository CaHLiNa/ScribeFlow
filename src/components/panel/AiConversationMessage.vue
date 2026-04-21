<template>
  <article class="ai-conversation-message" :class="`is-${message.role}`">
    <div class="ai-conversation-message__meta">
      <span class="ai-conversation-message__role">
        {{ message.role === 'assistant' ? t('Assistant') : t('You') }}
      </span>
      <span v-if="formattedTime" class="ai-conversation-message__meta-separator">·</span>
      <span v-if="formattedTime" class="ai-conversation-message__time">{{ formattedTime }}</span>
    </div>

    <div
      class="ai-conversation-message__body"
      :class="
        message.role === 'assistant'
          ? 'ai-conversation-message__body--assistant'
          : 'ai-conversation-message__body--user'
      "
    >
      <div
        class="ai-conversation-message__surface"
        :class="
          message.role === 'assistant'
            ? 'ai-conversation-message__surface--assistant'
            : 'ai-conversation-message__surface--user'
        "
      >
        <template v-if="message.role === 'user'">
          <div class="ai-conversation-message__user-text">
            {{ messageText }}
          </div>
        </template>

        <template v-else>
          <AiTaskProgressCard :tasks="taskProgressTasks" />

          <template
            v-for="(part, index) in displayParts"
            :key="`${message.id}:${index}:${part.type}`"
          >
            <template v-if="part.type === 'status'"></template>

            <details
              v-else-if="part.type === 'support'"
              class="ai-conversation-message__support"
              :open="part.isStreaming === true"
            >
              <summary>{{ part.label || t('Support note') }}</summary>
              <div class="ai-conversation-message__support-body">{{ part.text }}</div>
            </details>

            <AiToolLine v-else-if="part.type === 'tool'" :part="part" />

            <div
              v-else-if="part.type === 'text'"
              class="ai-conversation-message__response"
              :class="{
                'ai-conversation-message__response--placeholder': part.isPlaceholder === true,
              }"
            >
              {{ resolveDisplayedText(index, part.text) }}
            </div>

            <div v-else-if="part.type === 'note'" class="ai-conversation-message__note">
              <div class="ai-conversation-message__note-label">{{ part.label }}</div>
              <div class="ai-conversation-message__note-text">{{ part.text }}</div>
            </div>

            <div v-else-if="part.type === 'error'" class="ai-conversation-message__error">
              {{ part.text }}
            </div>

            <AiArtifactInlineCard
              v-else-if="part.type === 'artifact'"
              :artifact="resolveArtifact(part.artifactId)"
              :can-apply="artifactCanApply(part.artifactId)"
              :can-dismiss="artifactCanDismiss(part.artifactId)"
              :can-rollback="artifactCanRollback(part.artifactId)"
              :action-label="artifactActionLabel(part.artifactId)"
              @apply="$emit('apply-artifact', $event)"
              @dismiss="$emit('dismiss-artifact', $event)"
              @rollback="$emit('rollback-artifact', $event)"
            />
          </template>
        </template>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n, formatDate } from '../../i18n'
import AiArtifactInlineCard from './AiArtifactInlineCard.vue'
import AiTaskProgressCard from './AiTaskProgressCard.vue'
import AiToolLine from './AiToolLine.vue'

const props = defineProps({
  message: { type: Object, required: true },
  artifactsById: { type: Object, default: () => ({}) },
})

defineEmits(['apply-artifact', 'dismiss-artifact', 'rollback-artifact'])

const { t } = useI18n()
const displayedTextMap = ref({})

function trimText(value = '') {
  return String(value || '').trim()
}

function extractAiMessageText(message = null) {
  if (!message) return ''
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts
      .filter(
        (part) =>
          part.type === 'text' ||
          part.type === 'support' ||
          part.type === 'note' ||
          part.type === 'error'
      )
      .map((part) => trimText(part.text))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
  return trimText(message.content)
}

const displayParts = computed(() => {
  if (Array.isArray(props.message.parts) && props.message.parts.length > 0) {
    return props.message.parts
  }
  const extractedText = extractAiMessageText(props.message)
  if (props.message.role === 'assistant' && !extractedText) {
    return [{ type: 'text', text: t('Working...'), isPlaceholder: true }]
  }
  return [{ type: 'text', text: extractedText }]
})

function getAiArtifactCapability(artifact = null) {
  const type = String(artifact?.type || '').trim()
  if (!type) return null
  const capabilityByType = {
    doc_patch: 'Apply patch',
    note_draft: 'Open draft',
    citation_insert: 'Insert citation',
    reference_patch: 'Apply reference update',
    related_work_outline: 'Open outline',
    reading_note_bundle: 'Open reading note',
    claim_evidence_map: 'Open evidence map',
    compile_fix: 'Open compile fix',
    comparison_table: 'Open comparison table',
  }
  const labelKey = capabilityByType[type]
  if (!labelKey) return null
  return { artifactType: type, labelKey }
}

const messageText = computed(() => extractAiMessageText(props.message))
const taskProgressTasks = computed(() => {
  return displayParts.value
    .filter((part) => part?.type === 'tool')
    .filter((part) => {
      const toolName = String(part?.payload?.toolName || part.label || '').trim()
      return ['taskcreate', 'taskupdate', 'todowrite'].includes(toolName.toLowerCase())
    })
    .map((part) => ({
      id: part.toolId,
      label: part.detail || part.context || part.label,
      status: part.status,
    }))
})
const formattedTime = computed(() =>
  props.message.createdAt
    ? formatDate(props.message.createdAt, { hour: '2-digit', minute: '2-digit' })
    : ''
)

const textPartSignature = computed(() =>
  displayParts.value
    .map((part, index) => (part.type === 'text' ? `${index}:${part.text}` : ''))
    .join('|')
)

function resolveArtifact(artifactId = '') {
  return props.artifactsById[String(artifactId || '').trim()] || null
}

function artifactCanApply(artifactId = '') {
  const artifact = resolveArtifact(artifactId)
  if (['dismissed', 'rolled-back'].includes(String(artifact?.status || '').trim())) return false
  return !!getAiArtifactCapability(artifact)
}

function artifactCanDismiss(artifactId = '') {
  const artifact = resolveArtifact(artifactId)
  const status = String(artifact?.status || '').trim()
  return !!artifact && status !== 'applied' && status !== 'dismissed' && status !== 'rolled-back'
}

function artifactCanRollback(artifactId = '') {
  const artifact = resolveArtifact(artifactId)
  if (!artifact) return false
  return artifact.rollbackSupported === true && String(artifact.status || '').trim() === 'applied'
}

function artifactActionLabel(artifactId = '') {
  const artifact = resolveArtifact(artifactId)
  const capability = getAiArtifactCapability(artifact)
  return capability ? t(capability.labelKey) : ''
}

function updateDisplayedText(index, text) {
  displayedTextMap.value = {
    ...displayedTextMap.value,
    [index]: text,
  }
}

function syncDisplayedText() {
  for (const [index, part] of displayParts.value.entries()) {
    if (part.type !== 'text') continue
    const fullText = String(part.text || '')
    if (displayedTextMap.value[index] === fullText) continue
    updateDisplayedText(index, fullText)
  }
}

function resolveDisplayedText(index, fallbackText = '') {
  return displayedTextMap.value[index] ?? fallbackText
}

watch(
  () => textPartSignature.value,
  () => {
    syncDisplayedText()
  },
  { immediate: true }
)
</script>

<style scoped>
.ai-conversation-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-conversation-message__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.ai-conversation-message.is-user .ai-conversation-message__meta {
  justify-content: flex-end;
  text-align: right;
}

.ai-conversation-message__role {
  font-weight: 600;
  color: var(--text-tertiary);
}

.ai-conversation-message__meta-separator,
.ai-conversation-message__time {
  color: var(--text-tertiary);
}

.ai-conversation-message__context {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ai-conversation-message__body {
  display: flex;
}

.ai-conversation-message__body--user {
  justify-content: flex-end;
}

.ai-conversation-message__body--assistant {
  justify-content: stretch;
}

.ai-conversation-message__surface {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ai-conversation-message__surface--assistant {
  width: 100%;
  padding: 2px 0;
  background: transparent;
  border: none;
}

.ai-conversation-message__surface--user {
  max-width: 92%;
  padding: 2px 0;
  background: transparent;
  border: none;
}

.ai-conversation-message__user-text,
.ai-conversation-message__response,
.ai-conversation-message__support-body,
.ai-conversation-message__note-text,
.ai-conversation-message__error {
  font-size: 13px;
  line-height: 1.58;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-conversation-message__user-text,
.ai-conversation-message__response {
  color: var(--text-primary);
}

.ai-conversation-message__user-text {
  color: color-mix(in srgb, var(--text-primary) 88%, var(--text-secondary) 12%);
}

.ai-conversation-message__support {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 0 2px 10px;
  background: transparent;
  border-left: 1px solid color-mix(in srgb, var(--border-color) 42%, transparent);
}

.ai-conversation-message__support summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  list-style: none;
}

.ai-conversation-message__support summary::-webkit-details-marker {
  display: none;
}

.ai-conversation-message__pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 3px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 32%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 8%, transparent);
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.ai-conversation-message__pill--accent {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text-primary);
}

.ai-conversation-message__pill--context {
  align-items: baseline;
  flex-wrap: wrap;
}

.ai-conversation-message__pill-label {
  color: var(--text-tertiary);
}

.ai-conversation-message__pill-value {
  color: var(--text-secondary);
}

.ai-conversation-message__note {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel-muted) 26%, transparent);
}

.ai-conversation-message__note-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ai-conversation-message__error {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--error) 8%, transparent);
  color: var(--error);
}

.ai-conversation-message__response--placeholder {
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
