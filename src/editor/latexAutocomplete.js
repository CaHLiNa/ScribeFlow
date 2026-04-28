/**
 * LaTeX autocomplete for CodeMirror 6.
 *
 * Provides:
 * - static command and environment snippets
 * - project-aware citation completions
 * - project-aware label/reference completions
 * - project-aware input/include/bibliography file completions
 */

import { resolveLatexProjectGraph, buildRelativeLatexInputPath } from '../services/latex/projectGraph.js'
import { extnamePath, stripExtension, uniqueBy } from '../services/documentIntelligence/workspaceGraph.js'

const SECTION_COMMANDS = [
  { label: '\\section{}', type: 'keyword', detail: 'Section heading', apply: '\\section{$}' },
  { label: '\\subsection{}', type: 'keyword', detail: 'Subsection heading', apply: '\\subsection{$}' },
  { label: '\\subsubsection{}', type: 'keyword', detail: 'Subsubsection heading', apply: '\\subsubsection{$}' },
  { label: '\\paragraph{}', type: 'keyword', detail: 'Paragraph heading', apply: '\\paragraph{$}' },
  { label: '\\chapter{}', type: 'keyword', detail: 'Chapter heading', apply: '\\chapter{$}' },
  { label: '\\part{}', type: 'keyword', detail: 'Part heading', apply: '\\part{$}' },
]

const TEXT_COMMANDS = [
  { label: '\\textbf{}', type: 'keyword', detail: 'Bold text', apply: '\\textbf{$}' },
  { label: '\\textit{}', type: 'keyword', detail: 'Italic text', apply: '\\textit{$}' },
  { label: '\\texttt{}', type: 'keyword', detail: 'Monospace text', apply: '\\texttt{$}' },
  { label: '\\underline{}', type: 'keyword', detail: 'Underlined text', apply: '\\underline{$}' },
  { label: '\\emph{}', type: 'keyword', detail: 'Emphasized text', apply: '\\emph{$}' },
  { label: '\\textrm{}', type: 'keyword', detail: 'Roman (serif) text', apply: '\\textrm{$}' },
  { label: '\\textsf{}', type: 'keyword', detail: 'Sans-serif text', apply: '\\textsf{$}' },
  { label: '\\textsc{}', type: 'keyword', detail: 'Small caps', apply: '\\textsc{$}' },
]

const ENVIRONMENT_COMMANDS = [
  { label: '\\begin{equation}', type: 'keyword', detail: 'Numbered equation', apply: '\\begin{equation}\n\t$\n\\end{equation}' },
  { label: '\\begin{align}', type: 'keyword', detail: 'Aligned equations', apply: '\\begin{align}\n\t$\n\\end{align}' },
  { label: '\\begin{figure}', type: 'keyword', detail: 'Figure float', apply: '\\begin{figure}[htbp]\n\t\\centering\n\t$\n\t\\caption{}\n\t\\label{fig:}\n\\end{figure}' },
  { label: '\\begin{table}', type: 'keyword', detail: 'Table float', apply: '\\begin{table}[htbp]\n\t\\centering\n\t\\caption{}\n\t\\label{tab:}\n\t\\begin{tabular}{$}\n\t\t\n\t\\end{tabular}\n\\end{table}' },
  { label: '\\begin{itemize}', type: 'keyword', detail: 'Bulleted list', apply: '\\begin{itemize}\n\t\\item $\n\\end{itemize}' },
  { label: '\\begin{enumerate}', type: 'keyword', detail: 'Numbered list', apply: '\\begin{enumerate}\n\t\\item $\n\\end{enumerate}' },
  { label: '\\begin{abstract}', type: 'keyword', detail: 'Abstract', apply: '\\begin{abstract}\n\t$\n\\end{abstract}' },
  { label: '\\begin{verbatim}', type: 'keyword', detail: 'Verbatim text', apply: '\\begin{verbatim}\n$\n\\end{verbatim}' },
  { label: '\\begin{quote}', type: 'keyword', detail: 'Block quote', apply: '\\begin{quote}\n\t$\n\\end{quote}' },
  { label: '\\begin{minipage}', type: 'keyword', detail: 'Minipage', apply: '\\begin{minipage}{$\\textwidth}\n\t\n\\end{minipage}' },
  { label: '\\begin{theorem}', type: 'keyword', detail: 'Theorem', apply: '\\begin{theorem}\n\t$\n\\end{theorem}' },
  { label: '\\begin{proof}', type: 'keyword', detail: 'Proof', apply: '\\begin{proof}\n\t$\n\\end{proof}' },
  { label: '\\begin{definition}', type: 'keyword', detail: 'Definition', apply: '\\begin{definition}\n\t$\n\\end{definition}' },
  { label: '\\begin{lemma}', type: 'keyword', detail: 'Lemma', apply: '\\begin{lemma}\n\t$\n\\end{lemma}' },
]

