const DEFAULT_TRANSLATOR = (value) => value

export const WORKSPACE_DOCUMENT_TEMPLATES = Object.freeze([
  {
    id: 'markdown-note',
    ext: '.md',
    label: 'Markdown note',
    description: 'Quick notes, reading summaries, and lightweight drafts.',
    filename: 'note.md',
    content: '# Title\n\nStart writing here.\n',
  },
  {
    id: 'latex-article',
    ext: '.tex',
    label: 'LaTeX article',
    description: 'Article-style manuscript with title block and document shell.',
    filename: 'article.tex',
    content:
      '\\documentclass{article}\n\\title{Title}\n\\author{}\n\\date{}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\n\nStart writing here.\n\n\\end{document}\n',
  },
  {
    id: 'typst-paper',
    ext: '.typ',
    label: 'Typst paper',
    description: 'Clean Typst writing starter with title and outline-ready heading.',
    filename: 'paper.typ',
    content: '= Title\n\nStart writing here.\n',
  },
])

export function listWorkspaceDocumentTemplates(t = DEFAULT_TRANSLATOR) {
  return WORKSPACE_DOCUMENT_TEMPLATES.map((template) => ({
    ...template,
    label: t(template.label),
    description: t(template.description),
  }))
}

export function getWorkspaceDocumentTemplate(templateId = '') {
  return WORKSPACE_DOCUMENT_TEMPLATES.find((template) => template.id === templateId) || null
}
