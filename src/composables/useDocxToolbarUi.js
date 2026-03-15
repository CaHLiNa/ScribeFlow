import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignJustified,
} from '@tabler/icons-vue'

const FONT_CATALOG = [
  { name: 'Arial', fallback: 'Arial, Helvetica, sans-serif', shipped: false },
  { name: 'Calibri', fallback: 'Calibri, sans-serif', shipped: false },
  { name: 'Cambria', fallback: 'Cambria, Georgia, serif', shipped: false },
  { name: 'Courier New', fallback: '"Courier New", Courier, monospace', shipped: false },
  { name: 'Geist', fallback: 'Geist, sans-serif', shipped: true },
  { name: 'Georgia', fallback: 'Georgia, serif', shipped: false },
  { name: 'Helvetica', fallback: 'Helvetica, Arial, sans-serif', shipped: false },
  { name: 'Inter', fallback: 'Inter, sans-serif', shipped: true },
  { name: 'JetBrains Mono', fallback: '"JetBrains Mono", monospace', shipped: true },
  { name: 'Lora', fallback: 'Lora, serif', shipped: true },
  { name: 'Palatino', fallback: '"Palatino Linotype", Palatino, serif', shipped: false },
  { name: 'STIX Two Text', fallback: '"STIX Two Text", serif', shipped: true },
  { name: 'Times New Roman', fallback: '"Times New Roman", Times, serif', shipped: false },
  { name: 'Verdana', fallback: 'Verdana, Geneva, sans-serif', shipped: false },
]

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200]
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]
const TEXT_COLORS = [
  '#1a1a1a', '#434343', '#666666', '#999999', '#cccccc',
  '#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#73daca',
  '#7dcfff', '#7aa2f7', '#bb9af7', '#c0caf5', '#a9b1d6',
  '#db4b4b', '#ff7a2e', '#d4a037', '#5fba7d', '#449dab',
  '#2e7de9', '#5a4fcf', '#9854c2', '#8b5cf6', '#6366f1',
]
const HIGHLIGHT_COLORS = [
  '#ffd43b', '#a3e635', '#67e8f9', '#818cf8', '#f472b6',
  '#fbbf24', '#4ade80', '#22d3ee', '#a78bfa', '#fb923c',
  '#fef08a', '#bbf7d0', '#bae6fd', '#c4b5fd', '#fecdd3',
]
const LINE_HEIGHTS = [
  { label: 'Single', value: 1 },
  { label: '1.15', value: 1.15 },
  { label: '1.5', value: 1.5 },
  { label: 'Double', value: 2 },
  { label: '2.5', value: 2.5 },
  { label: '3', value: 3 },
]

