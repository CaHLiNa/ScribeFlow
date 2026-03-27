import { t as translate } from '../../i18n/index.js'
import { isMarkdown, isLatex, isTypst, isPdf } from '../../utils/fileTypes.js'
import {
  TOOL_CATEGORIES,
  categoryAllLocal,
  categoryHasExternal,
  categoryToolCount,
} from './toolRegistry.js'
import { getWorkflowTemplate } from './workflowRuns/templates.js'

function fileName(path) {
  return (
    String(path || '')
      .split('/')
      .pop() || path
  )
}

function isCodePath(path = '') {
  return (
    path.endsWith('.py') ||
    path.endsWith('.r') ||
    path.endsWith('.R') ||
    path.endsWith('.jl') ||
    path.endsWith('.ipynb')
  )
}

function isDatasetPath(path = '') {
  return path.endsWith('.csv') || path.endsWith('.tsv')
}

function createWorkflowTaskDescriptor({
  workflowTemplateId,
  role,
  toolProfile,
  allowedTools = null,
  initialToolChoice = null,
  taskId,
  source = 'launcher',
  entryContext = null,
  label = '',
  prompt = '',
  filePath = null,
  context = null,
  artifactIntent = null,
  fileRefs = null,
  richHtml = null,
  meta = '',
  description = '',
  translateFn = translate,
} = {}) {
  const boundaryCopy = workflowTemplateId
    ? buildWorkflowBoundaryCopy(workflowTemplateId, translateFn)
    : null
  return {
    action: 'workflow',
    workflowTemplateId,
    role,
    toolProfile: toolProfile || role || null,
    allowedTools: Array.isArray(allowedTools) && allowedTools.length > 0 ? [...allowedTools] : null,
    initialToolChoice: initialToolChoice || null,
    taskId: taskId || null,
    source,
    entryContext,
    label,
    prompt,
    filePath,
    context,
    artifactIntent,
    fileRefs: Array.isArray(fileRefs) ? fileRefs : null,
    richHtml: richHtml || null,
    meta: meta || boundaryCopy?.meta || null,
    description: description || boundaryCopy?.description || null,
  }
}

export function buildWorkflowBoundaryCopy(workflowTemplateId, t = translate) {
  let template
  try {
    template = getWorkflowTemplate(workflowTemplateId)
  } catch {
    return {
      meta: t('Workflow'),
      description: t('Auto-runs as a workflow, then pauses when needed.'),
    }
  }

  const approvalLabel = template.approvalTypes.includes('apply_patch')
    ? t('patch approval')
    : template.approvalTypes.includes('accept_sources')
      ? t('source approval')
      : template.approvalTypes.includes('apply_notebook_edits')
        ? t('notebook edit approval')
        : template.approvalTypes.includes('apply_reference_changes')
          ? t('reference change approval')
          : ''

  const actionLabel =
    template.id === 'draft.review-revise'
      ? t('review')
      : template.id === 'references.search-intake'
        ? t('search and intake')
        : template.id === 'code.notebook-assistant'
          ? t('notebook analysis and edit planning')
          : template.id === 'references.maintenance'
            ? t('reference maintenance')
            : template.id === 'pdf.summary-current'
              ? t('PDF summary')
              : template.id === 'research.compare-sources'
                ? t('source comparison')
                : t('diagnosis and fix suggestions')

  if (template.id === 'draft.review-revise') {
    return {
      meta: t('Workflow · review first'),
      description: t('Auto-runs review, then pauses for patch approval.'),
    }
  }

  if (template.id === 'references.search-intake') {
    return {
      meta: t('Workflow · source approval'),
      description: t('Auto-runs search and intake, then pauses for source approval.'),
    }
  }

  if (template.id === 'code.debug-current') {
    return {
      meta: t('Workflow · no edit-by-default'),
      description: t('Auto-runs diagnosis and fix suggestions without editing files by default.'),
    }
  }

  if (template.id === 'code.notebook-assistant') {
    return {
      meta: t('Workflow · notebook edit approval'),
      description: t('Auto-runs notebook analysis, then pauses before notebook edits.'),
    }
  }

  if (template.id === 'references.maintenance') {
    return {
      meta: t('Workflow · reference change approval'),
      description: t(
        'Auto-runs reference maintenance, then pauses before applying library changes.'
      ),
    }
  }

  if (template.id === 'pdf.summary-current') {
    return {
      meta: t('Workflow · auto summary'),
      description: t('Auto-runs a structured PDF summary without pausing for approval.'),
    }
  }

  if (template.id === 'research.compare-sources') {
    return {
      meta: t('Workflow · compare and recommend'),
      description: t('Auto-runs source comparison and proposal generation without editing files.'),
    }
  }

  if (template.id === 'compile.tex-typ-diagnose') {
    return {
      meta: t('Workflow · compile diagnosis'),
      description: t(
        'Auto-runs compile diagnosis for the current TeX or Typst file without editing it.'
      ),
    }
  }

  if (template.id === 'compile.tex-typ-fix') {
    return {
      meta: t('Workflow · compile fix approval'),
      description: t(
        'Auto-runs compile diagnosis, then pauses for patch approval before editing the TeX or Typst file.'
      ),
    }
  }

  return {
    meta: template.approvalTypes.length
      ? t('Workflow · {approval}', { approval: approvalLabel || t('approval') })
      : t('Workflow · auto-runs'),
    description: approvalLabel
      ? t('Auto-runs {action}, then pauses for {approval}.', {
          action: actionLabel,
          approval: approvalLabel,
        })
      : t('Auto-runs {action} as a workflow.', { action: actionLabel }),
  }
}

