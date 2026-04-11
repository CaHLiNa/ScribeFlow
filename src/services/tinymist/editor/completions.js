import { snippetCompletion } from '@codemirror/autocomplete'
import { createTypstSnippetCompletions } from '../../../editor/typstSnippets.js'
import { collectTypstReferenceOptions } from '../../../editor/typstDocument.js'
import { resolveTypstProjectGraph } from '../../typst/projectGraph.js'
import { requestTinymistCompletion } from '../session.js'
import {
  getTinymistCompletionPosition,
  normalizeTinymistCompletionResult,
} from '../completion.js'

const HASH_OPTIONS = [
  snippetCompletion('#set page(paper: "${paper}", margin: (${margin_x}, ${margin_y}))', {
    label: '#set page()',
    detail: 'Configure page layout',
    type: 'keyword',
  }),
  snippetCompletion('#set text(font: "${font}", size: ${size})', {
    label: '#set text()',
    detail: 'Configure document typography',
    type: 'keyword',
  }),
  snippetCompletion('#set heading(numbering: "${numbering}")', {
    label: '#set heading()',
    detail: 'Configure heading numbering',
    type: 'keyword',
  }),
  snippetCompletion('#show heading: set text(weight: "${weight}", fill: ${fill})', {
    label: '#show heading',
    detail: 'Customize heading appearance',
    type: 'keyword',
  }),
  snippetCompletion('#let ${name}(${args}) = {\n  ${body}\n}', {
    label: '#let',
    detail: 'Define a reusable helper',
    type: 'keyword',
  }),
  snippetCompletion('#align(${alignment})[${content}]', {
    label: '#align()[]',
    detail: 'Align block content',
    type: 'function',
  }),
  snippetCompletion('#columns(${count})[\n  ${content}\n]', {
    label: '#columns()[]',
    detail: 'Multi-column layout',
    type: 'function',
  }),
  snippetCompletion('#figure(\n  ${content},\n  caption: [${caption}],\n) <${figure_label}>', {
    label: '#figure()',
    detail: 'Figure with caption and label',
    type: 'function',
  }),
  snippetCompletion('#table(\n  columns: (${col_left}, ${col_right}),\n  [${header_a}], [${header_b}],\n  [${value_a}], [${value_b}],\n)', {
    label: '#table()',
    detail: 'Table helper',
    type: 'function',
  }),
  snippetCompletion('#image("${image_path}", width: ${image_width})', {
    label: '#image()',
    detail: 'Insert image',
    type: 'function',
  }),
  snippetCompletion('#quote(block: true)[${quote}]', {
    label: '#quote()[]',
    detail: 'Block quote',
    type: 'function',
  }),
  snippetCompletion('#footnote[${note}]', {
    label: '#footnote[]',
    detail: 'Insert footnote',
    type: 'function',
  }),
  snippetCompletion('#outline(title: [${title}])', {
    label: '#outline()',
    detail: 'Insert document outline',
    type: 'function',
  }),
  snippetCompletion('#pagebreak()', {
    label: '#pagebreak()',
    detail: 'Insert page break',
    type: 'function',
  }),
  snippetCompletion('#link("${url}")[${link_text}]', {
    label: '#link()[]',
    detail: 'Insert hyperlink',
    type: 'function',
  }),
  snippetCompletion('#grid(columns: (${first_col}, ${second_col}), gutter: ${gutter})[\n  ${content}\n]', {
    label: '#grid()[]',
    detail: 'Grid layout',
    type: 'function',
  }),
  snippetCompletion('#bibliography("${references_file}")', {
    label: '#bibliography()',
    detail: 'Attach bibliography file',
    type: 'function',
  }),
]

const WORD_OPTIONS = [
  ...createTypstSnippetCompletions(),
  snippetCompletion('$${expression}$', {
    label: 'math',
    detail: 'Inline math',
    type: 'snippet',
  }),
  snippetCompletion('```\n${code}\n```', {
    label: 'code',
    detail: 'Raw code block',
    type: 'snippet',
  }),
  {
    label: 'reference',
    detail: 'Cross-reference placeholder',
    type: 'keyword',
    apply: '@label',
  },
]

