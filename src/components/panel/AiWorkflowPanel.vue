<template>
  <section class="ai-workflow-panel">
    <div class="ai-workflow-panel__header">
      <div>
        <div class="ai-workflow-panel__eyebrow">{{ t('AI workflow') }}</div>
        <h2 class="ai-workflow-panel__title">{{ t('Grounded context') }}</h2>
      </div>
      <div class="ai-workflow-panel__header-actions">
        <UiButton variant="secondary" size="sm" @click="workspace.openSettings('ai')">
          {{ t('Configure AI') }}
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          :disabled="!preparedBrief"
          @click="copyBrief"
        >
          {{ t('Copy brief') }}
        </UiButton>
      </div>
    </div>

    <div class="ai-workflow-panel__section">
      <div class="ai-workflow-panel__section-title">{{ t('Provider status') }}</div>
      <div class="ai-provider-status__selector">
        <UiSelect
          :model-value="aiStore.providerState.currentProviderId"
          size="sm"
          :options="providerOptions"
          @update:model-value="switchProvider"
        />
      </div>
      <div
        class="ai-provider-status"
        :class="{ 'is-ready': aiStore.providerState.ready, 'is-missing': !aiStore.providerState.ready }"
      >
        <div class="ai-provider-status__headline">
          {{
            aiStore.providerState.ready
              ? t('AI provider ready')
              : t('AI provider needs setup')
          }}
        </div>
        <div class="ai-provider-status__copy">
          {{
            aiStore.providerState.ready
              ? `${aiStore.providerState.currentProviderLabel} · ${aiStore.providerState.model} · ${aiStore.providerState.baseUrl}`
              : t('Open AI settings to add a base URL, model, and API key.')
          }}
        </div>
      </div>
    </div>

    <div class="ai-workflow-panel__section">
      <div class="ai-workflow-panel__section-title">{{ t('Current context') }}</div>
      <div class="ai-workflow-panel__chips">
        <div class="ai-context-chip" :class="{ 'is-ready': contextBundle.document.available }">
          <span class="ai-context-chip__label">{{ t('Document') }}</span>
          <span class="ai-context-chip__value">
            {{ contextBundle.document.available ? contextBundle.document.label : t('No active document') }}
          </span>
        </div>
        <div class="ai-context-chip" :class="{ 'is-ready': contextBundle.selection.available }">
          <span class="ai-context-chip__label">{{ t('Selection') }}</span>
          <span class="ai-context-chip__value">
            {{
              contextBundle.selection.available
                ? contextBundle.selection.preview
                : t('No editor selection')
            }}
          </span>
        </div>
        <div class="ai-context-chip" :class="{ 'is-ready': contextBundle.reference.available }">
          <span class="ai-context-chip__label">{{ t('Reference') }}</span>
          <span class="ai-context-chip__value">
            {{
              contextBundle.reference.available
                ? referenceLabel
                : t('No selected reference')
            }}
          </span>
        </div>
      </div>
    </div>

    <div class="ai-workflow-panel__section">
      <div class="ai-workflow-panel__section-title">{{ t('Recommended skills') }}</div>
      <div class="ai-skill-list">
        <button
          v-for="skill in recommendedSkills"
          :key="skill.id"
          type="button"
          class="ai-skill-card"
          :class="{
            'is-active': activeSkill?.id === skill.id,
            'is-available': skill.available,
            'is-blocked': !skill.available,
          }"
          @click="aiStore.selectSkill(skill.id)"
        >
          <div class="ai-skill-card__topline">
            <span class="ai-skill-card__title">{{ t(skill.titleKey) }}</span>
            <span class="ai-skill-card__badge">
              {{ skill.available ? t('Ready') : t('Needs context') }}
            </span>
          </div>
          <div class="ai-skill-card__description">{{ t(skill.descriptionKey) }}</div>
          <div class="ai-skill-card__reason">{{ t(skill.reason) }}</div>
        </button>
      </div>
    </div>

    <div class="ai-workflow-panel__section">
      <div class="ai-workflow-panel__section-title">{{ t('Run skill') }}</div>
      <div v-if="activeSkill" class="ai-workflow-panel__brief-label">
        {{ t(activeSkill.titleKey) }}
      </div>
      <UiTextarea
        :model-value="aiStore.promptDraft"
        variant="ghost"
        :rows="4"
        :placeholder="t('Add an extra instruction for this AI run...')"
        @update:model-value="aiStore.setPromptDraft($event)"
      />
      <div class="ai-run-actions">
        <UiButton
          variant="primary"
          size="sm"
          :disabled="aiStore.isRunning || !activeSkill || !activeSkillReady"
          @click="runSkill"
        >
          {{ aiStore.isRunning ? t('Running...') : t('Run AI skill') }}
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          :disabled="aiStore.messages.length === 0 && aiStore.artifacts.length === 0"
          @click="aiStore.clearSession()"
        >
          {{ t('Clear session') }}
        </UiButton>
      </div>
      <div v-if="aiStore.lastError" class="ai-inline-error">{{ aiStore.lastError }}</div>
    </div>

    <div class="ai-workflow-panel__section ai-workflow-panel__section--messages">
      <div class="ai-workflow-panel__section-title">{{ t('Session') }}</div>
      <div v-if="messages.length === 0" class="ai-empty-copy">
        {{ t('Run a skill to start an AI session grounded in the current project context.') }}
      </div>
      <div v-else class="ai-message-list">
        <div
          v-for="message in messages"
          :key="message.id"
          class="ai-message"
          :class="`ai-message--${message.role}`"
        >
          <div class="ai-message__role">
            {{ message.role === 'assistant' ? t('Assistant') : t('You') }}
          </div>
          <div class="ai-message__content">{{ message.content }}</div>
        </div>
      </div>
    </div>

    <div class="ai-workflow-panel__section ai-workflow-panel__section--artifacts">
      <div class="ai-workflow-panel__section-title">{{ t('Artifacts') }}</div>
      <div v-if="artifacts.length === 0" class="ai-empty-copy">
        {{ t('No AI artifacts yet.') }}
      </div>
      <div v-else class="ai-artifact-list">
        <div v-for="artifact in artifacts" :key="artifact.id" class="ai-artifact-card">
          <div class="ai-artifact-card__topline">
            <div class="ai-artifact-card__title">{{ artifact.title || artifact.type }}</div>
            <div class="ai-artifact-card__badge">
              {{ artifact.status === 'applied' ? t('Applied') : t('Pending') }}
            </div>
          </div>
          <div class="ai-artifact-card__content">
            {{ artifactPreview(artifact) }}
          </div>
          <div class="ai-artifact-card__actions">
            <UiButton
              v-if="artifact.type === 'doc_patch' || artifact.type === 'note_draft'"
              variant="secondary"
              size="sm"
              :disabled="artifact.status === 'applied'"
              @click="aiStore.applyArtifact(artifact.id)"
            >
              {{
                artifact.type === 'doc_patch'
                  ? t('Apply to draft')
                  : t('Open as draft')
              }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <div class="ai-workflow-panel__section ai-workflow-panel__section--brief">
      <div class="ai-workflow-panel__section-title">{{ t('Prepared brief') }}</div>
      <pre class="ai-workflow-panel__brief">{{ preparedBrief }}</pre>
    </div>
  </section>
</template>

<script setup>
import { computed, onActivated, onMounted } from 'vue'
import { useI18n } from '../../i18n'
import { useAiStore } from '../../stores/ai'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { AI_PROVIDER_DEFINITIONS } from '../../services/ai/settings.js'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const toastStore = useToastStore()
const workspace = useWorkspaceStore()

const contextBundle = computed(() => aiStore.currentContextBundle)
const recommendedSkills = computed(() => aiStore.recommendedSkills)
const activeSkill = computed(() => aiStore.activeSkill)
const preparedBrief = computed(() => aiStore.preparedBrief)
const messages = computed(() => aiStore.messages)
const artifacts = computed(() => aiStore.artifacts)
const providerOptions = AI_PROVIDER_DEFINITIONS.map((provider) => ({
  value: provider.id,
  label: provider.label,
}))
const activeSkillRecommendation = computed(
  () => recommendedSkills.value.find((skill) => skill.id === activeSkill.value?.id) || null
)
const activeSkillReady = computed(() => activeSkillRecommendation.value?.available === true)

const referenceLabel = computed(() => {
  if (!contextBundle.value.reference.available) return ''
  const key = contextBundle.value.reference.citationKey
  if (key) return `${key} · ${contextBundle.value.reference.title}`
  return contextBundle.value.reference.title
})

function artifactPreview(artifact = {}) {
  if (artifact.type === 'doc_patch') return artifact.replacementText
  if (artifact.type === 'note_draft') return artifact.content
  return artifact.content || artifact.rationale || ''
}

async function copyBrief() {
  const text = preparedBrief.value
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
    toastStore.show(t('Brief copied'), { type: 'success' })
  } catch (error) {
    toastStore.show(error instanceof Error ? error.message : t('Copy failed'), { type: 'error' })
  }
}

