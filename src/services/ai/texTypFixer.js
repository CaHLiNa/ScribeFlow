import { buildLatexWorkflowProblems } from '../documentWorkflow/adapters/latex.js'
import { buildTypstWorkflowProblems } from '../typst/diagnostics.js'
import { useLatexStore } from '../../stores/latex.js'
import { useReferencesStore } from '../../stores/references.js'
import { useTypstStore } from '../../stores/typst.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { getDocumentAdapterForFile } from '../documentWorkflow/adapters/index.js'
import { isLatex, isTypst } from '../../utils/fileTypes.js'
import { t } from '../../i18n/index.js'

function basename(path = '') {
  return String(path || '').split('/').pop() || path
}

function cleanText(value = '') {
  return String(value || '').trim()
}

function truncate(value = '', max = 1200) {
  const text = cleanText(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}...`
}

function problemLine(problem = {}) {
  if (Number.isInteger(problem?.line) && problem.line > 0) return `L${problem.line}`
  return ''
}

function normalizeProblem(problem = {}, fallbackFilePath = '') {
  return {
    sourcePath: cleanText(problem?.sourcePath || problem?.file || fallbackFilePath),
    line: Number.isInteger(problem?.line) && problem.line > 0 ? problem.line : null,
    column: Number.isInteger(problem?.column) && problem.column >= 0 ? problem.column : null,
    severity: problem?.severity === 'error' ? 'error' : 'warning',
    origin: cleanText(problem?.origin || 'compile'),
    message: cleanText(problem?.message || problem?.raw || ''),
  }
}

function buildCompileSummary({ success, errorCount, warningCount, compilerReady }) {
  if (!compilerReady) return t('Compiler is not available')
  if (success && errorCount === 0 && warningCount === 0) return t('Compile succeeded with no reported problems')
  if (success && warningCount > 0) return t('Compile succeeded with {count} warnings', { count: warningCount })
  if (!success && errorCount > 0 && warningCount > 0) {
    return t('Compile failed with {errors} errors and {warnings} warnings', {
      errors: errorCount,
      warnings: warningCount,
    })
  }
  if (!success && errorCount > 0) return t('Compile failed with {count} errors', { count: errorCount })
  if (warningCount > 0) return t('Compile reported {count} warnings', { count: warningCount })
  return success ? t('Compile succeeded') : t('Compile failed')
}

function buildCompileDiagnosisArtifact({
  filePath,
  kind,
  compileState = {},
  diagnostics = [],
  compilerReady = true,
}) {
  const problems = (Array.isArray(diagnostics) ? diagnostics : [])
    .map(problem => normalizeProblem(problem, filePath))
    .filter(problem => problem.message)
  const errorCount = problems.filter(problem => problem.severity === 'error').length
  const warningCount = problems.filter(problem => problem.severity === 'warning').length
  const success = compileState?.status === 'success' && errorCount === 0
  const status = compilerReady ? (success ? 'success' : 'error') : 'unavailable'
  const title = kind === 'latex' ? t('LaTeX compile diagnosis') : t('Typst compile diagnosis')
  const summary = buildCompileSummary({ success, errorCount, warningCount, compilerReady })
  const bodyParts = [
    compileState?.compileTargetPath ? `${t('Compile target')}: ${compileState.compileTargetPath}` : '',
    compileState?.durationMs ? `${t('Duration')}: ${compileState.durationMs}ms` : '',
    compileState?.log ? truncate(compileState.log, 1200) : '',
  ].filter(Boolean)

  return {
    _type: 'compile_diagnosis',
    title,
    summary,
    body: bodyParts.join('\n\n'),
    sourceFile: filePath,
    kind,
    status,
    errorCount,
    warningCount,
    durationMs: Number.isFinite(compileState?.durationMs) ? Number(compileState.durationMs) : 0,
    compileTargetPath: cleanText(compileState?.compileTargetPath || filePath),
    commandPreview: cleanText(compileState?.commandPreview || ''),
    problems,
  }
}

function buildDiagnosisPrompt(artifact = null) {
  if (!artifact) return ''

  const problemLines = (artifact.problems || [])
    .slice(0, 12)
    .map((problem) => {
      const fileLabel = problem.sourcePath && problem.sourcePath !== artifact.sourceFile
        ? `${basename(problem.sourcePath)} `
        : ''
      const line = problemLine(problem)
      const location = [fileLabel.trim(), line].filter(Boolean).join(' ')
      return `- [${problem.severity}] ${location ? `${location}: ` : ''}${problem.message}`
    })

  const sections = [
    '<compile-diagnosis>',
    `kind: ${artifact.kind}`,
    `status: ${artifact.status}`,
    `summary: ${artifact.summary}`,
    artifact.compileTargetPath ? `compile_target: ${artifact.compileTargetPath}` : '',
    artifact.commandPreview ? `command: ${artifact.commandPreview}` : '',
    problemLines.length > 0 ? 'problems:' : '',
    ...problemLines,
    artifact.body ? `log_excerpt:\n${artifact.body}` : '',
    '</compile-diagnosis>',
  ].filter(Boolean)

  return sections.join('\n')
}

function buildFixerPrompt(task = {}, diagnosisArtifact = null) {
  const taskPrompt = cleanText(task.prompt)
  const diagnoseOnly = task?.artifactIntent === 'compile_diagnosis' || task?.taskId === 'diagnose.tex-typ'
  const instructions = diagnoseOnly
    ? [
        taskPrompt || t('Run a compile diagnosis for this source file, explain the reported problems, and do not edit anything unless I ask for a fix.'),
        t('Use the attached source file and the compile diagnosis below as your starting point.'),
        t('Explain the reported compile problems in priority order.'),
        t('Do not edit the source file unless the user explicitly asks for a fix.'),
      ]
    : [
        taskPrompt || t('Fix this TeX / Typst source file with the smallest safe patch.'),
        t('Use the attached source file and the compile diagnosis below as your starting point.'),
        t('Apply the fix by editing the source file with the available workspace edit tools instead of only describing the change.'),
        t('Do not stop at a prose-only answer when a safe text edit is available. Read what you need, make the edit, then recompile the same file.'),
        t('Prefer local syntax and structural fixes over broad rewrites.'),
        t('When you make edits, run `compile_document` on the same file before you finish so the result is verified.'),
        t('If the remaining issue needs a content decision or a larger restructure, stop and explain the blocker instead of guessing.'),
      ]
  const diagnosisText = buildDiagnosisPrompt(diagnosisArtifact)
  return diagnosisText ? `${instructions.join('\n')}\n\n${diagnosisText}` : instructions.join('\n')
}

function buildAdapterContext() {
  return {
    workspace: useWorkspaceStore(),
    latexStore: useLatexStore(),
    typstStore: useTypstStore(),
    referencesStore: useReferencesStore(),
    t,
  }
}

async function loadEnvironmentPreflightModule() {
  return import('../environmentPreflight.js')
}

export function isTexTypFixablePath(filePath = '') {
  return isLatex(filePath) || isTypst(filePath)
}

export async function collectTexTypFixerDiagnosis(filePath, options = {}) {
  if (!isTexTypFixablePath(filePath)) {
    throw new Error(t('Only .tex and .typ files can be sent to the TeX / Typst fixer.'))
  }

  const context = options.context || buildAdapterContext()
  const adapter = getDocumentAdapterForFile(filePath)
  const compileAdapter = adapter?.compile || null
  if (!compileAdapter) {
    throw new Error(t('No compile adapter is available for this file.'))
  }

  let compilerReady = true
  if (isLatex(filePath)) {
    const { ensureLatexCompileReady } = await loadEnvironmentPreflightModule()
    compilerReady = await ensureLatexCompileReady()
  } else if (isTypst(filePath)) {
    const { ensureTypstCompileReady } = await loadEnvironmentPreflightModule()
    compilerReady = await ensureTypstCompileReady()
  }

  if (compilerReady && options.compile !== false) {
    await compileAdapter.compile(filePath, context, {
      reason: options.reason || 'ai-fixer',
      trigger: options.trigger || 'ai-tex-typ-fixer',
    })
  }

  const diagnostics = isLatex(filePath)
    ? buildLatexWorkflowProblems(filePath, context.latexStore?.stateForFile(filePath) || {})
    : buildTypstWorkflowProblems(filePath, {
      compileState: context.typstStore?.stateForFile(filePath) || {},
      queueState: context.typstStore?.queueStateForFile(filePath) || null,
      liveState: context.typstStore?.liveStateForFile(filePath) || null,
      referencesStore: context.referencesStore || null,
    })

  const compileState = compileAdapter.stateForFile(filePath, context) || {}
  const artifact = buildCompileDiagnosisArtifact({
    filePath,
    kind: isLatex(filePath) ? 'latex' : 'typst',
    compileState,
    diagnostics,
    compilerReady,
  })

  return {
    filePath,
    kind: artifact.kind,
    compileState,
    diagnostics,
    compilerReady,
    artifact,
    prompt: buildDiagnosisPrompt(artifact),
  }
}

export async function prepareTexTypFixTask(task = {}) {
  if (!task?.filePath || !isTexTypFixablePath(task.filePath)) return task

  const diagnosis = await collectTexTypFixerDiagnosis(task.filePath, {
    compile: task.compileBeforeLaunch !== false,
    reason: 'ai-fixer-bootstrap',
    trigger: task.trigger || 'ai-fixer-bootstrap',
  })

  return {
    ...task,
    label: task.label || t('Fix TeX / Typst'),
    artifactIntent: task.artifactIntent || 'patch',
    seedArtifacts: diagnosis.artifact ? [diagnosis.artifact] : [],
    prompt: buildFixerPrompt(task, diagnosis.artifact),
    _preparedTexTypFixer: true,
  }
}

export function buildCompileDocumentToolResult(filePath, diagnosis = null) {
  if (!diagnosis?.artifact) {
    return {
      _type: 'compile_diagnosis',
      title: t('Compile diagnosis'),
      summary: t('No compile diagnostics were produced'),
      sourceFile: filePath,
      problems: [],
    }
  }
  return diagnosis.artifact
}