function appendUniqueTask(items, nextItem) {
  const key = nextItem?.task?.taskId || nextItem?.label
  if (!key || items.some((item) => (item?.task?.taskId || item?.label) === key)) return
  items.push(nextItem)
}

function isWorkflowTaskItem(item) {
  return item?.task?.action === 'workflow'
}

function taskFamily(item) {
  return String(item?.task?.taskId || '').split('.')[0] || ''
}

function uniqueTaskItems(items = []) {
  const seen = new Set()
  const unique = []
  for (const item of items) {
    const key = item?.task?.taskId || item?.label
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
}

function starterItemKey(item) {
  const task = item?.task || {}
  const family = taskFamily(item)
  const label = String(item?.label || task.label || '')
    .trim()
    .toLowerCase()

  if (task.action === 'workflow' || task.workflowTemplateId) {
    return `wf:${task.workflowTemplateId || label}:${family}`
  }

  return `task:${family}:${label}:${task.taskId || label}`
}

export function getWorkflowFirstStarterItems({
  currentPath = '',
  recentFiles = [],
  t,
  limit = 6,
} = {}) {
  const combined = uniqueTaskItems([
    ...getQuickAiItems({ currentPath, recentFiles, t }),
    ...getAiLauncherItems({ currentPath, recentFiles, t }),
  ])
  const contextWorkflowItems = []
  const contextNonWorkflowItems = []
  const genericItems = []
  const genericWorkflowItems = []
  const genericNonWorkflowItems = []
  const contextFamilies = new Set()
  const seenKeys = new Set()

  function pushStarter(item, target) {
    const key = starterItemKey(item)
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    target.push(item)
  }

  for (const item of combined) {
    if (item?.task?.filePath) {
      contextFamilies.add(taskFamily(item))
      if (isWorkflowTaskItem(item)) {
        pushStarter(item, contextWorkflowItems)
      } else {
        pushStarter(item, contextNonWorkflowItems)
      }
    } else {
      genericItems.push(item)
    }
  }

  for (const item of genericItems) {
    if (contextFamilies.has(taskFamily(item))) continue
    if (isWorkflowTaskItem(item)) {
      pushStarter(item, genericWorkflowItems)
    } else {
      pushStarter(item, genericNonWorkflowItems)
    }
  }

  return [
    ...contextWorkflowItems,
    ...genericWorkflowItems,
    ...contextNonWorkflowItems,
    ...genericNonWorkflowItems,
  ].slice(0, limit)
}

function buildWritingTasks(path, t) {
  const name = fileName(path)
  const items = [
    {
      label: t('Review current draft'),
      meta: name,
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'draft.review-revise',
        role: 'reviewer',
        toolProfile: 'reviewer',
        taskId: 'review.current-draft',
        artifactIntent: 'review',
        label: t('Review current draft'),
        prompt: t(
          'Review this draft for argument quality, clarity, structure, and academic tone. Point out concrete revision opportunities.'
        ),
        filePath: path,
        translateFn: t,
      }),
    },
    {
      label: t('Citation help'),
      meta: name,
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'references.search-intake',
        role: 'citation_librarian',
        toolProfile: 'citation_librarian',
        taskId: 'citation.current-draft',
        artifactIntent: 'citation_set',
        label: t('Citation help'),
        prompt: t(
          'Inspect this draft and identify claims that need stronger citation support or better integration of references.'
        ),
        filePath: path,
        translateFn: t,
      }),
    },
  ]

  if (isLatex(path) || isTypst(path)) {
    items.push({
      label: t('Compile & Diagnose'),
      meta: name,
      task: createTexTypDiagnoseTask({ filePath: path }),
    })
    items.push({
      label: t('Fix TeX / Typst'),
      meta: name,
      task: createTexTypFixTask({ filePath: path }),
    })
  }

  return items
}

