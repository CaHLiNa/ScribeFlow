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
    id: 'python-script',
    ext: '.py',
    label: 'Python script',
    description: 'Quick scripts, experiments, and small research helpers.',
    filename: 'script.py',
    content:
      'def main() -> None:\n    print("Hello from ScribeFlow")\n\n\nif __name__ == "__main__":\n    main()\n',
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
