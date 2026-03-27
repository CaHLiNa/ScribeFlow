import { reactive } from 'vue'
import { CITATION_GROUP_RE } from '../editor/citations'
import { buildCitationText } from '../editor/citationSyntax'
import { LATEX_CITE_RE } from '../services/latexCitationParsing.js'
import {
  maybePromptLatexBibliography,
} from '../services/latexCitationAssist.js'
import {
  parseCitationGroup,
  parseTypstCitationGroup,
  TYPST_CITATION_GROUP_RE,
} from '../editor/textEditorInteractions'

export function useTextEditorCitations(options) {
  const { filePath, getView, isLatexFile, isTypstFile, t, toastStore } = options

  const citPalette = reactive({
    show: false,
    mode: 'insert',
    x: 0,
    y: 0,
    query: '',
    cites: [],
    latexCommand: null,
    triggerFrom: 0,
    triggerTo: 0,
    insideBrackets: false,
    groupFrom: 0,
    groupTo: 0,
  })

  function openCitationPaletteAtSelection(editorView = getView(), paletteOptions = {}) {
    if (!editorView) return false

    const selection = editorView.state.selection.main
    const anchorPos = selection.head
    const coords = editorView.coordsAtPos(anchorPos)
    if (!coords) return false

    citPalette.show = true
    citPalette.mode = 'insert'
    citPalette.x = coords.left
    citPalette.y = coords.bottom + 2
    citPalette.query = paletteOptions.query || ''
    citPalette.triggerFrom = paletteOptions.triggerFrom ?? selection.from
    citPalette.triggerTo = paletteOptions.triggerTo ?? selection.to
    citPalette.insideBrackets = paletteOptions.insideBrackets ?? false
    citPalette.latexCommand = paletteOptions.latexCommand ?? (isLatexFile ? 'cite' : null)
    citPalette.cites = []
    return true
  }

  function onCitInsert({ keys, stayOpen, latexCommand }) {
    const view = getView()
    if (!view || !keys.length) return

    const key = keys[0]
    const insertFrom = citPalette.triggerFrom
    const insertTo = citPalette.triggerTo
    const text = citPalette.insideBrackets
      ? (isLatexFile && latexCommand ? key : `@${key}`)
      : buildCitationText(filePath, key, { latexCommand: latexCommand || 'cite' })

    view.dispatch({
      changes: { from: insertFrom, to: insertTo, insert: text },
      selection: { anchor: insertFrom + text.length },
    })

    if (isLatexFile) {
      maybePromptLatexBibliography({
        view,
        filePath,
        t,
        toastStore,
      })
    }

    if (stayOpen) {
      const cursor = view.state.selection.main.head
      const line = view.state.doc.lineAt(cursor)
      const matcher = isTypstFile ? TYPST_CITATION_GROUP_RE : CITATION_GROUP_RE
      matcher.lastIndex = 0
      let match

      while ((match = matcher.exec(line.text)) !== null) {
        const groupFrom = line.from + match.index
        const groupTo = groupFrom + match[0].length
        if (cursor >= groupFrom && cursor <= groupTo) {
          citPalette.mode = 'edit'
          citPalette.groupFrom = groupFrom
          citPalette.groupTo = groupTo
          citPalette.cites = isTypstFile ? parseTypstCitationGroup(match[0]) : parseCitationGroup(match[0])
          citPalette.query = ''
          return
        }
      }
    }

    citPalette.show = false
    view.focus()
  }

  function onCitUpdate({ cites }) {
    const view = getView()
    if (!view) return

    if (isLatexFile) {
      const keys = cites.map((citation) => citation.key)
      const command = citPalette.latexCommand || 'cite'
      const text = `\\${command}{${keys.join(', ')}}`
      view.dispatch({
        changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: text },
      })
      citPalette.groupTo = citPalette.groupFrom + text.length
      return
    }

    if (isTypstFile) {
      if (cites.length === 0) {
        view.dispatch({
          changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: '' },
        })
        return
      }

      const text = cites.map((citation) => `@${citation.key}`).join(' ')
      view.dispatch({
        changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: text },
      })
      citPalette.groupTo = citPalette.groupFrom + text.length
      return
    }

    if (cites.length === 0) {
      view.dispatch({
        changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: '' },
      })
      return
    }

    const parts = cites.map((citation) => {
      let part = ''
      if (citation.prefix) part += `${citation.prefix} `
      part += `@${citation.key}`
      if (citation.locator) part += `, ${citation.locator}`
      return part
    })

    const text = `[${parts.join('; ')}]`
    view.dispatch({
      changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: text },
    })
    citPalette.groupTo = citPalette.groupFrom + text.length
  }

  function onCitClose() {
    citPalette.show = false
    getView()?.focus()
  }

  function openPaletteFromExtension(payload) {
    openCitationPaletteAtSelection(getView(), {
      query: payload.query,
      triggerFrom: payload.triggerFrom,
      triggerTo: payload.triggerTo,
      insideBrackets: payload.insideBrackets,
      latexCommand: payload.latexCommand ?? null,
    })
    citPalette.x = payload.x
    citPalette.y = payload.y
  }

  function updatePaletteQuery(query, cursorPos, triggerFrom) {
    citPalette.query = query
    citPalette.triggerTo = cursorPos
    if (triggerFrom !== undefined) citPalette.triggerFrom = triggerFrom
  }

  function dismissInsertPalette() {
    if (citPalette.show && citPalette.mode === 'insert') {
      citPalette.show = false
    }
  }

  function openPaletteFromMatchedCitation(event, buildPayload, matcher) {
    const view = getView()
    if (!view || event.metaKey || event.ctrlKey) return

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) return

    const line = view.state.doc.lineAt(pos)
    matcher.lastIndex = 0
    let match

    while ((match = matcher.exec(line.text)) !== null) {
      const groupFrom = line.from + match.index
      const groupTo = groupFrom + match[0].length
      if (pos < groupFrom || pos >= groupTo) continue

      const coords = view.coordsAtPos(groupFrom)
      const payload = buildPayload(match, groupFrom, groupTo)
      citPalette.show = true
      citPalette.mode = 'edit'
      citPalette.x = event.clientX
      citPalette.y = (coords?.bottom ?? event.clientY) + 2
      citPalette.groupFrom = groupFrom
      citPalette.groupTo = groupTo
      citPalette.cites = payload.cites
      citPalette.query = ''
      citPalette.latexCommand = payload.latexCommand ?? null
      citPalette.insideBrackets = true
      event.preventDefault()
      event.stopPropagation()
      return
    }
  }

  function handleCitationClick(event) {
    openPaletteFromMatchedCitation(
      event,
      (match) => ({
        cites: parseCitationGroup(match[0]),
        latexCommand: null,
      }),
      CITATION_GROUP_RE,
    )
  }

  function handleLatexCitationClick(event) {
    openPaletteFromMatchedCitation(
      event,
      (match) => ({
        cites: match[2].split(',').map((key) => key.trim()).filter(Boolean).map((key) => ({
          key,
          locator: '',
          prefix: '',
        })),
        latexCommand: match[1],
      }),
      LATEX_CITE_RE,
    )
  }

  function handleTypstCitationClick(event) {
    openPaletteFromMatchedCitation(
      event,
      (match) => ({
        cites: parseTypstCitationGroup(match[0]),
        latexCommand: null,
      }),
      TYPST_CITATION_GROUP_RE,
    )
  }

  function createMarkdownCitationHandlers() {
    return {
      onOpen: ({ x, y, query, triggerFrom, triggerTo, insideBrackets }) => {
        openPaletteFromExtension({ x, y, query, triggerFrom, triggerTo, insideBrackets, latexCommand: null })
      },
      onQueryChange: (query, cursorPos) => {
        updatePaletteQuery(query, cursorPos)
      },
      onDismiss: dismissInsertPalette,
    }
  }

  function createLatexCitationHandlers() {
    return {
      onOpen: ({ x, y, query, triggerFrom, triggerTo, insideBrackets, latexCommand }) => {
        openPaletteFromExtension({ x, y, query, triggerFrom, triggerTo, insideBrackets, latexCommand })
      },
      onQueryChange: (query, cursorPos, newTriggerFrom) => {
        updatePaletteQuery(query, cursorPos, newTriggerFrom)
      },
      onDismiss: dismissInsertPalette,
    }
  }

  return {
    citPalette,
    openCitationPaletteAtSelection,
    onCitInsert,
    onCitUpdate,
    onCitClose,
    handleCitationClick,
    handleLatexCitationClick,
    handleTypstCitationClick,
    createMarkdownCitationHandlers,
    createLatexCitationHandlers,
  }
}
