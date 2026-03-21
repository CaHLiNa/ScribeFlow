import { defineStore } from 'pinia'
import { ref } from 'vue'
import { t } from '../i18n'
import { hydrateSessionWorkflow, useAiWorkflowRunsStore } from './aiWorkflowRuns'
import { describeWorkflowHeader } from '../components/ai/workflowUi.js'

const ROLE_BADGES = {
  general: 'chat',
  writer: 'write',
  researcher: 'research',
  reviewer: 'review',
  citation_librarian: 'cite',
  code_assistant: 'code',
  tex_typ_fixer: 'fix',
  pdf_translator: 'pdf',
}

const ROLE_TITLES = {
  general: 'General AI task',
  writer: 'Writing task',
  researcher: 'Research task',
  reviewer: 'Review task',
  citation_librarian: 'Citation task',
  code_assistant: 'Code task',
  tex_typ_fixer: 'TeX / Typst fixer',
  pdf_translator: 'PDF translation task',
}

export const useAiWorkbenchStore = defineStore('aiWorkbench', () => {
  const launcherTab = ref('ai')
  const view = ref('launcher')
  const sessionId = ref(null)

  function roleBadge(role) {
    return ROLE_BADGES[role] || 'ai'
  }

function roleTitle(role) {
    return t(ROLE_TITLES[role] || 'AI task')
  }

  function runtimeTitle(runtimeId) {
    if (runtimeId === 'opencode') return 'OpenCode runtime'
    return 'Altals runtime'
  }

  function resolveSessionWorkflow(session) {
    if (!session?.id) return hydrateSessionWorkflow(session?._workflow)
    const workflowRuns = useAiWorkflowRunsStore()
    return workflowRuns.getRunForSession(session.id) || hydrateSessionWorkflow(session._workflow)
  }

  function describeSession(session) {
    const ai = session?._ai
    if (!ai) return null
    const workflow = resolveSessionWorkflow(session)
    const workflowHeader = describeWorkflowHeader(workflow)

    return {
      label: ai.label || session.label || 'AI',
      role: ai.role || 'general',
      roleBadge: roleBadge(ai.role),
      roleTitle: roleTitle(ai.role),
      runtimeId: ai.runtimeId || 'legacy',
      runtimeTitle: t(runtimeTitle(ai.runtimeId)),
      source: ai.source || 'chat',
      taskId: ai.taskId || null,
      workflowLabel: workflowHeader?.title || null,
      workflowStatus: workflowHeader?.status || null,
      workflowStepLabel: workflowHeader?.currentStepLabel || null,
    }
  }

  function openLauncher() {
    view.value = 'launcher'
    sessionId.value = null
  }

  function openSession(id) {
    if (!id) {
      openLauncher()
      return
    }
    view.value = 'chat'
    sessionId.value = id
  }

  return {
    launcherTab,
    view,
    sessionId,
    roleBadge,
    roleTitle,
    describeSession,
    openLauncher,
    openSession,
  }
})