export function useDocxToolbarUi(options) {
  const { currentAlign, showTrackChanges } = options

  const openDropdown = ref(null)
  const dropdownPos = ref({})
  const linkUrl = ref('')
  const tableHover = ref({ r: 0, c: 0 })

  const stylesBtn = ref(null)
  const fontBtn = ref(null)
  const sizeBtn = ref(null)
  const colorBtn = ref(null)
  const highlightBtn = ref(null)
  const alignBtn = ref(null)
  const lineHeightBtn = ref(null)
  const linkBtn = ref(null)
  const tableBtn = ref(null)
  const modeBtn = ref(null)
  const linkInput = ref(null)
  const zoomBtn = ref(null)

  const overflowGroups = ref([])
  const showOverflowPopover = ref(false)
  const overflowPopoverPos = ref({})
  const toolbarRow = ref(null)
  const overflowBtn = ref(null)
  const mg0 = ref(null)
  const mg1 = ref(null)
  const mg2 = ref(null)
  const mg3 = ref(null)
  const mg4 = ref(null)
  const mg5 = ref(null)
  const mg6 = ref(null)
  const mg7 = ref(null)

  const availableFonts = ref(FONT_CATALOG)

  const alignIcon = computed(() => {
    const map = {
      left: IconAlignLeft,
      center: IconAlignCenter,
      right: IconAlignRight,
      justify: IconAlignJustified,
    }
    return map[currentAlign.value] || IconAlignLeft
  })

  function getStylePreview(style) {
    const css = {}
    const defs = style?.definition?.styles || {}
    if (defs['font-size']) {
      css.fontSize = defs['font-size']
    } else {
      const id = (style?.id || '').toLowerCase()
      if (id === 'heading1') css.fontSize = '20px'
      else if (id === 'heading2') css.fontSize = '17px'
      else if (id === 'heading3') css.fontSize = '15px'
      else if (id.startsWith('heading')) css.fontSize = '13px'
      else if (id === 'title') css.fontSize = '22px'
      else if (id === 'subtitle') css.fontSize = '15px'
      else css.fontSize = '13px'
    }
    if (defs.bold && defs.bold !== '0' && defs.bold !== false) css.fontWeight = 'bold'
    else if (/heading/i.test(style?.id)) css.fontWeight = 'bold'
    if (defs.italic && defs.italic !== '0' && defs.italic !== false) css.fontStyle = 'italic'
    if (defs.color) css.color = defs.color
    else if (/subtitle/i.test(style?.id)) css.color = 'var(--fg-muted)'
    if (defs['font-family']) css.fontFamily = defs['font-family']
    if (/title/i.test(style?.id) && !/subtitle/i.test(style?.id) && !css.fontWeight) css.fontWeight = '300'
    return css
  }

  function measureOverflow() {
    if (!toolbarRow.value) return

    const refs = [mg0, mg1, mg2, mg3, mg4, mg5, mg6, mg7]
    const elements = []
    for (let index = 0; index < refs.length; index += 1) {
      if (refs[index].value) {
        elements.push({ idx: index, el: refs[index].value })
      }
    }
    if (!elements.length) return

    elements.forEach(({ el }) => { el.style.display = '' })
    void toolbarRow.value.offsetWidth

    const containerWidth = toolbarRow.value.clientWidth
    let totalWidth = 0
    const widths = []
    for (const { el } of elements) {
      const width = el.offsetWidth
      widths.push(width)
      totalWidth += width
    }

    const hidden = []
    if (totalWidth > containerWidth) {
      const available = containerWidth - 40
      let used = 0
      let overflowing = false
      for (let index = 0; index < elements.length; index += 1) {
        if (overflowing) {
          hidden.push(elements[index].idx)
          continue
        }
        used += widths[index]
        if (used > available && elements[index].idx > 0) {
          overflowing = true
          hidden.push(elements[index].idx)
        }
      }
    }

    for (const { idx, el } of elements) {
      el.style.display = hidden.includes(idx) ? 'none' : ''
    }
    overflowGroups.value = hidden
  }

  function toggleOverflow(event) {
    if (showOverflowPopover.value) {
      showOverflowPopover.value = false
      return
    }
    openDropdown.value = null
    showOverflowPopover.value = true

    const btn = overflowBtn.value || event?.currentTarget
    if (btn) {
      const rect = btn.getBoundingClientRect()
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 308))
      overflowPopoverPos.value = {
        position: 'fixed',
        left: `${left}px`,
        top: `${rect.bottom + 4}px`,
        zIndex: 10000,
      }
    }
  }

  function toggleDropdown(name, event, keepOverflow = false) {
    if (!keepOverflow) showOverflowPopover.value = false
    if (openDropdown.value === name) {
      openDropdown.value = null
      return
    }

    openDropdown.value = name
    const refMap = {
      styles: stylesBtn,
      font: fontBtn,
      size: sizeBtn,
      color: colorBtn,
      highlight: highlightBtn,
      align: alignBtn,
      lineHeight: lineHeightBtn,
      link: linkBtn,
      table: tableBtn,
      mode: modeBtn,
      zoom: zoomBtn,
    }
    let btn = refMap[name]?.value
    if (btn && btn.offsetParent === null && event) {
      btn = event.currentTarget
    }
    if (!btn && event) {
      btn = event.currentTarget
    }
    if (btn) {
      const rect = btn.getBoundingClientRect()
      dropdownPos.value = {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.bottom + 4}px`,
        zIndex: 10001,
      }
    }
    if (name === 'link') {
      nextTick(() => linkInput.value?.focus())
    }
    if (name === 'table') {
      tableHover.value = { r: 0, c: 0 }
    }
  }

  function closeDropdown() {
    openDropdown.value = null
    showOverflowPopover.value = false
    linkUrl.value = ''
  }

  let resizeObserver = null
  let rafId = null

  watch(showTrackChanges, () => {
    nextTick(measureOverflow)
  })

  onMounted(async () => {
    try {
      await document.fonts.ready
      availableFonts.value = FONT_CATALOG.filter((font) =>
        font.shipped || document.fonts.check(`16px "${font.name}"`)
      )
    } catch {
      availableFonts.value = FONT_CATALOG
    }

    resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(measureOverflow)
    })

    nextTick(() => {
      measureOverflow()
      if (toolbarRow.value) {
        resizeObserver.observe(toolbarRow.value)
      }
    })
  })

  onUnmounted(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  })

  return {
    openDropdown,
    dropdownPos,
    linkUrl,
    tableHover,
    stylesBtn,
    fontBtn,
    sizeBtn,
    colorBtn,
    highlightBtn,
    alignBtn,
    lineHeightBtn,
    linkBtn,
    tableBtn,
    modeBtn,
    linkInput,
    zoomBtn,
    overflowGroups,
    showOverflowPopover,
    overflowPopoverPos,
    toolbarRow,
    overflowBtn,
    mg0,
    mg1,
    mg2,
    mg3,
    mg4,
    mg5,
    mg6,
    mg7,
    availableFonts,
    zoomPresets: ZOOM_PRESETS,
    fontSizes: FONT_SIZES,
    textColors: TEXT_COLORS,
    highlightColors: HIGHLIGHT_COLORS,
    lineHeights: LINE_HEIGHTS,
    alignIcon,
    getStylePreview,
    measureOverflow,
    toggleOverflow,
    toggleDropdown,
    closeDropdown,
  }
}