async function runSkill() {
  await aiStore.runActiveSkill()
}

async function switchProvider(providerId = '') {
  await aiStore.setCurrentProvider(providerId)
}

onMounted(() => {
  void aiStore.refreshProviderState()
})

onActivated(() => {
  void aiStore.refreshProviderState()
})
</script>

<style scoped>
.ai-workflow-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  height: 100%;
  color: var(--text-color);
}

.ai-workflow-panel__header,
.ai-workflow-panel__section {
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel-surface) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
}

.ai-workflow-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
}

.ai-workflow-panel__header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ai-workflow-panel__eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ai-workflow-panel__title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
}

.ai-workflow-panel__section {
  padding: 14px;
}

.ai-provider-status__selector {
  margin-bottom: 10px;
}

.ai-workflow-panel__section-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.ai-provider-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 74%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 75%, transparent);
}

.ai-provider-status.is-ready {
  border-color: color-mix(in srgb, var(--success) 42%, var(--border-color) 58%);
  background: color-mix(in srgb, var(--success) 9%, var(--panel-muted) 91%);
}

.ai-provider-status__headline {
  font-size: 13px;
  font-weight: 600;
}

.ai-provider-status__copy,
.ai-inline-error,
.ai-empty-copy,
.ai-message__content,
.ai-artifact-card__content {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-inline-error {
  margin-top: 10px;
  color: var(--error);
}

.ai-workflow-panel__chips,
.ai-skill-list,
.ai-artifact-list {
  display: grid;
  gap: 10px;
}

.ai-context-chip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-muted) 75%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 74%, transparent);
}