function buildCodeTasks(path, t) {
  const name = fileName(path)
  if (path.endsWith('.ipynb')) {
    return [
      {
        label: t('Notebook AI'),
        meta: name,
        task: createNotebookAssistantTask({ filePath: path }),
      },
      {
        label: t('Check reproducibility'),
        meta: name,
        task: {
          action: 'send',
          role: 'code_assistant',
          toolProfile: 'code_assistant',
          taskId: 'code.notebook-reproducibility',
          prompt: t(
            'Inspect the notebook at {path} for reproducibility risks, hidden state, missing dependencies, and unclear execution steps. Start by reading the notebook cells and outputs.',
            {
              path,
            }
          ),
        },
      },
    ]
  }

  return [
    {
      label: t('Code assistant'),
      meta: name,
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'code.debug-current',
        role: 'code_assistant',
        toolProfile: 'code_assistant',
        taskId: 'code.explain-current',
        label: t('Code assistant'),
        prompt: t(
          'Explain this code or notebook, identify the main workflow, and call out likely issues, assumptions, or unclear areas.'
        ),
        filePath: path,
        translateFn: t,
      }),
    },
    {
      label: t('Check reproducibility'),
      meta: name,
      task: {
        action: 'send',
        role: 'code_assistant',
        toolProfile: 'code_assistant',
        taskId: 'code.reproducibility',
        prompt: t(
          'Review this code or notebook for reproducibility risks, hidden state, missing dependencies, and unclear execution steps.'
        ),
        filePath: path,
      },
    },
  ]
}

function buildDatasetTasks(path, t) {
  const name = fileName(path)
  return [
    {
      label: t('Describe dataset'),
      meta: name,
      task: {
        action: 'send',
        role: 'researcher',
        toolProfile: 'researcher',
        taskId: 'data.describe',
        prompt: t(
          'Describe this dataset, infer likely variable roles, point out data quality issues, and suggest the next analysis steps.'
        ),
        filePath: path,
      },
    },
  ]
}

function buildPdfTasks(path, t) {
  const name = fileName(path)
  return [
    {
      label: t('Summarise {name}', { name }),
      meta: name,
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'pdf.summary-current',
        role: 'researcher',
        toolProfile: 'researcher',
        taskId: 'pdf.summarise',
        artifactIntent: 'note_bundle',
        label: t('Summarise {name}', { name }),
        prompt: t(
          'Summarise this PDF by extracting the research question, method, evidence, and key conclusions.'
        ),
        filePath: path,
        translateFn: t,
      }),
    },
    {
      label: t('Find related papers'),
      meta: name,
      task: {
        action: 'send',
        role: 'researcher',
        toolProfile: 'researcher',
        taskId: 'pdf.related-papers',
        prompt: t(
          'Find papers related to this PDF. Use search_papers and present the best candidates with create_proposal.'
        ),
        filePath: path,
      },
    },
  ]
}

function buildContextTasks(path, t) {
  if (!path) return []
  if (isMarkdown(path) || isLatex(path) || isTypst(path)) return buildWritingTasks(path, t)
  if (isPdf(path)) return buildPdfTasks(path, t)
  if (isCodePath(path)) return buildCodeTasks(path, t)
  if (isDatasetPath(path)) return buildDatasetTasks(path, t)
  return []
}

