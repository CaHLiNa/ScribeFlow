import { defineStore } from 'pinia'
import { nanoid } from './utils'
import { applyTextPatchToContent, normalizeAiArtifact } from '../domains/ai/aiArtifactRuntime.js'
import {
  buildAiContextBundle,
  normalizeAiSelection,
  recommendAiSkills,
  skillHasRequiredContext,
} from '../domains/ai/aiContextRuntime.js'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { useReferencesStore } from './references'
import { useToastStore } from './toast'
import { t } from '../i18n/index.js'
import {
  AI_SKILL_DEFINITIONS,
  buildPreparedAiBrief,
  getAiSkillById,
} from '../services/ai/skillRegistry.js'
import {
  getAiProviderConfig,
  getAiProviderDefinition,
  loadAiApiKey,
  loadAiConfig,
  setCurrentAiProvider,
} from '../services/ai/settings.js'
import { executeAiSkill } from '../services/ai/executor.js'

function buildUserMessage(skill = {}, userInstruction = '') {
  const title = String(skill?.titleKey || skill?.id || 'AI task').trim()
  const detail = String(userInstruction || '').trim()
  if (!detail) return title
  return `${title}\n\n${detail}`
}

function normalizeConversation(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').trim(),
    }))
    .filter((message) => message.content)
}

function buildArtifactRecord(skillId = '', artifact = null) {
  if (!artifact) return null
  return {
    id: `artifact:${nanoid()}`,
    skillId,
    status: 'pending',
    createdAt: Date.now(),
    ...artifact,
  }
}

export const useAiStore = defineStore('ai', {
  state: () => ({
    editorSelection: normalizeAiSelection(),
    activeSkillId: 'grounded-chat',
    promptDraft: '',
    messages: [],
    artifacts: [],
    lastError: '',
    isRunning: false,
    providerState: {
      ready: false,
      hasKey: false,
      currentProviderId: 'openai',
      currentProviderLabel: 'OpenAI',
      baseUrl: '',
      model: '',
    },
  }),

  getters: {
    currentContextBundle(state) {
      const editorStore = useEditorStore()
      const referencesStore = useReferencesStore()

      return buildAiContextBundle({
        activeFile: editorStore.activeTab,
        selection: state.editorSelection,
        selectedReference: referencesStore.selectedReference,
      })
    },

    recommendedSkills() {
      return recommendAiSkills(this.currentContextBundle, AI_SKILL_DEFINITIONS)
    },

    activeSkill(state) {
      return getAiSkillById(state.activeSkillId) || this.recommendedSkills[0] || null
    },

    preparedBrief() {
      return this.activeSkill
        ? buildPreparedAiBrief(this.activeSkill.id, this.currentContextBundle)
        : ''
    },

    latestArtifact(state) {
      return state.artifacts[0] || null
    },
  },

  actions: {
    updateEditorSelection(selection = null) {
      this.editorSelection = normalizeAiSelection(selection)
    },

    clearEditorSelection(filePath = '') {
      if (!filePath || this.editorSelection.filePath === filePath) {
        this.editorSelection = normalizeAiSelection()
      }
    },

    selectSkill(skillId = '') {
      if (!getAiSkillById(skillId)) return
      this.activeSkillId = skillId
    },

    setPromptDraft(value = '') {
      this.promptDraft = String(value || '')
    },

    clearSession() {
      this.messages = []
      this.artifacts = []
      this.lastError = ''
    },

    async refreshProviderState() {
      const config = await loadAiConfig()
      const currentProviderId = String(config?.currentProviderId || 'openai').trim()
      const providerConfig = getAiProviderConfig(config, currentProviderId)
      const providerDefinition = getAiProviderDefinition(currentProviderId)
      const apiKey = await loadAiApiKey(currentProviderId)

      this.providerState = {
        ready:
          !!String(providerConfig?.baseUrl || '').trim()
          && !!String(providerConfig?.model || '').trim()
          && !!String(apiKey || '').trim(),
        hasKey: !!String(apiKey || '').trim(),
        currentProviderId,
        currentProviderLabel: providerDefinition?.label || currentProviderId,
        baseUrl: String(providerConfig?.baseUrl || '').trim(),
        model: String(providerConfig?.model || '').trim(),
      }
      return this.providerState
    },

    async setCurrentProvider(providerId = '') {
      await setCurrentAiProvider(providerId)
      return this.refreshProviderState()
    },

    async runActiveSkill() {
      const toastStore = useToastStore()
      const skill = this.activeSkill
      if (!skill) {
        this.lastError = t('AI skill is not available.')
        return null
      }
      if (!skillHasRequiredContext(skill, this.currentContextBundle)) {
        this.lastError = t('The selected AI skill is missing required context.')
        toastStore.show(this.lastError, { type: 'warning' })
        return null
      }

      const providerState = await this.refreshProviderState()
      if (!providerState.ready) {
        this.lastError = t('AI settings are incomplete. Configure the provider before running a skill.')
        toastStore.show(this.lastError, { type: 'warning' })
        return null
      }

      const fullConfig = await loadAiConfig()
      const providerId = String(fullConfig?.currentProviderId || 'openai').trim()
      const [config, apiKey] = await Promise.all([
        Promise.resolve(getAiProviderConfig(fullConfig, providerId)),
        loadAiApiKey(providerId),
      ])
      const userInstruction = String(this.promptDraft || '').trim()
      const priorConversation = normalizeConversation(this.messages.slice(-6))
      const userMessage = {
        id: `message:${nanoid()}`,
        role: 'user',
        content: buildUserMessage(skill, userInstruction),
        createdAt: Date.now(),
      }

      this.messages = [...this.messages, userMessage]
      this.isRunning = true
      this.lastError = ''

      try {
        const result = await executeAiSkill({
          skillId: skill.id,
          contextBundle: this.currentContextBundle,
          config: {
            ...config,
            providerId,
          },
          apiKey: apiKey || '',
          userInstruction,
          conversation: priorConversation,
        })

        const artifact = buildArtifactRecord(skill.id, normalizeAiArtifact(
          skill.id,
          result.payload,
          this.currentContextBundle,
          result.content
        ))

        const assistantMessage = {
          id: `message:${nanoid()}`,
          role: 'assistant',
          content:
            artifact?.type === 'doc_patch'
              ? artifact.replacementText
              : artifact?.type === 'note_draft'
                ? artifact.content
                : artifact?.content || result.content,
          createdAt: Date.now(),
          artifactId: artifact?.id || '',
        }

        this.messages = [...this.messages, assistantMessage]
        if (artifact) {
          this.artifacts = [artifact, ...this.artifacts]
        }
        this.promptDraft = ''
        return { assistantMessage, artifact }
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error || 'AI execution failed.')
        toastStore.show(this.lastError, { type: 'error' })
        return null
      } finally {
        this.isRunning = false
      }
    },

    async applyArtifact(artifactId = '') {
      const artifact = this.artifacts.find((item) => item.id === artifactId)
      if (!artifact || artifact.status === 'applied') return false

      const toastStore = useToastStore()
      const editorStore = useEditorStore()
      const filesStore = useFilesStore()

      try {
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
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error || t('Failed to apply AI artifact.'))
        toastStore.show(this.lastError, { type: 'error' })
        return false
      }
    },
  },
})
