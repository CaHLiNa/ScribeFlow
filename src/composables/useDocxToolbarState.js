import { computed, onMounted, onUnmounted, ref } from 'vue'
import { trackChangesHelpers } from 'superdoc'
import { hasBibliography } from '../services/docxCitationImporter'

const STYLE_ORDER = ['Normal', 'Title', 'Subtitle', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6', 'Quote', 'IntenseQuote', 'Caption', 'ListParagraph']

function styleSort(a, b) {
  const ai = STYLE_ORDER.indexOf(a.id)
  const bi = STYLE_ORDER.indexOf(b.id)
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  const nameA = a.definition?.attrs?.name || a.id
  const nameB = b.definition?.attrs?.name || b.id
  return nameA.localeCompare(nameB)
}

export function useDocxToolbarState(options) {
  const { getEditor, documentModeRef } = options

  const editor = ref(null)
  const isBold = ref(false)
  const isItalic = ref(false)
  const isUnderline = ref(false)
  const isStrike = ref(false)
  const isBullet = ref(false)
  const isOrdered = ref(false)
  const currentFont = ref('')
  const currentSize = ref('')
  const currentColor = ref('')
  const currentHighlight = ref('')
  const currentAlign = ref('left')
  const currentLineHeight = ref('')
  const hasTrackedChange = ref(false)
  const hasAnyTrackedChanges = ref(false)
  const trackedChangeCount = ref(0)
  const isTrackChangesActive = ref(false)
  const hasBib = ref(false)
  const canUndo = ref(false)
  const canRedo = ref(false)
  const currentStyle = ref('')
  const documentStyles = ref([])

  const showTrackChanges = computed(() =>
    documentModeRef.value === 'suggesting' || hasAnyTrackedChanges.value || isTrackChangesActive.value
  )

  function refreshStyles() {
    const ed = getEditor()
    if (!ed?.helpers?.linkedStyles?.getStyles) return
    try {
      const all = ed.helpers.linkedStyles.getStyles()
      documentStyles.value = (Array.isArray(all) ? all : [])
        .filter((style) => style.type === 'paragraph')
        .sort(styleSort)
    } catch {
      // Styles may be unavailable during SuperDoc startup.
    }
  }

  function syncState() {
    const ed = getEditor()
    if (!ed) return

    isBold.value = ed.isActive('bold')
    isItalic.value = ed.isActive('italic')
    isUnderline.value = ed.isActive('underline')
    isStrike.value = ed.isActive('strike')
    isBullet.value = ed.isActive('bulletList')
    isOrdered.value = ed.isActive('orderedList')

    const attrs = ed.getAttributes('textStyle')
    const rawFont = attrs?.fontFamily?.replace(/['"]/g, '') || ''
    currentFont.value = rawFont.split(',')[0].trim()

    const rawSize = attrs?.fontSize
    if (rawSize) {
      const num = Number.parseFloat(rawSize)
      currentSize.value = Number.isNaN(num) ? '' : String(Math.round(num))
    } else {
      currentSize.value = ''
    }

    currentColor.value = attrs?.color || ''
    currentHighlight.value = ed.getAttributes('highlight')?.color || ''

    const paragraphAttrs = ed.getAttributes('paragraph')
    currentAlign.value = paragraphAttrs?.textAlign || 'left'
    currentLineHeight.value = paragraphAttrs?.lineHeight || ''

    const { $from } = ed.state.selection
    let currentStyleId = ''
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      if ($from.node(depth).type.name === 'paragraph') {
        currentStyleId = $from.node(depth).attrs?.paragraphProperties?.styleId || ''
        break
      }
    }
    if (currentStyleId) {
      const match = documentStyles.value.find((style) => style.id === currentStyleId)
      currentStyle.value = match?.definition?.attrs?.name || currentStyleId
    } else {
      currentStyle.value = 'Normal'
    }

    hasTrackedChange.value = ed.isActive('trackInsert') || ed.isActive('trackDelete') || ed.isActive('trackFormat')

    try {
      const changes = trackChangesHelpers.getTrackChanges(ed.state)
      const count = Array.isArray(changes) ? changes.length : 0
      trackedChangeCount.value = count
      hasAnyTrackedChanges.value = count > 0
    } catch {
      hasAnyTrackedChanges.value = hasTrackedChange.value
      trackedChangeCount.value = 0
    }

    try {
      const plugins = ed.view?.state?.plugins || []
      const trackChangesPlugin = plugins.find((plugin) => plugin.spec?.key?.key === 'TrackChangesBase$')
      const trackChangesState = trackChangesPlugin?.getState?.(ed.state)
      isTrackChangesActive.value = trackChangesState?.isTrackChangesActive ?? (documentModeRef.value === 'suggesting')
    } catch {
      isTrackChangesActive.value = documentModeRef.value === 'suggesting'
    }

    try {
      hasBib.value = hasBibliography(ed.view.state.doc)
    } catch {
      hasBib.value = false
    }

    canUndo.value = ed.can().undo()
    canRedo.value = ed.can().redo()
  }

  let boundSync = null

  onMounted(() => {
    const ed = getEditor()
    if (!ed) return

    editor.value = true
    boundSync = syncState
    ed.on('selectionUpdate', boundSync)
    ed.on('update', boundSync)
    ed.on('update', refreshStyles)
    refreshStyles()
    syncState()
  })

  onUnmounted(() => {
    const ed = getEditor()
    if (ed && boundSync) {
      ed.off('selectionUpdate', boundSync)
      ed.off('update', boundSync)
      ed.off('update', refreshStyles)
    }
  })

  return {
    editor,
    isBold,
    isItalic,
    isUnderline,
    isStrike,
    isBullet,
    isOrdered,
    currentFont,
    currentSize,
    currentColor,
    currentHighlight,
    currentAlign,
    currentLineHeight,
    hasTrackedChange,
    hasAnyTrackedChanges,
    trackedChangeCount,
    isTrackChangesActive,
    hasBib,
    canUndo,
    canRedo,
    currentStyle,
    documentStyles,
    showTrackChanges,
    refreshStyles,
    syncState,
  }
}