.ai-context-chip.is-ready {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border-color) 66%);
  background: color-mix(in srgb, var(--accent) 7%, var(--panel-muted) 93%);
}

.ai-context-chip__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ai-context-chip__value {
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}

.ai-skill-card,
.ai-artifact-card,
.ai-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--border-color) 76%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 70%, transparent);
}

.ai-skill-card {
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    transform 140ms ease;
}

.ai-skill-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border-color) 62%);
}

.ai-skill-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 54%, var(--border-color) 46%);
  background: color-mix(in srgb, var(--accent) 9%, var(--panel-muted) 91%);
}

.ai-skill-card.is-blocked {
  opacity: 0.78;
}

.ai-skill-card__topline,
.ai-artifact-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ai-skill-card__title,
.ai-artifact-card__title {
  font-size: 14px;
  font-weight: 600;
}

.ai-skill-card__badge,
.ai-artifact-card__badge {
  flex: 0 0 auto;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--panel-surface) 84%, transparent);
}

.ai-skill-card__description,
.ai-skill-card__reason,
.ai-message__role {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ai-message-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 260px;
  overflow: auto;
}

.ai-message--assistant {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border-color) 76%);
}

.ai-message__role {
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ai-run-actions,
.ai-artifact-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ai-workflow-panel__section--brief {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}

.ai-workflow-panel__brief-label {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}

.ai-workflow-panel__brief {
  flex: 1 1 auto;
  min-height: 180px;
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  background: color-mix(in srgb, var(--panel-muted) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 74%, transparent);
}
</style>
