import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'

const CITE_CMDS =
  'cite[tp]?|citealp|citealt|citeauthor|citeyear|autocite|textcite|parencite|nocite|footcite|fullcite|supercite|smartcite|Cite[tp]?|Parencite|Textcite|Autocite|Smartcite|Footcite|Fullcite'

const LATEX_CITE_RE = new RegExp(`\\\\(${CITE_CMDS})\\{([^}]*)\\}`, 'g')
const KEY_RE = /([a-zA-Z][\w.-]*)/g

class CiteAnnotation extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }

  eq(other) {
    return this.text === other.text
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-latex-cite-annotation'
    span.textContent = ` (${this.text})`
    return span
  }

  ignoreEvent() {
    return true
  }
}

function latexCitationDecorations(getByKey) {
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

        LATEX_CITE_RE.lastIndex = 0
        let match
        while ((match = LATEX_CITE_RE.exec(text)) !== null) {
          const matchFrom = start + match.index
          const matchTo = matchFrom + match[0].length
          const commandName = match[1]
          const keysString = match[2]
          const commandEnd = matchFrom + commandName.length + 1

          decorations.push(
            Decoration.mark({ class: 'cm-latex-cite-cmd' }).range(matchFrom, commandEnd)
          )
          decorations.push(
            Decoration.mark({ class: 'cm-latex-cite-brace' }).range(commandEnd, commandEnd + 1)
          )
          decorations.push(
            Decoration.mark({ class: 'cm-latex-cite-brace' }).range(matchTo - 1, matchTo)
          )

          const keysStart = commandEnd + 1
          KEY_RE.lastIndex = 0
          let keyMatch
          while ((keyMatch = KEY_RE.exec(keysString)) !== null) {
            const keyFrom = keysStart + keyMatch.index
            const keyTo = keyFrom + keyMatch[0].length
            const ref = getByKey(keyMatch[1])
            decorations.push(
              Decoration.mark({
                class: ref ? 'cm-latex-cite-key' : 'cm-latex-cite-key-broken',
              }).range(keyFrom, keyTo)
            )
          }

          const labels = keysString
            .split(',')
            .map((key) => String(key || '').trim())
            .filter(Boolean)
            .map((key) => {
              const ref = getByKey(key)
              if (!ref) return key
              const author = ref.authors?.[0] || ''
              const year = ref.year || ''
              return `${author} ${year}`.trim()
            })

          if (labels.length > 0) {
            decorations.push(
              Decoration.widget({
                widget: new CiteAnnotation(labels.join('; ')),
                side: 1,
              }).range(matchTo)
            )
          }
        }

        return Decoration.set(decorations.sort((a, b) => a.from - b.from))
      }
    },
    { decorations: (instance) => instance.decorations }
  )
}

function latexCitationTriggerPlugin(callbacks = {}) {
  const triggerRe = new RegExp(`\\\\(${CITE_CMDS})\\{([^}]*)$`)

  return ViewPlugin.fromClass(
    class {
      update(update) {
        if (!update.docChanged && !update.selectionSet) return

        const pos = update.state.selection.main.head
        const line = update.state.doc.lineAt(pos)
        const textBefore = line.text.substring(0, pos - line.from)
        const match = textBefore.match(triggerRe)
        const isOpen = callbacks.isOpen?.() || false

        if (!match) {
          if (isOpen) callbacks.onDismiss?.()
          return
        }

        const commandName = match[1]
        const insideBraces = match[2]
        const lastComma = insideBraces.lastIndexOf(',')
        const query = lastComma >= 0 ? insideBraces.substring(lastComma + 1).trim() : insideBraces.trim()
        const commandStart = line.from + textBefore.lastIndexOf(`\\${commandName}`)
        const triggerFrom = lastComma >= 0 ? pos - query.length : commandStart

        if (!isOpen) {
          if (!update.docChanged) return
          update.view.requestMeasure({
            key: 'latex-citation-trigger',
            read: (view) => view.coordsAtPos(pos),
            write(coords) {
              if (coords && !callbacks.isOpen?.()) {
                callbacks.onOpen?.({
                  x: coords.left,
                  y: coords.bottom,
                  query,
                  triggerFrom,
                  triggerTo: pos,
                  insideBrackets: lastComma >= 0,
                  latexCommand: commandName,
                })
              }
            },
          })
        } else {
          callbacks.onQueryChange?.(query, pos, triggerFrom)
        }
      }
    }
  )
}

export function latexCitationsExtension(referencesStore, callbacks) {
  const extensions = [latexCitationDecorations((key) => referencesStore.getByKey(key))]
  if (callbacks) extensions.push(latexCitationTriggerPlugin(callbacks))
  return { extensions }
}

export { CITE_CMDS, LATEX_CITE_RE }