function buildWorkflowSections(t) {
  return [
    {
      header: t('Writing'),
      items: [
        {
          label: t('Review current draft'),
          task: createWorkflowTaskDescriptor({
            workflowTemplateId: 'draft.review-revise',
            role: 'reviewer',
            toolProfile: 'reviewer',
            taskId: 'review.prefill',
            artifactIntent: 'review',
            label: t('Review current draft'),
            prompt: t(
              'Act as a critical peer reviewer. Review this draft for originality, logic, clarity, and evidence:'
            ),
            translateFn: t,
          }),
        },
        {
          label: t('Continue writing'),
          task: {
            action: 'prefill',
            role: 'writer',
            toolProfile: 'writer',
            taskId: 'writer.continue',
            prompt: t(
              'Help me continue writing this section. Start by asking what I am working on.'
            ),
          },
        },
      ],
    },
    {
      header: t('Research'),
      items: [
        {
          label: t('Search academic papers'),
          task: createWorkflowTaskDescriptor({
            workflowTemplateId: 'references.search-intake',
            role: 'citation_librarian',
            toolProfile: 'citation_librarian',
            taskId: 'research.paper-search',
            label: t('Search academic papers'),
            prompt: t(
              'Help me search academic papers for this topic. Prefer using search_papers first, then present the best candidates with create_proposal.'
            ),
            translateFn: t,
          }),
        },
        {
          label: t('Literature review'),
          task: {
            action: 'prefill',
            role: 'researcher',
            toolProfile: 'researcher',
            taskId: 'research.literature-review',
            prompt: t('Help me run a literature review around this topic:'),
          },
        },
        {
          label: t('Web Research'),
          task: {
            action: 'prefill',
            role: 'researcher',
            toolProfile: 'researcher',
            taskId: 'research.web',
            prompt: t(
              'Help me investigate external websites and online sources for this topic. Use web_search and fetch_url when useful.'
            ),
          },
        },
        {
          label: t('Fetch web page content'),
          task: {
            action: 'prefill',
            role: 'researcher',
            toolProfile: 'researcher',
            taskId: 'research.fetch-url',
            prompt: t(
              'Help me read one or more URLs. Ask me for the URL if I have not provided it yet, then fetch and summarise the content.'
            ),
          },
        },
        {
          label: t('Compare sources'),
          task: createSourceComparisonTask(),
        },
      ],
    },
    {
      header: t('References'),
      items: [
        {
          label: t('Citation help'),
          task: createWorkflowTaskDescriptor({
            workflowTemplateId: 'references.search-intake',
            role: 'citation_librarian',
            toolProfile: 'citation_librarian',
            taskId: 'citation.prefill',
            artifactIntent: 'citation_set',
            label: t('Citation help'),
            prompt: t('Help me find and integrate citations for this section or claim:'),
            translateFn: t,
          }),
        },
        {
          label: t('Add by DOI or BibTeX'),
          task: {
            action: 'prefill',
            role: 'citation_librarian',
            toolProfile: 'citation_librarian',
            taskId: 'citation.import',
            prompt: t(
              'Help me import references from DOI or BibTeX. Ask me for the DOI or BibTeX if I have not provided it yet, then add the references to my library.'
            ),
          },
        },
        {
          label: t('Reference maintenance'),
          task: createReferenceMaintenanceTask(),
        },
      ],
    },
    {
      header: t('Code'),
      items: [
        {
          label: t('Code assistant'),
          task: createWorkflowTaskDescriptor({
            workflowTemplateId: 'code.debug-current',
            role: 'code_assistant',
            toolProfile: 'code_assistant',
            taskId: 'code.prefill',
            label: t('Code assistant'),
            prompt: t('Help me with this research code, notebook, or debugging task:'),
            translateFn: t,
          }),
        },
        {
          label: t('Read notebook cells & outputs'),
          task: createNotebookExplorerTask({
            label: t('Notebook AI'),
          }),
        },
      ],
    },
    {
      header: t('General'),
      items: [
        {
          label: t('General chat'),
          task: {
            action: 'prefill',
            role: 'general',
            taskId: 'chat.general',
            prompt: t('Help me think through this research task.'),
          },
        },
      ],
    },
  ]
}

export function getAiLauncherItems({ currentPath = '', recentFiles = [], t }) {
  const items = []
  const primaryPath = currentPath || recentFiles[0]?.path || ''

  const contextItems = buildContextTasks(primaryPath, t)
  const workflowContextItems = contextItems.filter(isWorkflowTaskItem)
  const nonWorkflowContextItems = contextItems.filter((item) => !isWorkflowTaskItem(item))

  workflowContextItems.forEach((item, index) => {
    items.push({
      ...item,
      groupHeader: index === 0 ? t('Current context') : null,
      muted: true,
    })
  })

  const workflowSections = buildWorkflowSections(t)
  workflowSections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      items.push({
        ...item,
        groupHeader:
          sectionIndex === 0 && itemIndex === 0
            ? t('Workflows')
            : itemIndex === 0
              ? section.header
              : null,
      })
    })
  })

  if (nonWorkflowContextItems.length) {
    const contextHeader = workflowContextItems.length > 0 ? t('More context') : t('Current context')
    nonWorkflowContextItems.forEach((item, index) => {
      items.push({
        ...item,
        groupHeader: index === 0 ? contextHeader : null,
        muted: true,
      })
    })
  }

  return items
}