const REFERENCE_COMMANDS = [
  { label: '\\label{}', type: 'keyword', detail: 'Label', apply: '\\label{$}' },
  { label: '\\ref{}', type: 'keyword', detail: 'Reference', apply: '\\ref{$}' },
  { label: '\\eqref{}', type: 'keyword', detail: 'Equation reference', apply: '\\eqref{$}' },
  { label: '\\pageref{}', type: 'keyword', detail: 'Page reference', apply: '\\pageref{$}' },
  { label: '\\cite{}', type: 'keyword', detail: 'Citation', apply: '\\cite{$}' },
  { label: '\\citep{}', type: 'keyword', detail: 'Parenthetical citation', apply: '\\citep{$}' },
  { label: '\\citet{}', type: 'keyword', detail: 'Textual citation', apply: '\\citet{$}' },
  { label: '\\footnote{}', type: 'keyword', detail: 'Footnote', apply: '\\footnote{$}' },
]

const INCLUDE_COMMANDS = [
  { label: '\\usepackage{}', type: 'keyword', detail: 'Use package', apply: '\\usepackage{$}' },
  { label: '\\input{}', type: 'keyword', detail: 'Input file', apply: '\\input{$}' },
  { label: '\\include{}', type: 'keyword', detail: 'Include file', apply: '\\include{$}' },
  { label: '\\subfile{}', type: 'keyword', detail: 'Subfile', apply: '\\subfile{$}' },
  { label: '\\includegraphics{}', type: 'keyword', detail: 'Include image', apply: '\\includegraphics[width=$\\textwidth]{}' },
  { label: '\\bibliography{}', type: 'keyword', detail: 'Bibliography file', apply: '\\bibliography{$}' },
  { label: '\\addbibresource{}', type: 'keyword', detail: 'BibLaTeX resource', apply: '\\addbibresource{$}' },
  { label: '\\bibliographystyle{}', type: 'keyword', detail: 'Bib style', apply: '\\bibliographystyle{$}' },
]

const MATH_COMMANDS = [
  { label: '\\frac{}{}', type: 'keyword', detail: 'Fraction', apply: '\\frac{$}{}' },
  { label: '\\sqrt{}', type: 'keyword', detail: 'Square root', apply: '\\sqrt{$}' },
  { label: '\\sum', type: 'keyword', detail: 'Summation' },
  { label: '\\prod', type: 'keyword', detail: 'Product' },
  { label: '\\int', type: 'keyword', detail: 'Integral' },
  { label: '\\partial', type: 'keyword', detail: 'Partial derivative' },
  { label: '\\nabla', type: 'keyword', detail: 'Nabla/gradient' },
  { label: '\\infty', type: 'keyword', detail: 'Infinity' },
  { label: '\\alpha', type: 'keyword', detail: 'Greek letter' },
  { label: '\\beta', type: 'keyword', detail: 'Greek letter' },
  { label: '\\gamma', type: 'keyword', detail: 'Greek letter' },
  { label: '\\delta', type: 'keyword', detail: 'Greek letter' },
  { label: '\\epsilon', type: 'keyword', detail: 'Greek letter' },
  { label: '\\theta', type: 'keyword', detail: 'Greek letter' },
  { label: '\\lambda', type: 'keyword', detail: 'Greek letter' },
  { label: '\\mu', type: 'keyword', detail: 'Greek letter' },
  { label: '\\pi', type: 'keyword', detail: 'Greek letter' },
  { label: '\\sigma', type: 'keyword', detail: 'Greek letter' },
  { label: '\\omega', type: 'keyword', detail: 'Greek letter' },
  { label: '\\mathbb{}', type: 'keyword', detail: 'Blackboard bold', apply: '\\mathbb{$}' },
  { label: '\\mathcal{}', type: 'keyword', detail: 'Calligraphic', apply: '\\mathcal{$}' },
  { label: '\\mathbf{}', type: 'keyword', detail: 'Bold math', apply: '\\mathbf{$}' },
  { label: '\\mathrm{}', type: 'keyword', detail: 'Roman math', apply: '\\mathrm{$}' },
  { label: '\\left', type: 'keyword', detail: 'Left delimiter' },
  { label: '\\right', type: 'keyword', detail: 'Right delimiter' },
  { label: '\\leq', type: 'keyword', detail: 'Less or equal' },
  { label: '\\geq', type: 'keyword', detail: 'Greater or equal' },
  { label: '\\neq', type: 'keyword', detail: 'Not equal' },
  { label: '\\approx', type: 'keyword', detail: 'Approximately' },
  { label: '\\times', type: 'keyword', detail: 'Times' },
  { label: '\\cdot', type: 'keyword', detail: 'Center dot' },
  { label: '\\ldots', type: 'keyword', detail: 'Ellipsis' },
  { label: '\\cdots', type: 'keyword', detail: 'Center ellipsis' },
  { label: '\\forall', type: 'keyword', detail: 'For all' },
  { label: '\\exists', type: 'keyword', detail: 'Exists' },
  { label: '\\in', type: 'keyword', detail: 'Element of' },
  { label: '\\subset', type: 'keyword', detail: 'Subset' },
  { label: '\\cup', type: 'keyword', detail: 'Union' },
  { label: '\\cap', type: 'keyword', detail: 'Intersection' },
  { label: '\\rightarrow', type: 'keyword', detail: 'Right arrow' },
  { label: '\\Rightarrow', type: 'keyword', detail: 'Double right arrow' },
  { label: '\\leftarrow', type: 'keyword', detail: 'Left arrow' },
  { label: '\\overline{}', type: 'keyword', detail: 'Overline', apply: '\\overline{$}' },
  { label: '\\hat{}', type: 'keyword', detail: 'Hat accent', apply: '\\hat{$}' },
  { label: '\\tilde{}', type: 'keyword', detail: 'Tilde accent', apply: '\\tilde{$}' },
  { label: '\\vec{}', type: 'keyword', detail: 'Vector arrow', apply: '\\vec{$}' },
]

