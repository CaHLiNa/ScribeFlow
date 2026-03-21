import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkflowPlan } from '../src/services/ai/workflowRuns/planner.js'
import {
  buildWorkflowBoundaryCopy,
  getAiLauncherItems,
  getChatInputToolItems,
  getQuickAiItems,
  getWorkflowFirstStarterItems,
} from '../src/services/ai/taskCatalog.js'
import {
  WORKFLOW_TEMPLATE_IDS,
  WORKFLOW_TEMPLATES,
  getWorkflowTemplate,
} from '../src/services/ai/workflowRuns/templates.js'

function t(message, params = {}) {
  return String(message).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

function findTask(items, taskId) {
  return items.find((item) => item.task?.taskId === taskId)?.task || null
}

test('draft review workflow inserts steps in the expected order', () => {
  const plan = createWorkflowPlan({
    templateId: 'draft.review-revise',
    context: { currentFile: '/tmp/draft.md' },
  })

  assert.deepEqual(
    plan.run.steps.map((step) => step.kind),
    [
      'read_context',
      'analyze_goal',
      'generate_review',
      'generate_patch',
      'await_patch_decision',
      'summarize_outcome',
    ],
  )
})

test('workflow template registry exposes the expected ids', () => {
  assert.deepEqual(WORKFLOW_TEMPLATE_IDS, [
    'draft.review-revise',
    'references.search-intake',
    'code.debug-current',
  ])
  assert.equal(WORKFLOW_TEMPLATES.length, 3)
})

test('draft review template requires apply_patch approval', () => {
  const template = getWorkflowTemplate('draft.review-revise')

  assert.equal(template.role, 'reviewer')
  assert.equal(template.toolProfile, 'reviewer')
  assert.equal(template.autoAdvanceUntil, 'generate_patch')
  assert.deepEqual(template.approvalTypes, ['apply_patch'])
  assert.ok(template.steps.some((step) => step.approvalType === 'apply_patch'))
})

test('reference intake template requires accept_sources approval', () => {
  const template = getWorkflowTemplate('references.search-intake')

  assert.equal(template.role, 'citation_librarian')
  assert.equal(template.toolProfile, 'citation_librarian')
  assert.equal(template.autoAdvanceUntil, 'generate_citation_set')
  assert.deepEqual(template.approvalTypes, ['accept_sources'])
  assert.ok(template.steps.some((step) => step.approvalType === 'accept_sources'))
})

test('code debug template suggests fixes without direct file edits by default', () => {
  const plan = createWorkflowPlan({
    templateId: 'code.debug-current',
    context: { currentFile: '/tmp/code.js' },
  })

  assert.equal(plan.run.status, 'planned')
  assert.equal(plan.run.title, 'Debug current code')
  assert.equal(plan.label, undefined)
  assert.equal(plan.title, undefined)
  assert.deepEqual(plan.run.steps.map((step) => step.kind), [
    'read_context',
    'analyze_goal',
    'diagnose_issue',
    'generate_fix_suggestions',
    'summarize_outcome',
  ])
  assert.equal(plan.template.autoAdvanceUntil, 'generate_fix_suggestions')
  assert.deepEqual(plan.template.approvalTypes, [])
  assert.ok(plan.run.steps.some((step) => step.kind === 'generate_fix_suggestions'))
  assert.ok(plan.run.steps.every((step) => !step.requiresApproval))
})

test('step ids differ across two runs of the same template', () => {
  const first = createWorkflowPlan({ templateId: 'draft.review-revise' })
  const second = createWorkflowPlan({ templateId: 'draft.review-revise' })

  assert.notEqual(first.run.steps[0].id, second.run.steps[0].id)
  assert.match(first.run.steps[0].id, /^workflow-run-/)
  assert.match(second.run.steps[0].id, /^workflow-run-/)
})

test('planner returns isolated copies and rejects unknown templates', () => {
  const plan = createWorkflowPlan({ templateId: 'draft.review-revise' })
  plan.template.approvalTypes.push('mutated')
  plan.run.steps[0].label = 'Changed'

  const fresh = createWorkflowPlan({ templateId: 'draft.review-revise' })
  assert.deepEqual(fresh.template.approvalTypes, ['apply_patch'])
  assert.notEqual(fresh.run.steps[0].label, 'Changed')

  assert.throws(() => {
    createWorkflowPlan({ templateId: 'missing.template' })
  }, /Unknown workflow template/)
})

test('current draft review launcher entry maps to the draft review workflow', () => {
  const items = getAiLauncherItems({
    currentPath: '/tmp/draft.md',
    t,
  })
  const task = findTask(items, 'review.current-draft')

  assert.ok(task)
  assert.equal(task.action, 'workflow')
  assert.equal(task.workflowTemplateId, 'draft.review-revise')
  assert.equal(task.role, 'reviewer')
  assert.equal(task.toolProfile, 'reviewer')
  assert.equal(task.filePath, '/tmp/draft.md')
  assert.match(task.description || '', /patch approval/i)
  assert.match(task.meta || '', /Workflow/i)
})

test('launcher items preserve workflow boundary description and meta on task data', () => {
  const items = getAiLauncherItems({
    currentPath: '/tmp/draft.md',
    t,
  })
  const item = items.find((entry) => entry.task?.taskId === 'review.current-draft')

  assert.ok(item)
  assert.match(item.task.description || '', /patch approval/i)
  assert.match(item.task.meta || '', /Workflow/i)
})

test('quick items prioritize workflow starts and keep general chat as the only free chat entry', () => {
  const items = getQuickAiItems({ t })
  const taskIds = items.map((item) => item.task?.taskId)
  const actions = items.map((item) => item.task?.action)

  assert.deepEqual(taskIds.slice(0, 4), [
    'review.current-draft',
    'research.paper-search',
    'citation.prefill',
    'code.prefill',
  ])
  assert.ok(taskIds.includes('chat.general'))
  assert.equal(taskIds.includes('research.web'), false)
  assert.equal(items.find((item) => item.task?.taskId === 'chat.general')?.task?.action, 'prefill')
  assert.deepEqual(actions.slice(0, 4), ['workflow', 'workflow', 'workflow', 'workflow'])
})

test('starter ordering keeps context-specific entries ahead of generic entries in draft, code, and pdf contexts', () => {
  const draftItems = getWorkflowFirstStarterItems({
    currentPath: '/tmp/draft.md',
    t,
  })
  const codeItems = getWorkflowFirstStarterItems({
    currentPath: '/tmp/code.py',
    t,
  })
  const pdfItems = getWorkflowFirstStarterItems({
    currentPath: '/tmp/paper.pdf',
    t,
  })
  const pdfQuickItems = getQuickAiItems({
    currentPath: '/tmp/paper.pdf',
    t,
  })
  const pdfLauncherItems = getAiLauncherItems({
    currentPath: '/tmp/paper.pdf',
    t,
  })

  assert.equal(draftItems[0].task?.taskId, 'review.current-draft')
  assert.equal(draftItems[0].task?.action, 'workflow')
  assert.equal(codeItems[0].task?.taskId, 'code.explain-current')
  assert.equal(codeItems[0].task?.action, 'workflow')
  assert.equal(pdfItems[0].task?.taskId, 'pdf.summarise')
  assert.equal(pdfItems[0].task?.action, 'send')
  assert.deepEqual(pdfQuickItems.slice(0, 4).map((item) => item.task?.action), [
    'workflow',
    'workflow',
    'workflow',
    'workflow',
  ])
  assert.equal(pdfLauncherItems[0].task?.action, 'workflow')
  assert.ok(pdfLauncherItems.findIndex((item) => item.task?.taskId === 'pdf.summarise') > 0)
  assert.ok(codeItems.findIndex((item) => item.task?.taskId === 'code.reproducibility') > 0)
  assert.ok(pdfItems.findIndex((item) => item.task?.taskId === 'research.paper-search') > 0)
})

test('workflow boundary copy exposes auto-run and approval boundaries', () => {
  const reviewCopy = buildWorkflowBoundaryCopy('draft.review-revise', t)
  const referenceCopy = buildWorkflowBoundaryCopy('references.search-intake', t)
  const codeCopy = buildWorkflowBoundaryCopy('code.debug-current', t)

  assert.match(reviewCopy.description, /patch approval/i)
  assert.match(referenceCopy.description, /source approval/i)
  assert.match(codeCopy.description, /without editing files/i)
  assert.match(reviewCopy.meta, /workflow/i)
})

test('paper search and citation help launcher entries map to workflow descriptors', () => {
  const items = getAiLauncherItems({ t })
  const paperSearchTask = findTask(items, 'research.paper-search')
  const citationTask = findTask(items, 'citation.prefill')

  assert.ok(paperSearchTask)
  assert.equal(paperSearchTask.action, 'workflow')
  assert.equal(paperSearchTask.workflowTemplateId, 'references.search-intake')
  assert.equal(paperSearchTask.role, 'citation_librarian')
  assert.equal(paperSearchTask.toolProfile, 'citation_librarian')

  assert.ok(citationTask)
  assert.equal(citationTask.action, 'workflow')
  assert.equal(citationTask.workflowTemplateId, 'references.search-intake')
  assert.equal(citationTask.role, 'citation_librarian')
  assert.equal(citationTask.toolProfile, 'citation_librarian')
})

test('chat input paper search entry maps to the reference intake workflow with template-aligned role', () => {
  const items = getChatInputToolItems({ t })
  const task = findTask(items, 'research.paper-search')

  assert.ok(task)
  assert.equal(task.action, 'workflow')
  assert.equal(task.workflowTemplateId, 'references.search-intake')
  assert.equal(task.role, 'citation_librarian')
  assert.equal(task.toolProfile, 'citation_librarian')
  assert.equal(task.source, 'chat-input')
  assert.equal(task.entryContext, 'chat-input')
})

test('general chat launcher entry remains a normal chat prefill task', () => {
  const items = getAiLauncherItems({ t })
  const task = findTask(items, 'chat.general')

  assert.ok(task)
  assert.equal(task.action, 'prefill')
  assert.equal(task.workflowTemplateId, undefined)
  assert.equal(task.role, 'general')
})