export function getQuickAiItems({ currentPath = '', recentFiles = [], t }) {
  const primaryPath = currentPath || recentFiles[0]?.path || ''
  const contextItems = buildContextTasks(primaryPath, t)
  const workflowContextItems = contextItems.filter(isWorkflowTaskItem)
  const nonWorkflowContextItems = contextItems
    .filter((item) => !isWorkflowTaskItem(item))
    .slice(0, 3)
  const quickItems = []

  const quickWorkflowItems = [
    {
      label: t('Review current draft'),
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'draft.review-revise',
        role: 'reviewer',
        toolProfile: 'reviewer',
        taskId: 'review.current-draft',
        artifactIntent: 'review',
        label: t('Review current draft'),
        prompt: t(
          'Review this draft for argument quality, clarity, structure, and academic tone. Point out concrete revision opportunities.'
        ),
        translateFn: t,
      }),
    },
    {
      label: t('Search academic papers'),
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'references.search-intake',
        role: 'citation_librarian',
        toolProfile: 'citation_librarian',
        taskId: 'research.paper-search',
        label: t('Search academic papers'),
        prompt: t(
          'Help me search academic papers for this topic. Prefer using search_papers first, then present the best candidates with create_proposal.'
        ),
        translateFn: t,
      }),
    },
    {
      label: t('Citation help'),
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'references.search-intake',
        role: 'citation_librarian',
        toolProfile: 'citation_librarian',
        taskId: 'citation.prefill',
        artifactIntent: 'citation_set',
        label: t('Citation help'),
        prompt: t('Help me find and integrate citations for this section or claim:'),
        translateFn: t,
      }),
    },
    {
      label: t('Code assistant'),
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'code.debug-current',
        role: 'code_assistant',
        toolProfile: 'code_assistant',
        taskId: 'code.prefill',
        label: t('Code assistant'),
        prompt: t('Help me with this research code, notebook, or debugging task:'),
        translateFn: t,
      }),
    },
  ]

  for (const item of workflowContextItems) {
    appendUniqueTask(quickItems, item)
  }
  for (const item of quickWorkflowItems) {
    appendUniqueTask(quickItems, item)
  }

  for (const item of nonWorkflowContextItems) {
    appendUniqueTask(quickItems, item)
  }

  appendUniqueTask(quickItems, {
    label: t('General chat'),
    task: {
      action: 'prefill',
      role: 'general',
      taskId: 'chat.general',
      prompt: t('Help me think through this research task.'),
    },
  })

  return quickItems
}

export function createCommentReviewTask({ filePath, relativePath, count, label = '' }) {
  return {
    action: 'send',
    role: 'reviewer',
    toolProfile: 'reviewer',
    taskId: 'comments.review',
    source: 'comments',
    entryContext: 'comments',
    label: label || translate('Comment review'),
    filePath,
    prompt: translate(
      'Review and address {count} comments on {path}. Resolve questions, suggest concrete edits, and use the comment tools when appropriate.',
      {
        count,
        path: relativePath,
      }
    ),
  }
}

export function createCommentThreadTask({
  relativePath,
  label = '',
  source = 'comments',
  entryContext = 'comment-thread',
} = {}) {
  return {
    action: 'send',
    role: 'reviewer',
    toolProfile: 'reviewer',
    taskId: 'comments.thread-assist',
    source,
    entryContext,
    label: label || translate('Comment thread AI'),
    prompt: translate(
      'Review and address the selected comment thread on {path}. Focus on this thread only, answer the comment directly, suggest concrete edits when useful, and use the comment tools when appropriate.',
      {
        path: relativePath || '',
      }
    ),
  }
}

export function createSelectionAskTask({ label = '' } = {}) {
  return {
    role: 'general',
    taskId: 'selection.ask',
    source: 'selection',
    entryContext: 'selection',
    label: label || translate('Ask AI'),
    toolProfile: null,
  }
}

export function createNotebookAssistantTask({
  filePath,
  label = '',
  source = 'notebook',
  entryContext = 'notebook',
} = {}) {
  return createWorkflowTaskDescriptor({
    workflowTemplateId: 'code.notebook-assistant',
    role: 'code_assistant',
    toolProfile: 'code_assistant',
    taskId: 'code.notebook-current',
    source,
    entryContext,
    artifactIntent: 'proposal',
    label: label || translate('Notebook AI'),
    prompt: translate(
      'Inspect the notebook at {path}. Start by reading its cells and outputs, then help with analysis, debugging, or edits using notebook tools when appropriate.',
      {
        path: filePath || '',
      }
    ),
    filePath,
  })
}