const MISC_COMMANDS = [
  { label: '\\documentclass{}', type: 'keyword', detail: 'Document class', apply: '\\documentclass{$}' },
  { label: '\\title{}', type: 'keyword', detail: 'Document title', apply: '\\title{$}' },
  { label: '\\author{}', type: 'keyword', detail: 'Author', apply: '\\author{$}' },
  { label: '\\date{}', type: 'keyword', detail: 'Date', apply: '\\date{$}' },
  { label: '\\maketitle', type: 'keyword', detail: 'Print title block' },
  { label: '\\tableofcontents', type: 'keyword', detail: 'Table of contents' },
  { label: '\\newcommand{}{}', type: 'keyword', detail: 'New command', apply: '\\newcommand{\\$}{}' },
  { label: '\\renewcommand{}{}', type: 'keyword', detail: 'Renew command', apply: '\\renewcommand{\\$}{}' },
  { label: '\\hspace{}', type: 'keyword', detail: 'Horizontal space', apply: '\\hspace{$}' },
  { label: '\\vspace{}', type: 'keyword', detail: 'Vertical space', apply: '\\vspace{$}' },
  { label: '\\noindent', type: 'keyword', detail: 'No indent' },
  { label: '\\centering', type: 'keyword', detail: 'Center content' },
  { label: '\\caption{}', type: 'keyword', detail: 'Caption', apply: '\\caption{$}' },
  { label: '\\item', type: 'keyword', detail: 'List item' },
]

const ALL_COMMANDS = [
  ...SECTION_COMMANDS,
  ...TEXT_COMMANDS,
  ...ENVIRONMENT_COMMANDS,
  ...REFERENCE_COMMANDS,
  ...INCLUDE_COMMANDS,
  ...MATH_COMMANDS,
  ...MISC_COMMANDS,
]

function buildApplyOption(cmd) {
  const option = {
    label: cmd.label,
    type: cmd.type,
    detail: cmd.detail,
  }

  if (!cmd.apply) return option

  const cursorPos = cmd.apply.indexOf('$')
  if (cursorPos >= 0) {
    const text = cmd.apply.replace('$', '')
    option.apply = (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + cursorPos },
      })
    }
  } else {
    option.apply = cmd.apply
  }

  return option
}

function staticCommandCompletion(context) {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const textBefore = line.text.substring(0, pos - line.from)
  const lastBackslash = textBefore.lastIndexOf('\\')
  if (lastBackslash === -1) return null
  if (lastBackslash > 0 && textBefore[lastBackslash - 1] === '\\') return null

  const typed = textBefore.substring(lastBackslash)
  const from = line.from + lastBackslash
  const filter = typed.toLowerCase()
  const matches = ALL_COMMANDS.filter(cmd => cmd.label.toLowerCase().startsWith(filter))
  if (matches.length === 0) return null

  return {
    from,
    options: matches.map(buildApplyOption),
  }
}

function buildSimpleCompletionItems(values = [], detail = '', type = 'text') {
  return uniqueBy(values.filter(Boolean))
    .map(value => ({
      label: String(value),
      type,
      detail,
    }))
}

