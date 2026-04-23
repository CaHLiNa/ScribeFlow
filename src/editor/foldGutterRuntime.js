import { RangeSet, RangeSetBuilder } from '@codemirror/state'
import { GutterMarker, gutter, ViewPlugin } from '@codemirror/view'
import {
  codeFolding,
  foldable,
  foldEffect,
  foldState,
  language,
  syntaxTree,
  unfoldEffect,
} from '@codemirror/language'

class FoldChevronMarker extends GutterMarker {
  constructor(kind) {
    super()
    this.kind = kind
  }

  eq(other) {
    return other.kind === this.kind
  }

  toDOM(view) {
    const marker = document.createElement('span')
    const isClosed = this.kind === 'closed'
    marker.className = `cm-foldMarker cm-foldMarker--${this.kind}`
    marker.textContent = isClosed ? '›' : '⌄'
    marker.title = view.state.phrase(isClosed ? 'Unfold line' : 'Fold line')
    if (this.kind === 'open-hidden') {
      marker.setAttribute('aria-hidden', 'true')
    }
    return marker
  }
}

const openVisibleMarker = new FoldChevronMarker('open-visible')
const openHiddenMarker = new FoldChevronMarker('open-hidden')
const closedMarker = new FoldChevronMarker('closed')

function collectActiveLineNumbers(state) {
  const activeLines = new Set()
  for (const range of state.selection.ranges) {
    activeLines.add(state.doc.lineAt(range.head).number)
  }
  return activeLines
}

function findFold(state, from, to) {
  let found = null
  state.field(foldState, false)?.between(from, to, (foldFrom, foldTo) => {
    if (!found || found.from > foldFrom) {
      found = { from: foldFrom, to: foldTo }
    }
  })
  return found
}

function isActiveLine(state, lineFrom) {
  const lineNumber = state.doc.lineAt(lineFrom).number
  for (const range of state.selection.ranges) {
    if (state.doc.lineAt(range.head).number === lineNumber) {
      return true
    }
  }
  return false
}

export function createFoldGutterExtension() {
  const markers = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.markers = this.buildMarkers(view)
      }

      update(update) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.startState.facet(language) !== update.state.facet(language) ||
          syntaxTree(update.startState) !== syntaxTree(update.state) ||
          update.startState.field(foldState, false) !== update.state.field(foldState, false)
        ) {
          this.markers = this.buildMarkers(update.view)
        }
      }

      buildMarkers(view) {
        const builder = new RangeSetBuilder()
        const activeLines = collectActiveLineNumbers(view.state)

        for (const line of view.viewportLineBlocks) {
          const lineNumber = view.state.doc.lineAt(line.from).number
          const folded = findFold(view.state, line.from, line.to)
          if (folded) {
            builder.add(line.from, line.from, closedMarker)
            continue
          }

          if (!foldable(view.state, line.from, line.to)) {
            continue
          }

          builder.add(
            line.from,
            line.from,
            activeLines.has(lineNumber) ? openVisibleMarker : openHiddenMarker
          )
        }

        return builder.finish()
      }
    }
  )

  return [
    markers,
    gutter({
      class: 'cm-foldGutter',
      markers(view) {
        return view.plugin(markers)?.markers || RangeSet.empty
      },
      initialSpacer() {
        return openVisibleMarker
      },
      domEventHandlers: {
        click: (view, line) => {
          const folded = findFold(view.state, line.from, line.to)
          if (folded) {
            view.dispatch({ effects: unfoldEffect.of(folded) })
            return true
          }

          if (!isActiveLine(view.state, line.from)) {
            return false
          }

          const range = foldable(view.state, line.from, line.to)
          if (!range) {
            return false
          }

          view.dispatch({ effects: foldEffect.of(range) })
          return true
        },
      },
    }),
    codeFolding(),
  ]
}
