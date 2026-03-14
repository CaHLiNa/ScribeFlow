import { snippetCompletion } from '@codemirror/autocomplete'

const TYPST_SNIPPETS = [
  {
    label: 'document',
    detail: 'Document skeleton',
    template: '= ${title}\n\n#set page(paper: "${paper}")\n#set text(font: "${font}", size: ${size})\n\n${}',
  },
  {
    label: 'section',
    detail: 'Section heading',
    template: '= ${title}\n\n${}',
  },
  {
    label: 'figure',
    detail: 'Figure block',
    template: '#figure(\n  image("${image_path}", width: 100%),\n  caption: [${caption}],\n) <${figure_label}>',
  },
  {
    label: 'table',
    detail: 'Table block',
    template: '#figure(\n  table(\n    columns: (${left_col}, ${right_col}),\n    [${header_a}], [${header_b}],\n    [${value_a}], [${value_b}],\n  ),\n  caption: [${caption}],\n) <${table_label}>',
  },
  {
    label: 'equation',
    detail: 'Display equation',
    template: '$\n  ${y} = ${m} ${x} + ${b}\n$',
  },
  {
    label: 'show-rule',
    detail: 'Show rule',
    template: '#show ${target}: set text(weight: "${weight}")\n${}',
  },
  {
    label: 'let-function',
    detail: 'Reusable helper',
    template: '#let ${name}(${args}) = {\n  ${body}\n}\n\n${}',
  },
  {
    label: 'bibliography',
    detail: 'Bibliography block',
    template: '#bibliography("${references_file}")\n${}',
  },
  {
    label: 'outline',
    detail: 'Document outline',
    template: '#outline(title: [${title}])\n${}',
  },
  {
    label: 'columns',
    detail: 'Two-column layout',
    template: '#columns(${count})[\n  ${content}\n]\n${}',
  },
  {
    label: 'code',
    detail: 'Raw code block',
    template: '```\n${code}\n```\n${}',
  },
  {
    label: 'list',
    detail: 'Bullet list',
    template: '- ${first_item}\n- ${second_item}\n- ${}',
  },
]

export function createTypstSnippetCompletions() {
  return TYPST_SNIPPETS.map(snippet => snippetCompletion(snippet.template, {
    label: snippet.label,
    detail: snippet.detail,
    type: 'snippet',
  }))
}
