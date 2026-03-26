import { isLatex, isTypst } from '../../utils/fileTypes.js'

function isDocumentAiTarget(filePath) {
  return isLatex(filePath) || isTypst(filePath)
}

export function createDocumentWorkflowAiRuntime({
  startWorkflowRunImpl = null,
  createFixTaskImpl = null,
  createDiagnoseTaskImpl = null,
  prepareTaskImpl = null,
} = {}) {
  async function resolveStartWorkflowRun() {
    if (startWorkflowRunImpl) return startWorkflowRunImpl
    const mod = await import('../../services/ai/launch.js')
    return mod.startWorkflowRun
  }

  async function resolveFixTaskCreator() {
    if (createFixTaskImpl) return createFixTaskImpl
    const mod = await import('../../services/ai/taskCatalog.js')
    return mod.createTexTypFixTask
  }

  async function resolveDiagnoseTaskCreator() {
    if (createDiagnoseTaskImpl) return createDiagnoseTaskImpl
    const mod = await import('../../services/ai/taskCatalog.js')
    return mod.createTexTypDiagnoseTask
  }

  async function resolveTaskPreparer() {
    if (prepareTaskImpl) return prepareTaskImpl
    const mod = await import('../../services/ai/texTypFixer.js')
    return mod.prepareTexTypFixTask
  }

  async function launchFixForFile(filePath, options = {}) {
    if (!isDocumentAiTarget(filePath)) return null
    if (!options.chatStore) return null

    const startWorkflowRun = await resolveStartWorkflowRun()
    const createFixTask = await resolveFixTaskCreator()
    const prepareTask = await resolveTaskPreparer()
    return startWorkflowRun({
      chatStore: options.chatStore,
      modelId: options.modelId,
      sessionId: options.sessionId || null,
      autoSendMessage: true,
      hideAutoSendMessage: true,
      task: await prepareTask(createFixTask({
        filePath,
        source: options.source || 'document-workflow',
        entryContext: options.entryContext || 'document-workflow',
      })),
    })
  }

  async function launchDiagnoseForFile(filePath, options = {}) {
    if (!isDocumentAiTarget(filePath)) return null
    if (!options.chatStore) return null

    const startWorkflowRun = await resolveStartWorkflowRun()
    const createDiagnoseTask = await resolveDiagnoseTaskCreator()
    const prepareTask = await resolveTaskPreparer()
    return startWorkflowRun({
      chatStore: options.chatStore,
      modelId: options.modelId,
      sessionId: options.sessionId || null,
      autoSendMessage: true,
      hideAutoSendMessage: true,
      task: await prepareTask(createDiagnoseTask({
        filePath,
        source: options.source || 'document-workflow',
        entryContext: options.entryContext || 'document-workflow',
      })),
    })
  }

  return {
    launchFixForFile,
    launchDiagnoseForFile,
  }
}