export function createReferenceMaintenanceTask({
  label = '',
  source = 'launcher',
  entryContext = 'reference-maintenance',
  focusKeys = [],
} = {}) {
  const keyList = (focusKeys || [])
    .filter(Boolean)
    .map((key) => `@${key}`)
    .join(', ')
  return createWorkflowTaskDescriptor({
    workflowTemplateId: 'references.maintenance',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.maintenance',
    source,
    entryContext,
    artifactIntent: 'proposal',
    label: label || translate('Reference maintenance'),
    prompt: keyList
      ? translate(
          'Help me maintain my reference library. Focus first on these references: {keys}. Check metadata completeness, duplicates, missing PDFs, and citation-readiness.',
          {
            keys: keyList,
          }
        )
      : translate(
          'Help me maintain my reference library. Check for incomplete metadata, duplicates, missing PDFs, and weak citation coverage. Ask what part of the library or project I want to focus on first.'
        ),
  })
}

export function createSourceComparisonTask({
  label = '',
  source = 'launcher',
  entryContext = 'research-comparison',
} = {}) {
  return createWorkflowTaskDescriptor({
    workflowTemplateId: 'research.compare-sources',
    role: 'researcher',
    toolProfile: 'researcher',
    taskId: 'research.compare-sources',
    source,
    entryContext,
    artifactIntent: 'proposal',
    label: label || translate('Compare sources'),
    prompt: translate(
      'Help me compare papers, sources, or methods for this topic. Ask what I want to compare, then use proposal cards with verifiable links.'
    ),
  })
}

export function createReferenceAuditTask({
  refKey,
  label = '',
  source = 'reference-view',
  entryContext = 'reference-view',
} = {}) {
  return {
    action: 'send',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.reference-audit',
    source,
    entryContext,
    label: label || translate('Review reference'),
    prompt: translate(
      'Inspect reference {key} in my library. Check metadata completeness, citation-readiness, related usage issues, and suggest concrete fixes. Use reference tools and proposal cards when useful.',
      {
        key: refKey ? `@${refKey}` : '',
      }
    ),
  }
}

export function createReferenceCompareTask({
  refKeys = [],
  label = '',
  source = 'reference-list',
  entryContext = 'reference-list',
} = {}) {
  const keyList = (refKeys || [])
    .filter(Boolean)
    .map((key) => `@${key}`)
    .join(', ')
  return {
    action: 'send',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.compare',
    source,
    entryContext,
    label: label || translate('Compare selected'),
    prompt: translate(
      'Compare these references from my library: {keys}. Highlight overlap, differences, and where each source fits best. Use get_reference and create_proposal when useful.',
      {
        keys: keyList,
      }
    ),
  }
}

export function createReferenceSummaryTask({
  refKey,
  label = '',
  source = 'library-workbench',
  entryContext = 'library-workbench',
} = {}) {
  return {
    action: 'send',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.reference-summary',
    source,
    entryContext,
    label: label || translate('Summarize reference'),
    prompt: translate(
      'Summarize reference {key} from my library. Focus on the research question, method, main findings, limitations, and why it matters for my project. Suggest a concise reading note and 3-5 tags if useful.',
      {
        key: refKey ? `@${refKey}` : '',
      }
    ),
  }
}

export function createReferenceCleanupTask({
  refKeys = [],
  label = '',
  source = 'library-workbench',
  entryContext = 'library-workbench',
} = {}) {
  const keyList = (refKeys || [])
    .filter(Boolean)
    .map((key) => `@${key}`)
    .join(', ')
  return {
    action: 'send',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.reference-cleanup',
    source,
    entryContext,
    label: label || translate('Clean up reference'),
    prompt: keyList
      ? translate(
          'Review these references from my library: {keys}. Check metadata quality, duplicate risk, weak tags, missing PDFs, reading-state mismatches, and suggest concrete cleanup actions.',
          {
            keys: keyList,
          }
        )
      : translate(
          'Review my current library selection. Check metadata quality, duplicate risk, weak tags, missing PDFs, reading-state mismatches, and suggest concrete cleanup actions.'
        ),
  }
}

export function createReferenceClusterTask({
  refKeys = [],
  label = '',
  source = 'library-workbench',
  entryContext = 'library-workbench',
} = {}) {
  const keyList = (refKeys || [])
    .filter(Boolean)
    .map((key) => `@${key}`)
    .join(', ')
  return {
    action: 'send',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.reference-cluster',
    source,
    entryContext,
    label: label || translate('Cluster selected'),
    prompt: translate(
      'Cluster these references from my library into meaningful themes: {keys}. Suggest collection names, tag cleanup opportunities, reading order, and which papers are foundational vs follow-up.',
      {
        keys: keyList,
      }
    ),
  }
}

