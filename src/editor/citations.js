import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'

function isInCodeContext(state, from, to) {
  let inCode = false
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const name = node.type.name
      if (
        name === 'CodeBlock' ||
        name === 'FencedCode' ||
        name === 'CodeText' ||
        name === 'InlineCode' ||
        name === 'CodeMark' ||
        name === 'CodeInfo'
      ) {
        inCode = true
        return false
      }
      return undefined
    },
  })
  return inCode
}

const CITATION_GROUP_RE = /\[([^\[\]]*@[a-zA-Z][\w.-]*[^\[\]]*)\]/g
const CITE_KEY_RE = /@([a-zA-Z][\w.-]*)/g

function citationDecorations(getByKey) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.build(view)
      }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view)
        }
      }

      build(view) {
        const decorations = []
        const { from, to } = view.viewport
        const start = Math.max(0, from - 200)
        const end = Math.min(view.state.doc.length, to + 200)
        const text = view.state.doc.sliceString(start, end)

        CITATION_GROUP_RE.lastIndex = 0
        let match
        while ((match = CITATION_GROUP_RE.exec(text)) !== null) {
          const matchFrom = start + match.index
          const matchTo = matchFrom + match[0].length
          if (isInCodeContext(view.state, matchFrom, matchTo)) continue

          const inner = match[1]
          const innerStart = matchFrom + 1

          decorations.push(
            Decoration.mark({ class: 'cm-citation-bracket' }).range(matchFrom, matchFrom + 1)
          )
          decorations.push(
            Decoration.mark({ class: 'cm-citation-bracket' }).range(matchTo - 1, matchTo)
          )

          CITE_KEY_RE.lastIndex = 0
          let keyMatch
          while ((keyMatch = CITE_KEY_RE.exec(inner)) !== null) {
            const keyFrom = innerStart + keyMatch.index
            const keyTo = keyFrom + keyMatch[0].length
            const ref = getByKey(keyMatch[1])
            const className = ref ? 'cm-citation-key' : 'cm-citation-key-broken'
            decorations.push(Decoration.mark({ class: className }).range(keyFrom, keyTo))
          }
        }

        return Decoration.set(decorations.sort((a, b) => a.from - b.from))
      }
    },
    { decorations: (instance) => instance.decorations }
  )
}

function citationTriggerPlugin(callbacks = {}) {
  return ViewPlugin.fromClass(
    class {
      update(update) {
        if (!update.docChanged && !update.selectionSet) return

        const pos = update.state.selection.main.head
        const line = update.state.doc.lineAt(pos)
        const textBefore = line.text.substring(0, pos - line.from)

        const lastBracket = textBefore.lastIndexOf('[')
        let insideBrackets = false
        if (lastBracket !== -1) {
          const afterBracket = textBefore.substring(lastBracket + 1)
          if (!afterBracket.includes(']') && afterBracket.includes('@')) {
            insideBrackets = true
          }
        }

        let atIdx = -1
        if (insideBrackets) {
          const afterBracket = textBefore.substring(lastBracket + 1)
          const lastAt = afterBracket.lastIndexOf('@')
          if (lastAt !== -1) atIdx = lastBracket + 1 + lastAt
        } else {
          const lastAt = textBefore.lastIndexOf('@')
          if (lastAt !== -1) {
            const prev = textBefore[lastAt - 1]
            if (lastAt === 0 || prev === '[' || /\s/.test(prev || '')) {
              if (!textBefore.substring(lastAt).includes(']')) {
                atIdx = lastAt
              }
            }
          }
        }

        const isOpen = callbacks.isOpen?.() || false

        if (atIdx === -1) {
          if (isOpen) callbacks.onDismiss?.()
          return
        }

        const query = textBefore.substring(atIdx + 1)
        const absAt = line.from + atIdx
        if (isInCodeContext(update.state, absAt, pos)) {
          if (isOpen) callbacks.onDismiss?.()
          return
        }

        if (!isOpen) {
          if (!update.docChanged) return
          const hasBracketBefore = atIdx > 0 && textBefore[atIdx - 1] === '['
          const triggerFrom = insideBrackets ? absAt : hasBracketBefore ? absAt - 1 : absAt
          update.view.requestMeasure({
            key: 'citation-trigger',
            read: (view) => view.coordsAtPos(absAt),
            write(coords) {
              if (coords && !callbacks.isOpen?.()) {
                callbacks.onOpen?.({
                  x: coords.left,
                  y: coords.bottom,
                  query,
                  triggerFrom,
                  triggerTo: pos,
                  insideBrackets,
                })
              }
            },
          })
        } else {
          callbacks.onQueryChange?.(query, pos)
        }
      }
    }
  )
}

export function citationsExtension(referencesStore, callbacks) {
  const extensions = [citationDecorations((key) => referencesStore.getByKey(key))]
  if (callbacks) extensions.push(citationTriggerPlugin(callbacks))
  return { extensions }
}

export { CITE_KEY_RE, CITATION_GROUP_RE }

