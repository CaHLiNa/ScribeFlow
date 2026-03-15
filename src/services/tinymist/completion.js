import { insertCompletionText, snippet } from '@codemirror/autocomplete'
import {
  offsetToTinymistPosition,
  tinymistRangeToOffsets,
} from './textEdits.js'

const COMPLETION_KIND_MAP = {
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'field',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  11: 'unit',
  12: 'value',
  13: 'enum',
  14: 'keyword',
  17: 'file',
  18: 'reference',
  21: 'constant',
  22: 'struct',
  23: 'event',
  24: 'operator',
  25: 'type',
}

function completionInfoText(item) {
  const documentation = item?.documentation
  if (typeof documentation === 'string') return documentation
  if (documentation && typeof documentation.value === 'string') return documentation.value
  return null
}

function completionApplyText(item) {
  if (item?.textEdit?.newText != null) return String(item.textEdit.newText)
  if (item?.insertText != null) return String(item.insertText)
  return String(item?.label || '')
}

function normalizeSnippetTemplate(text) {
  return String(text || '')
    .replace(/\$(\d+)/g, (_, index) => (index === '0' ? '${}' : `\${${index}}`))
}

function completionRange(state, item) {
  const range = item?.textEdit?.range || item?.range
  return tinymistRangeToOffsets(state, range)
}

function applyCompletion(view, completion, from, to, item) {
  const text = completionApplyText(item)
  const range = completionRange(view.state, item)
  const applyFrom = range?.from ?? from
  const applyTo = range?.to ?? to

  if (item?.insertTextFormat === 2) {
    snippet(normalizeSnippetTemplate(text))(view, completion, applyFrom, applyTo)
    return
  }

  view.dispatch(insertCompletionText(view.state, text, applyFrom, applyTo))
}

function normalizeTinymistCompletionItem(item) {
  return {
    label: String(item?.label || ''),
    detail: [item?.detail, item?.labelDetails?.detail].filter(Boolean).join(' ').trim() || undefined,
    info: completionInfoText(item) || undefined,
    type: COMPLETION_KIND_MAP[item?.kind] || 'text',
    apply: (view, completion, from, to) => applyCompletion(view, completion, from, to, item),
  }
}

export function getTinymistCompletionPosition(state, pos) {
  return offsetToTinymistPosition(state, pos)
}

export function normalizeTinymistCompletionResult(context, result) {
  const items = Array.isArray(result) ? result : (Array.isArray(result?.items) ? result.items : [])
  if (items.length === 0) return null

  const word = context.matchBefore(/[#@]?[A-Za-z_][\w:-]*/)
  const from = word ? word.from : context.pos
  const options = items
    .map(normalizeTinymistCompletionItem)
    .filter(option => option.label)

  if (options.length === 0) return null

  return {
    from,
    options,
  }
}