function createWorkspaceExplorerTask({
  label = '',
  source = 'launcher',
  entryContext = 'workspace-explorer',
} = {}) {
  return {
    action: 'prefill',
    role: 'code_assistant',
    toolProfile: 'code_assistant',
    taskId: 'workspace.explorer',
    source,
    entryContext,
    label: label || translate('Workspace explorer'),
    prompt: translate(
      'Help me inspect workspace files, trace relevant code or notes, and suggest the next safe action. Start by asking what file or task I want to focus on.'
    ),
  }
}

function createFeedbackAssistantTask({
  label = '',
  source = 'launcher',
  entryContext = 'feedback-assistant',
} = {}) {
  return {
    action: 'prefill',
    role: 'reviewer',
    toolProfile: 'reviewer',
    taskId: 'feedback.assistant',
    source,
    entryContext,
    label: label || translate('Feedback assistant'),
    prompt: translate(
      'Help me work through comments, feedback, or review threads. Ask which document or comment thread I want to address first.'
    ),
  }
}

function createCompileAssistantTask({
  label = '',
  source = 'launcher',
  entryContext = 'compile-assistant',
} = {}) {
  return {
    action: 'prefill',
    role: 'tex_typ_fixer',
    toolProfile: 'tex_typ_fixer',
    taskId: 'compile.assistant',
    source,
    entryContext,
    label: label || translate('Compile assistant'),
    prompt: translate(
      'Help me diagnose a LaTeX or Typst compilation problem. Ask which source file or error log I want to inspect first.'
    ),
  }
}

function createNotebookExplorerTask({
  label = '',
  source = 'launcher',
  entryContext = 'notebook-assistant',
} = {}) {
  return createWorkflowTaskDescriptor({
    workflowTemplateId: 'code.notebook-assistant',
    role: 'code_assistant',
    toolProfile: 'code_assistant',
    taskId: 'code.notebook-explorer',
    source,
    entryContext,
    artifactIntent: 'proposal',
    label: label || translate('Notebook AI'),
    prompt: translate(
      'Help me inspect or modify a notebook. Ask me which notebook or analysis step I want to work on, then use notebook tools when appropriate.'
    ),
  })
}

function buildCapabilityTask(categoryId, currentPath = '') {
  if (categoryId === 'workspace') {
    return createWorkspaceExplorerTask({
      source: 'capabilities',
      entryContext: 'capabilities',
    })
  }
  if (categoryId === 'references') {
    return createReferenceMaintenanceTask({
      source: 'capabilities',
      entryContext: 'capabilities',
    })
  }
  if (categoryId === 'feedback') {
    return createFeedbackAssistantTask({
      source: 'capabilities',
      entryContext: 'capabilities',
    })
  }
  if (categoryId === 'compile') {
    if (currentPath && (isLatex(currentPath) || isTypst(currentPath))) {
      return createTexTypDiagnoseTask({
        filePath: currentPath,
        source: 'capabilities',
        entryContext: 'capabilities',
      })
    }
    return createCompileAssistantTask({
      source: 'capabilities',
      entryContext: 'capabilities',
    })
  }
  if (categoryId === 'notebook') {
    if (currentPath.endsWith('.ipynb')) {
      return createNotebookAssistantTask({
        filePath: currentPath,
        source: 'capabilities',
        entryContext: 'capabilities',
      })
    }
    return createNotebookExplorerTask({
      source: 'capabilities',
      entryContext: 'capabilities',
    })
  }
  if (categoryId === 'web') {
    return createSourceComparisonTask({
      source: 'capabilities',
      entryContext: 'capabilities',
    })
  }
  return null
}

function capabilityDescription(categoryId, t) {
  if (categoryId === 'workspace') return t('Explore workspace files and safe edits')
  if (categoryId === 'references') return t('Search, import, and clean up reference metadata')
  if (categoryId === 'feedback')
    return t('Review comments, answer feedback, and present choice cards')
  if (categoryId === 'compile') return t('Diagnose TeX / Typst compile issues')
  if (categoryId === 'notebook') return t('Read, edit, and run notebook cells')
  if (categoryId === 'web') return t('Search external websites and papers')
  return ''
}

function capabilityMeta(category, t) {
  const parts = [t('{count} tools', { count: categoryToolCount(category) })]
  if (categoryHasExternal(category)) {
    parts.push(categoryAllLocal(category) ? t('Local only') : t('Uses external sources'))
  } else {
    parts.push(t('Local only'))
  }
  return parts.join(' · ')
}

