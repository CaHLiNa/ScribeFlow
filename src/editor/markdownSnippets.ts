import { snippetCompletion } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'

const MARKDOWN_DRAFT_SNIPPETS = [
  {
    label: '/h1',
    aliases: ['/title'],
    detailKey: 'Top-level heading',
    template: '# ${title}\n\n${}',
  },
  {
    label: '/h2',
    aliases: ['/section'],
    detailKey: 'Section heading',
    template: '## ${title}\n\n${}',
  },
  {
    label: '/h3',
    aliases: ['/subsection'],
    detailKey: 'Subsection heading',
    template: '### ${title}\n\n${}',
  },
  {
    label: '/quote',
    aliases: ['/blockquote'],
    detailKey: 'Block quote',
    template: '> ${quote}\n\n${}',
  },
  {
    label: '/list',
    aliases: ['/ul'],
    detailKey: 'Bullet list',
    template: '- ${item_one}\n- ${item_two}\n- ${}',
  },
  {
    label: '/olist',
    aliases: ['/ol'],
    detailKey: 'Numbered list',
    template: '1. ${first_item}\n2. ${second_item}\n3. ${}',
  },
  {
    label: '/code',
    aliases: ['/fence'],
    detailKey: 'Code fence',
    template: '```${language}\n${code}\n```\n\n${}',
  },
  {
    label: '/math',
    aliases: ['/eq'],
    detailKey: 'Display equation',
    template: '$$\n${expression}\n$$\n\n${}',
  },
  {
    label: '/footnote',
    aliases: ['/fn'],
    detailKey: 'Footnote definition',
    template: '[^${note_id}]: ${note}\n${}',
  },
  {
    label: '/image',
    aliases: ['/img'],
    detailKey: 'Image block',
    template: '![${alt_text}](${path})\n\n${}',
  },
  {
    label: '/table',
    aliases: [],
    detailKey: 'Table skeleton',
    template: '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n\n${}',
  },
]

function isInCodeContext(state, from, to) {
  let inCode = false
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const name = node.type.name
      if (
        name === 'CodeBlock' || name === 'FencedCode' || name === 'CodeText'
        || name === 'InlineCode' || name === 'CodeMark' || name === 'CodeInfo'
      ) {
        inCode = true
        return false
      }
    },
  })
  return inCode
}

function matchesCommand(snippet, query) {
  const commands = [snippet.label, ...(snippet.aliases || [])]
  const normalized = String(query || '').toLowerCase()
  return commands.some(command => command.startsWith(normalized))
}

function buildSnippetOption(snippet, t) {
  return snippetCompletion(snippet.template, {
    label: snippet.label,
    detail: t(snippet.detailKey),
    type: 'snippet',
    boost: 99,
  })
}

function extractMarkdownDraftCommand(textBefore = '') {
  const input = String(textBefore || '')
  let index = 0
  const length = input.length

  const consumeWhitespace = () => {
    while (index < length && /\s/.test(input[index])) index += 1
  }

  consumeWhitespace()

  let advanced = true
  while (advanced && index < length) {
    advanced = false

    while (input[index] === '>') {
      advanced = true
      index += 1
      while (index < length && input[index] === ' ') index += 1
    }

    const listMatch = input.slice(index).match(/^(?:[-+*]|\d+\.)\s+/)
    if (listMatch) {
      advanced = true
      index += listMatch[0].length
      consumeWhitespace()
    }
  }

  const command = input.slice(index)
  if (!/^\/[\w-]*$/.test(command)) return null

  return {
    command,
    from: index,
  }
}

export function createMarkdownDraftSnippetSource(t = (value) => value) {
  return (context) => {
    const { state, pos } = context
    const line = state.doc.lineAt(pos)
    const textBefore = line.text.slice(0, pos - line.from)
    const match = extractMarkdownDraftCommand(textBefore)
    if (!match) return null
    if (isInCodeContext(state, line.from, pos)) return null

    const { command, from } = match
    const options = MARKDOWN_DRAFT_SNIPPETS
      .filter(snippet => matchesCommand(snippet, command))
      .map(snippet => buildSnippetOption(snippet, t))

    if (options.length === 0) return null

    return {
      from: line.from + from,
      options,
      validFor: /^\/[\w-]*$/,
    }
  }
}