function matchTrailingCommand(textBefore = '', pattern) {
  const match = textBefore.match(pattern)
  if (!match) return null
  const full = match[0] || ''
  const body = match[1] || ''
  const query = body.split(',').pop()?.trimStart() || ''
  return {
    query,
    fromDistance: query.length,
    fullMatch: full,
    body,
  }
}

function citationCompletionContext(textBefore = '') {
  return matchTrailingCommand(
    textBefore,
    /\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)$/,
  )
}

function referenceCompletionContext(textBefore = '') {
  return matchTrailingCommand(
    textBefore,
    /\\(?:ref|eqref|pageref|autoref|cref|Cref)\{([^}]*)$/,
  )
}

function inputCompletionContext(textBefore = '') {
  const addBib = textBefore.match(/\\addbibresource(?:\[[^\]]*\])?\{([^}]*)$/)
  if (addBib) return { type: 'bib-resource', ...matchTrailingCommand(textBefore, /\\addbibresource(?:\[[^\]]*\])?\{([^}]*)$/) }

  const bibliography = textBefore.match(/\\bibliography\{([^}]*)$/)
  if (bibliography) return { type: 'bib-list', ...matchTrailingCommand(textBefore, /\\bibliography\{([^}]*)$/) }

  const include = textBefore.match(/\\(?:input|include|subfile)\{([^}]*)$/)
  if (include) return { type: 'tex-file', ...matchTrailingCommand(textBefore, /\\(?:input|include|subfile)\{([^}]*)$/) }

  return null
}

function buildFilteredResult(context, values = [], detail = '', type = 'text') {
  if (!Array.isArray(values) || values.length === 0) return null
  const { pos } = context
  const line = context.state.doc.lineAt(pos)
  const textBefore = line.text.substring(0, pos - line.from)
  const completionContext = citationCompletionContext(textBefore)
    || referenceCompletionContext(textBefore)
    || inputCompletionContext(textBefore)
  if (!completionContext) return null

  const query = completionContext.query || ''
  const options = buildSimpleCompletionItems(values, detail, type)
    .filter(option => option.label.toLowerCase().includes(query.toLowerCase()))

  if (options.length === 0) return null
  return {
    from: pos - completionContext.fromDistance,
    options,
  }
}

async function projectAwareCompletion(context, options = {}) {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const textBefore = line.text.substring(0, pos - line.from)
  const filePath = options.filePath || ''
  if (!filePath) return null

  const citeContext = citationCompletionContext(textBefore)
  const refContext = referenceCompletionContext(textBefore)
  const fileContext = inputCompletionContext(textBefore)
  if (!citeContext && !refContext && !fileContext) return null

  const contentOverrides = {
    ...(options.contentOverrides || {}),
    [filePath]: context.state.doc.toString(),
  }
  const graph = await resolveLatexProjectGraph(filePath, {
    ...options,
    contentOverrides,
  }).catch(() => null)
  if (!graph) return null

  if (citeContext) {
    const values = uniqueBy(graph.bibKeys || [])
    return buildFilteredResult(context, values, 'Citation key', 'variable')
  }

  if (refContext) {
    const values = uniqueBy((graph.labels || []).map(label => label.key))
    return buildFilteredResult(context, values, 'Document label', 'constant')
  }

  if (fileContext?.type === 'tex-file') {
    const values = uniqueBy(
      (graph.projectPaths || [])
        .filter(path => path !== filePath && ['.tex', '.latex'].includes(extnamePath(path)))
        .map(path => buildRelativeLatexInputPath(filePath, path)),
    )
    return buildFilteredResult(context, values, 'Project file', 'file')
  }

  if (fileContext?.type === 'bib-resource') {
    const values = uniqueBy(
      (graph.bibliographyFiles || [])
        .map(path => buildRelativeLatexInputPath(filePath, path) + (extnamePath(path) === '.bib' ? '.bib' : ''))
        .map(value => value.replace(/\.bib\.bib$/i, '.bib')),
    )
    return buildFilteredResult(context, values, 'Bibliography file', 'file')
  }

  if (fileContext?.type === 'bib-list') {
    const values = uniqueBy(
      (graph.bibliographyFiles || [])
        .map(path => stripExtension(buildRelativeLatexInputPath(filePath, path))),
    )
    return buildFilteredResult(context, values, 'Bibliography file', 'file')
  }

  return null
}

export function latexCommandCompletionSource(context) {
  return staticCommandCompletion(context)
}

export function createLatexCompletionSource(options = {}) {
  return async (context) => {
    const projectResult = await projectAwareCompletion(context, options)
    if (projectResult) return projectResult
    return staticCommandCompletion(context)
  }
}
