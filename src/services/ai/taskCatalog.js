import { t as translate } from '../../i18n'
import { isMarkdown, isLatex, isTypst, isPdf } from '../../utils/fileTypes.js'
import {
  TOOL_CATEGORIES,
  categoryAllLocal,
  categoryHasExternal,
  categoryToolCount,
} from './toolRegistry.js'

function fileName(path) {
  return String(path || '').split('/').pop() || path
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

function buildWritingTasks(path, t) {
  const name = fileName(path)
  const items = [
    {
      label: t('Review current draft'),
      meta: name,
      task: {
        action: 'send',
        role: 'reviewer',
        toolProfile: 'reviewer',
        taskId: 'review.current-draft',
        artifactIntent: 'review',
        prompt:
          t('Review this draft for argument quality, clarity, structure, and academic tone. Point out concrete revision opportunities.'),
        filePath: path,
      },
    },
    {
      label: t('Citation help'),
      meta: name,
      task: {
        action: 'send',
        role: 'citation_librarian',
        toolProfile: 'citation_librarian',
        taskId: 'citation.current-draft',
        artifactIntent: 'citation_set',
        prompt:
          t('Inspect this draft and identify claims that need stronger citation support or better integration of references.'),
        filePath: path,
      },
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
          prompt:
            t('Inspect the notebook at {path} for reproducibility risks, hidden state, missing dependencies, and unclear execution steps. Start by reading the notebook cells and outputs.', {
              path,
            }),
        },
      },
    ]
  }

  return [
    {
      label: t('Code assistant'),
      meta: name,
      task: {
        action: 'send',
        role: 'code_assistant',
        toolProfile: 'code_assistant',
        taskId: 'code.explain-current',
        prompt:
          t('Explain this code or notebook, identify the main workflow, and call out likely issues, assumptions, or unclear areas.'),
        filePath: path,
      },
    },
    {
      label: t('Check reproducibility'),
      meta: name,
      task: {
        action: 'send',
        role: 'code_assistant',
        toolProfile: 'code_assistant',
        taskId: 'code.reproducibility',
        prompt:
          t('Review this code or notebook for reproducibility risks, hidden state, missing dependencies, and unclear execution steps.'),
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
        prompt:
          t('Describe this dataset, infer likely variable roles, point out data quality issues, and suggest the next analysis steps.'),
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
      task: {
        action: 'send',
        role: 'researcher',
        toolProfile: 'researcher',
        taskId: 'pdf.summarise',
        prompt:
          t('Summarise this PDF by extracting the research question, method, evidence, and key conclusions.'),
        filePath: path,
      },
    },
    {
      label: t('Find related papers'),
      meta: name,
      task: {
        action: 'send',
        role: 'researcher',
        toolProfile: 'researcher',
        taskId: 'pdf.related-papers',
        prompt:
          t('Find papers related to this PDF. Use search_papers and present the best candidates with create_proposal.'),
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
    {
      header: t('Writing'),
      items: [
        {
          label: t('Continue writing'),
          task: {
            action: 'prefill',
            role: 'writer',
            toolProfile: 'writer',
            taskId: 'writer.continue',
            prompt: t('Help me continue writing this section. Start by asking what I am working on.'),
          },
        },
        {
          label: t('Review current draft'),
          task: {
            action: 'prefill',
            role: 'reviewer',
            toolProfile: 'reviewer',
            taskId: 'review.prefill',
            artifactIntent: 'review',
            prompt: t('Act as a critical peer reviewer. Review this draft for originality, logic, clarity, and evidence:'),
          },
        },
      ],
    },
    {
      header: t('Research'),
      items: [
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
          label: t('Search academic papers'),
          task: {
            action: 'prefill',
            role: 'researcher',
            toolProfile: 'researcher',
            taskId: 'research.paper-search',
            prompt: t('Help me search academic papers for this topic. Prefer using search_papers first, then present the best candidates with create_proposal.'),
          },
        },
        {
          label: t('Web Research'),
          task: {
            action: 'prefill',
            role: 'researcher',
            toolProfile: 'researcher',
            taskId: 'research.web',
            prompt: t('Help me investigate external websites and online sources for this topic. Use web_search and fetch_url when useful.'),
          },
        },
        {
          label: t('Fetch web page content'),
          task: {
            action: 'prefill',
            role: 'researcher',
            toolProfile: 'researcher',
            taskId: 'research.fetch-url',
            prompt: t('Help me read one or more URLs. Ask me for the URL if I have not provided it yet, then fetch and summarise the content.'),
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
          task: {
            action: 'prefill',
            role: 'citation_librarian',
            toolProfile: 'citation_librarian',
            taskId: 'citation.prefill',
            artifactIntent: 'citation_set',
            prompt: t('Help me find and integrate citations for this section or claim:'),
          },
        },
        {
          label: t('Add by DOI or BibTeX'),
          task: {
            action: 'prefill',
            role: 'citation_librarian',
            toolProfile: 'citation_librarian',
            taskId: 'citation.import',
            prompt: t('Help me import references from DOI or BibTeX. Ask me for the DOI or BibTeX if I have not provided it yet, then add the references to my library.'),
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
          task: {
            action: 'prefill',
            role: 'code_assistant',
            toolProfile: 'code_assistant',
            taskId: 'code.prefill',
            prompt: t('Help me with this research code, notebook, or debugging task:'),
          },
        },
        {
          label: t('Read notebook cells & outputs'),
          task: {
            action: 'prefill',
            role: 'code_assistant',
            toolProfile: 'code_assistant',
            taskId: 'code.notebook-assistant',
            prompt: t('Help me inspect or modify a notebook. Ask me which notebook or analysis step I want to work on, then use notebook tools when appropriate.'),
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
  contextItems.forEach((item, index) => {
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
        groupHeader: sectionIndex === 0 && itemIndex === 0
          ? t('Workflows')
          : (itemIndex === 0 ? section.header : null),
      })
    })
  })

  return items
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
    prompt: translate('Review and address {count} comments on {path}. Resolve questions, suggest concrete edits, and use the comment tools when appropriate.', {
      count,
      path: relativePath,
    }),
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
    prompt: translate('Review and address the selected comment thread on {path}. Focus on this thread only, answer the comment directly, suggest concrete edits when useful, and use the comment tools when appropriate.', {
      path: relativePath || '',
    }),
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
  return {
    action: 'send',
    role: 'code_assistant',
    toolProfile: 'code_assistant',
    taskId: 'code.notebook-current',
    source,
    entryContext,
    label: label || translate('Notebook AI'),
    prompt: translate('Inspect the notebook at {path}. Start by reading its cells and outputs, then help with analysis, debugging, or edits using notebook tools when appropriate.', {
      path: filePath || '',
    }),
  }
}

export function createReferenceMaintenanceTask({
  label = '',
  source = 'launcher',
  entryContext = 'reference-maintenance',
  focusKeys = [],
} = {}) {
  const keyList = (focusKeys || []).filter(Boolean).map((key) => `@${key}`).join(', ')
  return {
    action: 'send',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.maintenance',
    source,
    entryContext,
    label: label || translate('Reference maintenance'),
    prompt: keyList
      ? translate('Help me maintain my reference library. Focus first on these references: {keys}. Check metadata completeness, duplicates, missing PDFs, and citation-readiness.', {
        keys: keyList,
      })
      : translate('Help me maintain my reference library. Check for incomplete metadata, duplicates, missing PDFs, and weak citation coverage. Ask what part of the library or project I want to focus on first.'),
  }
}

export function createSourceComparisonTask({
  label = '',
  source = 'launcher',
  entryContext = 'research-comparison',
} = {}) {
  return {
    action: 'prefill',
    role: 'researcher',
    toolProfile: 'researcher',
    taskId: 'research.compare-sources',
    source,
    entryContext,
    label: label || translate('Compare sources'),
    prompt: translate('Help me compare papers, sources, or methods for this topic. Ask what I want to compare, then use proposal cards with verifiable links.'),
  }
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
    prompt: translate('Inspect reference {key} in my library. Check metadata completeness, citation-readiness, related usage issues, and suggest concrete fixes. Use reference tools and proposal cards when useful.', {
      key: refKey ? `@${refKey}` : '',
    }),
  }
}

export function createReferenceCompareTask({
  refKeys = [],
  label = '',
  source = 'reference-list',
  entryContext = 'reference-list',
} = {}) {
  const keyList = (refKeys || []).filter(Boolean).map((key) => `@${key}`).join(', ')
  return {
    action: 'send',
    role: 'citation_librarian',
    toolProfile: 'citation_librarian',
    taskId: 'citation.compare',
    source,
    entryContext,
    label: label || translate('Compare selected'),
    prompt: translate('Compare these references from my library: {keys}. Highlight overlap, differences, and where each source fits best. Use get_reference and create_proposal when useful.', {
      keys: keyList,
    }),
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
    prompt: translate('Help me inspect workspace files, trace relevant code or notes, and suggest the next safe action. Start by asking what file or task I want to focus on.'),
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
    prompt: translate('Help me work through comments, feedback, or review threads. Ask which document or comment thread I want to address first.'),
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
    prompt: translate('Help me diagnose a LaTeX or Typst compilation problem. Ask which source file or error log I want to inspect first.'),
  }
}

function createNotebookExplorerTask({
  label = '',
  source = 'launcher',
  entryContext = 'notebook-assistant',
} = {}) {
  return {
    action: 'prefill',
    role: 'code_assistant',
    toolProfile: 'code_assistant',
    taskId: 'code.notebook-explorer',
    source,
    entryContext,
    label: label || translate('Notebook AI'),
    prompt: translate('Help me inspect or modify a notebook. Ask me which notebook or analysis step I want to work on, then use notebook tools when appropriate.'),
  }
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
  if (categoryId === 'feedback') return t('Review comments, answer feedback, and present choice cards')
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
      task: {
        action: 'prefill',
        role: 'researcher',
        toolProfile: 'researcher',
        taskId: 'research.paper-search',
        source: 'chat-input',
        entryContext: 'chat-input',
        label: t('Search academic papers'),
        prompt: t('Help me search academic papers for this topic. Prefer using search_papers first, then present the best candidates with create_proposal.'),
      },
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
        prompt: t('Help me investigate external websites and online sources for this topic. Use web_search and fetch_url when useful.'),
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
      label: currentPath && (isLatex(currentPath) || isTypst(currentPath))
        ? t('Compile & Diagnose')
        : t('Compile assistant'),
      description: currentPath && (isLatex(currentPath) || isTypst(currentPath))
        ? t('Diagnose the current TeX / Typst document')
        : t('Inspect LaTeX or Typst compile problems'),
      task: currentPath && (isLatex(currentPath) || isTypst(currentPath))
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

export function createTexTypFixTask({ filePath, label = '', source = 'launcher', entryContext = 'document' } = {}) {
  return {
    action: 'send',
    role: 'tex_typ_fixer',
    toolProfile: 'tex_typ_fixer',
    taskId: 'fix.tex-typ',
    artifactIntent: 'patch',
    source,
    entryContext,
    label: label || translate('Fix TeX / Typst'),
    filePath,
    prompt:
      translate('Inspect this source file for syntax, structure, and likely compilation issues. Prefer the smallest safe fixes first.'),
  }
}

export function createTexTypDiagnoseTask({ filePath, label = '', source = 'launcher', entryContext = 'document' } = {}) {
  return {
    action: 'send',
    role: 'tex_typ_fixer',
    toolProfile: 'tex_typ_fixer',
    taskId: 'diagnose.tex-typ',
    artifactIntent: 'compile_diagnosis',
    source,
    entryContext,
    label: label || translate('Compile & Diagnose'),
    filePath,
    prompt:
      translate('Run a compile diagnosis for this source file, explain the reported problems, and do not edit anything unless I ask for a fix.'),
  }
}