function linePrefixBefore(text, from) {
  return text.slice(0, from).trim()
}

function createLocalTypstCompletionSource(options = {}) {
  const { referencesStore } = options

  return (context) => {
    const { state, pos, explicit } = context
    const line = state.doc.lineAt(pos)
    const textBefore = line.text.slice(0, pos - line.from)
    const hasBareHashTrigger = /#$/.test(textBefore)

    const hashMatch = textBefore.match(/#[\w-]+$/)
    if (hashMatch) {
      return {
        from: pos - hashMatch[0].length,
        options: HASH_OPTIONS,
        validFor: /#[\w-]*/,
      }
    }

    if (hasBareHashTrigger) {
      return {
        from: pos - 1,
        options: HASH_OPTIONS,
        validFor: /#[\w-]*/,
      }
    }

    const atMatch = textBefore.match(/(?:^|[^\w])@([\w:-]*)$/)
    if (atMatch) {
      const query = atMatch[1] || ''
      const from = pos - query.length - 1
      const referenceOptions = collectTypstReferenceOptions({
        referencesStore,
        documentText: state.doc.toString(),
        query,
      })

      if (referenceOptions.length > 0) {
        return {
          from,
          options: referenceOptions,
          validFor: /@[\w:-]*/,
          filter: false,
        }
      }
    }

    const word = context.matchBefore(/[A-Za-z][\w-]*/)
    if (!word) return null
    if (word.from === word.to && !explicit) return null

    const prefix = linePrefixBefore(line.text, word.from - line.from)
    if (!explicit && prefix) return null

    return {
      from: word.from,
      options: WORD_OPTIONS,
      validFor: /[\w-]*/,
    }
  }
}

function mergeCompletionResults(primary, secondary) {
  if (!primary) return secondary
  if (!secondary) return primary

  const seen = new Set()
  const options = []
  for (const option of [...primary.options, ...secondary.options]) {
    const signature = `${option.label}::${option.detail || ''}`
    if (seen.has(signature)) continue
    seen.add(signature)
    options.push(option)
  }

  return {
    from: Math.min(primary.from ?? secondary.from ?? 0, secondary.from ?? primary.from ?? 0),
    options,
    filter: primary.filter === false || secondary.filter === false ? false : undefined,
    validFor: primary.validFor || secondary.validFor,
  }
}

export function createTinymistTypstCompletionSource(options = {}) {
  const localCompletionSource = createLocalTypstCompletionSource(options)

  return async (context) => {
    const line = context.state.doc.lineAt(context.pos)
    const textBefore = line.text.slice(0, context.pos - line.from)
    const atMatch = textBefore.match(/(?:^|[^\w])@([\w:-]*)$/)

    if (atMatch) {
      const query = atMatch[1] || ''
      const from = context.pos - query.length - 1
      let projectLabels = []

      if (options.filePath) {
        const graph = await resolveTypstProjectGraph(options.filePath, {
          filesStore: options.filesStore,
          workspacePath: options.workspacePath,
          contentOverrides: {
            [options.filePath]: context.state.doc.toString(),
          },
        }).catch(() => null)
        projectLabels = Array.isArray(graph?.labels) ? graph.labels : []
      }

      const referenceOptions = collectTypstReferenceOptions({
        referencesStore: options.referencesStore,
        documentText: context.state.doc.toString(),
        projectLabels,
        query,
      })

      if (referenceOptions.length > 0) {
        return {
          from,
          options: referenceOptions,
          validFor: /@[\w:-]*/,
          filter: false,
        }
      }
    }

    const localResult = localCompletionSource(context)
    if (localResult?.filter === false) {
      return localResult
    }

    if (!context.explicit) {
      return localResult
    }

    if (!options.filePath) {
      return localResult
    }

    const tinymistResult = await requestTinymistCompletion(
      options.filePath,
      getTinymistCompletionPosition(context.state, context.pos),
      { triggerKind: 1 },
    )
    if (context.aborted) return null

    const normalizedTinymist = normalizeTinymistCompletionResult(context, tinymistResult)
    return mergeCompletionResults(normalizedTinymist, localResult)
  }
}