export function getAiCapabilityItems({ currentPath = '', t }) {
  return TOOL_CATEGORIES.map((category, index) => ({
    label: t(category.label),
    description: capabilityDescription(category.id, t),
    meta: capabilityMeta(category, t),
    groupHeader: index === 0 ? t('Capabilities') : null,
    task: buildCapabilityTask(category.id, currentPath),
  })).filter((item) => !!item.task)
}

export function getChatInputToolItems({ currentPath = '', t }) {
  return [
    {
      label: t('Search academic papers'),
      description: t('Search papers and propose the strongest candidates'),
      task: createWorkflowTaskDescriptor({
        workflowTemplateId: 'references.search-intake',
        role: 'citation_librarian',
        toolProfile: 'citation_librarian',
        taskId: 'research.paper-search',
        source: 'chat-input',
        entryContext: 'chat-input',
        label: t('Search academic papers'),
        prompt: t(
          'Help me search academic papers for this topic. Prefer using search_papers first, then present the best candidates with create_proposal.'
        ),
        translateFn: t,
      }),
    },
    {
      label: t('Web Research'),
      description: t('Investigate websites and online sources'),
      task: {
        action: 'prefill',
        role: 'researcher',
        toolProfile: 'researcher',
        taskId: 'research.web',
        source: 'chat-input',
        entryContext: 'chat-input',
        label: t('Web Research'),
        prompt: t(
          'Help me investigate external websites and online sources for this topic. Use web_search and fetch_url when useful.'
        ),
      },
    },
    {
      label: t('Reference maintenance'),
      description: t('Clean up metadata, duplicates, and citation readiness'),
      task: createReferenceMaintenanceTask({
        source: 'chat-input',
        entryContext: 'chat-input',
        label: t('Reference maintenance'),
      }),
    },
    {
      label:
        currentPath && (isLatex(currentPath) || isTypst(currentPath))
          ? t('Compile & Diagnose')
          : t('Compile assistant'),
      description:
        currentPath && (isLatex(currentPath) || isTypst(currentPath))
          ? t('Diagnose the current TeX / Typst document')
          : t('Inspect LaTeX or Typst compile problems'),
      task:
        currentPath && (isLatex(currentPath) || isTypst(currentPath))
          ? createTexTypDiagnoseTask({
              filePath: currentPath,
              source: 'chat-input',
              entryContext: 'chat-input',
              label: t('Compile & Diagnose'),
            })
          : createCompileAssistantTask({
              source: 'chat-input',
              entryContext: 'chat-input',
              label: t('Compile assistant'),
            }),
    },
    {
      label: currentPath.endsWith('.ipynb') ? t('Notebook AI') : t('Notebook assistant'),
      description: currentPath.endsWith('.ipynb')
        ? t('Inspect the current notebook with notebook tools')
        : t('Read, edit, and run notebook cells'),
      task: currentPath.endsWith('.ipynb')
        ? createNotebookAssistantTask({
            filePath: currentPath,
            source: 'chat-input',
            entryContext: 'chat-input',
            label: t('Notebook AI'),
          })
        : createNotebookExplorerTask({
            source: 'chat-input',
            entryContext: 'chat-input',
            label: t('Notebook AI'),
          }),
    },
  ]
}

export function createTexTypFixTask({
  filePath,
  label = '',
  source = 'launcher',
  entryContext = 'document',
} = {}) {
  return createWorkflowTaskDescriptor({
    workflowTemplateId: 'compile.tex-typ-fix',
    role: 'tex_typ_fixer',
    toolProfile: 'tex_typ_fixer',
    allowedTools: [
      'read_file',
      'list_files',
      'search_content',
      'edit_file',
      'write_file',
      'compile_document',
    ],
    initialToolChoice: 'required',
    taskId: 'fix.tex-typ',
    artifactIntent: 'patch',
    source,
    entryContext,
    label: label || translate('Fix TeX / Typst'),
    filePath,
    prompt: translate(
      'Inspect this source file for syntax, structure, and likely compilation issues. Prefer the smallest safe fixes first.'
    ),
  })
}

export function createTexTypDiagnoseTask({
  filePath,
  label = '',
  source = 'launcher',
  entryContext = 'document',
} = {}) {
  return createWorkflowTaskDescriptor({
    workflowTemplateId: 'compile.tex-typ-diagnose',
    role: 'tex_typ_fixer',
    toolProfile: 'tex_typ_fixer',
    taskId: 'diagnose.tex-typ',
    artifactIntent: 'compile_diagnosis',
    source,
    entryContext,
    label: label || translate('Compile & Diagnose'),
    filePath,
    prompt: translate(
      'Run a compile diagnosis for this source file, explain the reported problems, and do not edit anything unless I ask for a fix.'
    ),
  })
}
