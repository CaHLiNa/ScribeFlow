<template>
  <div class="docx-toolbar-wrap" v-if="editor">
    <div class="dtb-row" ref="toolbarRow">
      <!-- Group 0: History + Zoom (always visible — never overflows) -->
      <div class="dtb-mgroup" ref="mg0">
        <div class="dtb-group">
          <button class="dtb-btn" :title="t('Undo')" @click="cmd('undo')" :disabled="!canUndo">
            <IconArrowBackUp :size="16" />
          </button>
          <button class="dtb-btn" :title="t('Redo')" @click="cmd('redo')" :disabled="!canRedo">
            <IconArrowForwardUp :size="16" />
          </button>
        </div>
        <div class="dtb-sep"></div>
        <div class="dtb-group dtb-zoom-group">
          <button class="dtb-btn dtb-zoom-btn" :title="t('Zoom Out')" @click="workspace.docxZoomOut()" :disabled="workspace.docxZoomPercent <= 50">
            <IconMinus :size="14" />
          </button>
          <button class="dtb-btn dtb-zoom-pct" :title="t('Zoom')" @click.stop="toggleDropdown('zoom', $event)" ref="zoomBtn">
            <span class="dtb-label">{{ workspace.docxZoomPercent }}%</span>
          </button>
          <button class="dtb-btn dtb-zoom-btn" :title="t('Zoom In')" @click="workspace.docxZoomIn()" :disabled="workspace.docxZoomPercent >= 200">
            <IconPlus :size="14" />
          </button>
        </div>
      </div>

      <!-- Group 1: Styles -->
      <div class="dtb-mgroup" ref="mg1">
        <div class="dtb-sep"></div>
        <div class="dtb-group">
          <button class="dtb-btn dtb-dropdown-trigger" :title="t('Paragraph Style')" @click.stop="toggleDropdown('styles', $event)" ref="stylesBtn" style="width:100px">
            <span class="dtb-label">{{ currentStyle || t('Styles') }}</span>
            <IconChevronDown :size="12" />
          </button>
        </div>
      </div>

      <!-- Group 2: Font -->
      <div class="dtb-mgroup" ref="mg2">
        <div class="dtb-sep"></div>
        <div class="dtb-group">
          <button class="dtb-btn dtb-dropdown-trigger" :title="t('Font')" @click.stop="toggleDropdown('font', $event)" ref="fontBtn" style="width:110px">
            <span class="dtb-label">{{ currentFont || t('Font') }}</span>
            <IconChevronDown :size="12" />
          </button>
          <button class="dtb-btn dtb-dropdown-trigger" :title="t('Font Size')" @click.stop="toggleDropdown('size', $event)" ref="sizeBtn">
            <span class="dtb-label">{{ currentSize || '12' }}</span>
            <IconChevronDown :size="12" />
          </button>
        </div>
      </div>

      <!-- Group 3: Text Formatting -->
      <div class="dtb-mgroup" ref="mg3">
        <div class="dtb-sep"></div>
        <div class="dtb-group">
          <button class="dtb-btn" :class="{ active: isBold }" :title="t('Bold ({shortcut})', { shortcut: 'Cmd+B' })" @click="cmd('toggleBold')">
            <IconBold :size="16" />
          </button>
          <button class="dtb-btn" :class="{ active: isItalic }" :title="t('Italic ({shortcut})', { shortcut: 'Cmd+I' })" @click="cmd('toggleItalic')">
            <IconItalic :size="16" />
          </button>
          <button class="dtb-btn" :class="{ active: isUnderline }" :title="t('Underline ({shortcut})', { shortcut: 'Cmd+U' })" @click="cmd('toggleUnderline')">
            <IconUnderline :size="16" />
          </button>
          <button class="dtb-btn" :class="{ active: isStrike }" :title="t('Strikethrough')" @click="cmd('toggleStrike')">
            <IconStrikethrough :size="16" />
          </button>
          <button class="dtb-btn dtb-color-btn" :title="t('Text Color')" @click.stop="toggleDropdown('color', $event)" ref="colorBtn">
            <IconLetterA :size="16" />
            <span class="dtb-color-bar" :style="{ background: currentColor || 'var(--fg-primary)' }"></span>
          </button>
          <button class="dtb-btn dtb-color-btn" :title="t('Highlight Color')" @click.stop="toggleDropdown('highlight', $event)" ref="highlightBtn">
            <IconHighlight :size="16" />
            <span class="dtb-color-bar" :style="{ background: currentHighlight || '#ffd43b' }"></span>
          </button>
          <button class="dtb-btn" :title="t('Clear Formatting')" @click="clearFormat">
            <IconClearFormatting :size="16" />
          </button>
        </div>
      </div>

      <!-- Group 4: Mode Toggle (higher priority than Paragraph/Insert/TC) -->
      <div class="dtb-mgroup" ref="mg4">
        <div class="dtb-sep"></div>
        <div class="dtb-group">
          <button class="dtb-btn dtb-dropdown-trigger" :class="{ active: documentMode === 'suggesting' }" :title="t('Document Mode')" @click.stop="toggleDropdown('mode', $event)" ref="modeBtn">
            <IconPencil :size="16" />
            <span class="dtb-label">{{ documentMode === 'suggesting' ? t('Suggesting') : t('Editing') }}</span>
            <IconChevronDown :size="12" />
          </button>
        </div>
      </div>

      <!-- Group 5: Paragraph -->
      <div class="dtb-mgroup" ref="mg5">
        <div class="dtb-sep"></div>
        <div class="dtb-group">
          <button class="dtb-btn dtb-dropdown-trigger" :title="t('Alignment')" @click.stop="toggleDropdown('align', $event)" ref="alignBtn">
            <component :is="alignIcon" :size="16" />
            <IconChevronDown :size="12" />
          </button>
          <button class="dtb-btn" :class="{ active: isBullet }" :title="t('Bullet List')" @click="cmd('toggleBulletList')">
            <IconList :size="16" />
          </button>
          <button class="dtb-btn" :class="{ active: isOrdered }" :title="t('Numbered List')" @click="cmd('toggleOrderedList')">
            <IconListNumbers :size="16" />
          </button>
          <button class="dtb-btn" :title="t('Decrease Indent')" @click="cmd('decreaseTextIndent')">
            <IconIndentDecrease :size="16" />
          </button>
          <button class="dtb-btn" :title="t('Increase Indent')" @click="cmd('increaseTextIndent')">
            <IconIndentIncrease :size="16" />
          </button>
          <button class="dtb-btn dtb-dropdown-trigger" :title="t('Line Height')" @click.stop="toggleDropdown('lineHeight', $event)" ref="lineHeightBtn">
            <IconLineHeight :size="16" />
            <IconChevronDown :size="12" />
          </button>
        </div>
      </div>

      <!-- Group 6: Insert -->
      <div class="dtb-mgroup" ref="mg6">
        <div class="dtb-sep"></div>
        <div class="dtb-group">
          <button class="dtb-btn" :title="t('Insert Link')" @click.stop="toggleDropdown('link', $event)" ref="linkBtn">
            <IconLink :size="16" />
          </button>
          <button class="dtb-btn" :title="t('Insert Image')" @click="insertImage">
            <IconPhoto :size="16" />
          </button>
          <button class="dtb-btn" :title="t('Insert Table')" @click.stop="toggleDropdown('table', $event)" ref="tableBtn">
            <IconTable :size="16" />
          </button>
          <button class="dtb-btn" :title="hasBib ? t('Refresh Bibliography') : t('Insert Bibliography')" @click="insertOrRefreshBibliography">
            <component :is="hasBib ? IconRefresh : IconBlockquote" :size="16" />
          </button>
        </div>
      </div>

      <!-- Group 7: Track Changes (conditional) -->
      <div class="dtb-mgroup" ref="mg7" v-if="showTrackChanges">
        <div class="dtb-sep"></div>
        <div class="dtb-group">
          <button class="dtb-btn" :class="{ active: isTrackChangesActive }" :title="t('Toggle Track Changes')" @click="toggleTrackChanges">
            <IconGitMerge :size="16" />
          </button>
          <span v-if="trackedChangeCount > 0" class="dtb-badge">{{ trackedChangeCount }}</span>
          <button class="dtb-btn" :title="t('Previous Change')" @click="goToPrevChange" :disabled="!hasAnyTrackedChanges">
            <IconArrowLeft :size="14" />
          </button>
          <button class="dtb-btn" :title="t('Next Change')" @click="goToNextChange" :disabled="!hasAnyTrackedChanges">
            <IconArrowRight :size="14" />
          </button>
          <div class="dtb-sep" style="height:16px; margin:0 3px;"></div>
          <button class="dtb-btn dtb-accept" :title="t('Accept Change')" @click="acceptChange" :disabled="!hasTrackedChange">
            <IconCheck :size="16" />
          </button>
          <button class="dtb-btn dtb-reject" :title="t('Reject Change')" @click="rejectChange" :disabled="!hasTrackedChange">
            <IconX :size="16" />
          </button>
          <div class="dtb-sep" style="height:16px; margin:0 3px;"></div>
          <button class="dtb-btn dtb-accept" :title="t('Accept All Changes')" @click="acceptAllChanges" :disabled="!hasAnyTrackedChanges">
            <IconChecks :size="16" />
          </button>
          <button class="dtb-btn dtb-reject" :title="t('Reject All Changes')" @click="rejectAllChanges" :disabled="!hasAnyTrackedChanges">
            <IconSquareX :size="16" />
          </button>
        </div>
      </div>

      <!-- Overflow button (before spacer so it sits next to last visible group) -->
      <button v-show="overflowGroups.length > 0" class="dtb-btn dtb-overflow-btn" ref="overflowBtn"
        @click.stop="toggleOverflow($event)" :title="t('More tools')">
        <IconDots :size="16" />
      </button>

      <div class="dtb-spacer"></div>
    </div>

    <!-- Dropdowns (Teleported) -->
    <Teleport to="body">
      <!-- Font Family Dropdown (alphabetical, availability-filtered, each in own typeface) -->
      <div v-if="openDropdown === 'font'" class="dtb-popover dtb-font-popover" :style="dropdownPos" @mousedown.prevent>
        <div
          v-for="f in availableFonts" :key="f.name"
          class="dtb-popover-item"
          :class="{ active: currentFont === f.name }"
          :style="{ fontFamily: f.fallback }"
          @click="setFont(f.name)"
        >{{ f.name }}</div>
        <div v-if="!availableFonts.length" class="dtb-popover-item" style="opacity:0.5; cursor:default;">{{ t('No fonts available') }}</div>
      </div>

      <!-- Zoom Preset Dropdown -->
      <div v-if="openDropdown === 'zoom'" class="dtb-popover dtb-popover-narrow" :style="dropdownPos" @mousedown.prevent>
        <div
          v-for="z in zoomPresets" :key="z"
          class="dtb-popover-item"
          :class="{ active: workspace.docxZoomPercent === z }"
          @click="setZoomPreset(z)"
        >{{ z }}%</div>
      </div>

      <!-- Styles Dropdown -->
      <div v-if="openDropdown === 'styles'" class="dtb-popover dtb-styles-popover" :style="dropdownPos" @mousedown.prevent>
        <div
          v-for="s in documentStyles" :key="s.id"
          class="dtb-popover-item dtb-style-item"
          :class="{ active: currentStyle === (s.definition?.attrs?.name || s.id) }"
          :style="getStylePreview(s)"
          @click="setStyle(s.id)"
        >{{ s.definition?.attrs?.name || s.id }}</div>
        <div v-if="!documentStyles.length" class="dtb-popover-item" style="opacity:0.5; cursor:default;">{{ t('No styles in document') }}</div>
      </div>

      <!-- Font Size Dropdown -->
      <div v-if="openDropdown === 'size'" class="dtb-popover dtb-popover-narrow" :style="dropdownPos" @mousedown.prevent>
        <div
          v-for="s in fontSizes" :key="s"
          class="dtb-popover-item"
          :class="{ active: currentSize == s }"
          @click="setSize(s)"
        >{{ s }}</div>
      </div>

      <!-- Text Color Picker -->
      <div v-if="openDropdown === 'color'" class="dtb-popover dtb-color-popover" :style="dropdownPos" @mousedown.prevent>
        <div class="dtb-color-grid">
          <button
            v-for="c in textColors" :key="c"
            class="dtb-color-swatch"
            :class="{ active: currentColor === c }"
            :style="{ background: c }"
            :title="c"
            @click="setColor(c)"
          ></button>
        </div>
        <button class="dtb-popover-item" style="margin-top:4px" @click="clearColor">{{ t('Clear Color') }}</button>
      </div>

      <!-- Highlight Color Picker -->
      <div v-if="openDropdown === 'highlight'" class="dtb-popover dtb-color-popover" :style="dropdownPos" @mousedown.prevent>
        <div class="dtb-color-grid">
          <button
            v-for="c in highlightColors" :key="c"
            class="dtb-color-swatch"
            :class="{ active: currentHighlight === c }"
            :style="{ background: c }"
            :title="c"
            @click="setHighlight(c)"
          ></button>
        </div>
        <button class="dtb-popover-item" style="margin-top:4px" @click="clearHighlight">{{ t('No Highlight') }}</button>
      </div>

      <!-- Alignment Dropdown -->
      <div v-if="openDropdown === 'align'" class="dtb-popover dtb-popover-narrow" :style="dropdownPos" @mousedown.prevent>
        <div class="dtb-popover-item" :class="{ active: currentAlign === 'left' }" @click="setAlign('left')">
          <IconAlignLeft :size="16" /> {{ t('Left') }}
        </div>
        <div class="dtb-popover-item" :class="{ active: currentAlign === 'center' }" @click="setAlign('center')">
          <IconAlignCenter :size="16" /> {{ t('Center') }}
        </div>
        <div class="dtb-popover-item" :class="{ active: currentAlign === 'right' }" @click="setAlign('right')">
          <IconAlignRight :size="16" /> {{ t('Right') }}
        </div>
        <div class="dtb-popover-item" :class="{ active: currentAlign === 'justify' }" @click="setAlign('justify')">
          <IconAlignJustified :size="16" /> {{ t('Justify') }}
        </div>
      </div>

      <!-- Line Height Dropdown -->
      <div v-if="openDropdown === 'lineHeight'" class="dtb-popover dtb-popover-narrow" :style="dropdownPos" @mousedown.prevent>
        <div
          v-for="lh in lineHeights" :key="lh.value"
          class="dtb-popover-item"
          :class="{ active: currentLineHeight == lh.value }"
          @click="setLineHeight(lh.value)"
        >{{ t(lh.label) }}</div>
      </div>

      <!-- Link Input -->
      <div v-if="openDropdown === 'link'" class="dtb-popover dtb-link-popover" :style="dropdownPos" @mousedown.prevent>
        <input
          ref="linkInput"
          v-model="linkUrl"
          class="dtb-input"
          placeholder="https://..."
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          @keydown.enter="applyLink"
          @keydown.escape="closeDropdown"
        />
        <div class="dtb-link-actions">
          <button class="dtb-link-btn" @click="applyLink" :disabled="!linkUrl.trim()">{{ t('Apply') }}</button>
          <button class="dtb-link-btn" @click="closeDropdown">{{ t('Cancel') }}</button>
        </div>
      </div>

      <!-- Table Grid Selector -->
      <div v-if="openDropdown === 'table'" class="dtb-popover dtb-table-popover" :style="dropdownPos" @mousedown.prevent>
        <div class="dtb-table-label">{{ tableHover.r ? `${tableHover.r} × ${tableHover.c}` : t('Insert Table') }}</div>
        <div class="dtb-table-grid">
          <div
            v-for="r in 6" :key="r"
            class="dtb-table-row"
          >
            <div
              v-for="c in 6" :key="c"
              class="dtb-table-cell"
              :class="{ active: r <= tableHover.r && c <= tableHover.c }"
              @mouseenter="tableHover = { r, c }"
              @click="insertTable(r, c)"
            ></div>
          </div>
        </div>
      </div>

      <!-- Mode Dropdown -->
      <div v-if="openDropdown === 'mode'" class="dtb-popover dtb-popover-narrow" :style="dropdownPos" @mousedown.prevent>
        <div class="dtb-popover-item" :class="{ active: documentMode === 'editing' }" @click="setMode('editing')">
          <IconPencil :size="16" /> {{ t('Editing') }}
        </div>
        <div class="dtb-popover-item" :class="{ active: documentMode === 'suggesting' }" @click="setMode('suggesting')">
          <IconPencilCheck :size="16" /> {{ t('Suggesting') }}
        </div>
      </div>

      <!-- Overflow popover (independent from openDropdown so sub-menus don't close it) -->
      <div v-if="showOverflowPopover" class="dtb-popover dtb-overflow-popover" :style="overflowPopoverPos" @mousedown.prevent>
        <!-- Mode (group 4) -->
        <div v-if="overflowGroups.includes(4)" class="dtb-overflow-section">
          <div class="dtb-overflow-label">{{ t('Mode') }}</div>
          <div class="dtb-group">
            <button class="dtb-btn dtb-dropdown-trigger" :class="{ active: documentMode === 'suggesting' }" @click.stop="toggleDropdown('mode', $event, true)">
              <IconPencil :size="16" />
              <span class="dtb-label">{{ documentMode === 'suggesting' ? t('Suggesting') : t('Editing') }}</span>
              <IconChevronDown :size="12" />
            </button>
          </div>
        </div>
        <!-- Paragraph (group 5) -->
        <div v-if="overflowGroups.includes(5)" class="dtb-overflow-section">
          <div class="dtb-overflow-label">{{ t('Paragraph') }}</div>
          <div class="dtb-group">
            <button class="dtb-btn dtb-dropdown-trigger" :title="t('Alignment')" @click.stop="toggleDropdown('align', $event, true)">
              <component :is="alignIcon" :size="16" />
              <IconChevronDown :size="12" />
            </button>
            <button class="dtb-btn" :class="{ active: isBullet }" :title="t('Bullet List')" @click="cmd('toggleBulletList')">
              <IconList :size="16" />
            </button>
            <button class="dtb-btn" :class="{ active: isOrdered }" :title="t('Numbered List')" @click="cmd('toggleOrderedList')">
              <IconListNumbers :size="16" />
            </button>
            <button class="dtb-btn" :title="t('Decrease Indent')" @click="cmd('decreaseTextIndent')">
              <IconIndentDecrease :size="16" />
            </button>
            <button class="dtb-btn" :title="t('Increase Indent')" @click="cmd('increaseTextIndent')">
              <IconIndentIncrease :size="16" />
            </button>
            <button class="dtb-btn dtb-dropdown-trigger" :title="t('Line Height')" @click.stop="toggleDropdown('lineHeight', $event, true)">
              <IconLineHeight :size="16" />
              <IconChevronDown :size="12" />
            </button>
          </div>
        </div>
        <!-- Insert (group 6) -->
        <div v-if="overflowGroups.includes(6)" class="dtb-overflow-section">
          <div class="dtb-overflow-label">{{ t('Insert') }}</div>
          <div class="dtb-group">
            <button class="dtb-btn" :title="t('Insert Link')" @click.stop="toggleDropdown('link', $event, true)">
              <IconLink :size="16" />
            </button>
            <button class="dtb-btn" :title="t('Insert Image')" @click="insertImage">
              <IconPhoto :size="16" />
            </button>
            <button class="dtb-btn" :title="t('Insert Table')" @click.stop="toggleDropdown('table', $event, true)">
              <IconTable :size="16" />
            </button>
            <button class="dtb-btn" :title="hasBib ? t('Refresh Bibliography') : t('Insert Bibliography')" @click="insertOrRefreshBibliography">
              <component :is="hasBib ? IconRefresh : IconBlockquote" :size="16" />
            </button>
          </div>
        </div>
        <!-- Track Changes (group 7) -->
        <div v-if="showTrackChanges && overflowGroups.includes(7)" class="dtb-overflow-section">
          <div class="dtb-overflow-label">{{ t('Track Changes') }}</div>
          <div class="dtb-group">
            <button class="dtb-btn" :class="{ active: isTrackChangesActive }" :title="t('Toggle Track Changes')" @click="toggleTrackChanges">
              <IconGitMerge :size="16" />
            </button>
            <span v-if="trackedChangeCount > 0" class="dtb-badge">{{ trackedChangeCount }}</span>
            <button class="dtb-btn" :title="t('Previous Change')" @click="goToPrevChange" :disabled="!hasAnyTrackedChanges">
              <IconArrowLeft :size="14" />
            </button>
            <button class="dtb-btn" :title="t('Next Change')" @click="goToNextChange" :disabled="!hasAnyTrackedChanges">
              <IconArrowRight :size="14" />
            </button>
            <div class="dtb-sep" style="height:16px; margin:0 3px;"></div>
            <button class="dtb-btn dtb-accept" :title="t('Accept Change')" @click="acceptChange" :disabled="!hasTrackedChange">
              <IconCheck :size="16" />
            </button>
            <button class="dtb-btn dtb-reject" :title="t('Reject Change')" @click="rejectChange" :disabled="!hasTrackedChange">
              <IconX :size="16" />
            </button>
            <div class="dtb-sep" style="height:16px; margin:0 3px;"></div>
            <button class="dtb-btn dtb-accept" :title="t('Accept All Changes')" @click="acceptAllChanges" :disabled="!hasAnyTrackedChanges">
              <IconChecks :size="16" />
            </button>
            <button class="dtb-btn dtb-reject" :title="t('Reject All Changes')" @click="rejectAllChanges" :disabled="!hasAnyTrackedChanges">
              <IconSquareX :size="16" />
            </button>
          </div>
        </div>
      </div>

      <!-- Backdrop to catch outside clicks -->
      <div v-if="openDropdown || showOverflowPopover" class="dtb-backdrop" @click="closeDropdown" @contextmenu.prevent="closeDropdown"></div>
    </Teleport>
  </div>
</template>

<script setup>
import { toRef } from 'vue'
import {
  IconArrowBackUp, IconArrowForwardUp,
  IconBold, IconItalic, IconUnderline, IconStrikethrough,
  IconLetterA, IconHighlight,
  IconList, IconListNumbers, IconIndentDecrease, IconIndentIncrease, IconLineHeight,
  IconLink, IconPhoto, IconTable, IconBlockquote,
  IconCheck, IconChecks, IconX, IconSquareX, IconChevronDown,
  IconPencil,
  IconArrowLeft, IconArrowRight, IconGitMerge, IconRefresh,
  IconClearFormatting,
  IconDots,
  IconMinus, IconPlus,
} from '@tabler/icons-vue'
import { trackChangesHelpers } from 'superdoc'
import { insertBibliography, refreshBibliography } from '../../services/docxCitationImporter'
import { pickDocxImageDataUrl } from '../../services/docxImage'
import { useDocxToolbarState } from '../../composables/useDocxToolbarState'
import { useDocxToolbarUi } from '../../composables/useDocxToolbarUi'
import { useReferencesStore } from '../../stores/references'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'

const props = defineProps({
  superdoc: { type: Object, default: null },
  documentMode: { type: String, default: 'editing' },
})

const emit = defineEmits(['mode-change'])
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const documentModeRef = toRef(props, 'documentMode')

// --- Raw editor access (no Vue Proxy — SuperDoc uses #private fields) ---
// Parent guarantees activeEditor exists by the time this component mounts.
function getEditor() {
  return props.superdoc?.activeEditor || null
}
const {
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
  syncState,
} = useDocxToolbarState({
  getEditor,
  documentModeRef,
})

const {
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
  zoomPresets,
  fontSizes,
  textColors,
  highlightColors,
  lineHeights,
  alignIcon,
  getStylePreview,
  toggleOverflow,
  toggleDropdown,
  closeDropdown,
} = useDocxToolbarUi({
  currentAlign,
  showTrackChanges,
})

// --- Commands ---
function cmd(name, ...args) {
  const ed = getEditor()
  if (!ed?.commands?.[name]) return
  ed.commands[name](...args)
  ed.view?.focus()
}

// --- Font ---
function setFont(family) {
  cmd('setFontFamily', family)
  closeDropdown()
}

function setSize(size) {
  cmd('setFontSize', size + 'pt')
  closeDropdown()
}

// --- Styles ---
function setStyle(styleId) {
  const ed = getEditor()
  if (!ed) return
  ed.commands.setStyleById?.(styleId)
  closeDropdown()
  ed.view?.focus()
}

// --- Clear formatting ---
function clearFormat() {
  const ed = getEditor()
  if (!ed) return
  ed.commands.clearFormat?.()
  ed.view?.focus()
}

// --- Colors ---
function setColor(c) {
  cmd('setColor', c)
  closeDropdown()
}
function clearColor() {
  cmd('unsetColor')
  closeDropdown()
}
function setHighlight(c) {
  cmd('setHighlight', c)
  closeDropdown()
}
function clearHighlight() {
  cmd('unsetHighlight')
  closeDropdown()
}

// --- Alignment ---
function setAlign(a) {
  cmd('setTextAlign', a)
  closeDropdown()
}

// --- Line Height ---
function setLineHeight(v) {
  cmd('setLineHeight', v)
  closeDropdown()
}

// --- Link ---
function applyLink() {
  const url = linkUrl.value.trim()
  if (!url) return
  const ed = getEditor()
  if (!ed) return
  if (ed.commands.setLink) {
    ed.commands.setLink({ href: url })
  }
  closeDropdown()
  ed.view?.focus()
}

// --- Image ---
async function insertImage() {
  try {
    const src = await pickDocxImageDataUrl()
    if (!src) return
    const ed = getEditor()
    if (ed?.commands?.setImage) {
      ed.commands.setImage({ src })
    }
    ed?.view?.focus()
  } catch (e) {
    console.warn('Image insert failed:', e)
  }
}

// --- Bibliography ---
function insertOrRefreshBibliography() {
  const ed = getEditor()
  if (!ed) return
  const style = referencesStore.citationStyle || 'apa'
  if (hasBib.value) {
    refreshBibliography(ed, style, referencesStore)
  } else {
    insertBibliography(ed, style, referencesStore)
  }
  syncState()
  ed.view?.focus()
}

// --- Table ---
function insertTable(rows, cols) {
  const ed = getEditor()
  if (!ed) return
  if (ed.commands.insertTable) {
    ed.commands.insertTable({ rows, cols, withHeaderRow: false })
  }
  closeDropdown()
  ed.view?.focus()
}

// --- Track changes ---
function acceptChange() {
  const ed = getEditor()
  if (!ed) return
  ed.commands.acceptTrackedChangeBySelection?.()
  ed.view?.focus()
}

function rejectChange() {
  const ed = getEditor()
  if (!ed) return
  ed.commands.rejectTrackedChangeOnSelection?.()
  ed.view?.focus()
}

function acceptAllChanges() {
  const ed = getEditor()
  if (!ed) return
  ed.commands.acceptAllTrackedChanges?.()
  ed.view?.focus()
}

function rejectAllChanges() {
  const ed = getEditor()
  if (!ed) return
  ed.commands.rejectAllTrackedChanges?.()
  ed.view?.focus()
}

function toggleTrackChanges() {
  const ed = getEditor()
  if (!ed) return
  ed.commands.toggleTrackChanges?.()
  syncState()
  ed.view?.focus()
}

function goToNextChange() {
  const ed = getEditor()
  if (!ed) return
  try {
    const changes = trackChangesHelpers.getTrackChanges(ed.state)
    if (!changes?.length) return
    const { from } = ed.state.selection
    const next = changes.find(c => c.from > from) || changes[0]
    if (next) {
      ed.view.dispatch(ed.state.tr.setSelection(
        ed.state.selection.constructor.create(ed.state.doc, next.from)
      ))
      ed.view?.focus()
    }
  } catch {}
}

function goToPrevChange() {
  const ed = getEditor()
  if (!ed) return
  try {
    const changes = trackChangesHelpers.getTrackChanges(ed.state)
    if (!changes?.length) return
    const { from } = ed.state.selection
    const prev = [...changes].reverse().find(c => c.from < from) || changes[changes.length - 1]
    if (prev) {
      ed.view.dispatch(ed.state.tr.setSelection(
        ed.state.selection.constructor.create(ed.state.doc, prev.from)
      ))
      ed.view?.focus()
    }
  } catch {}
}

// --- Zoom presets ---
function setZoomPreset(pct) {
  workspace.setDocxZoom(pct)
  closeDropdown()
}

// --- Mode ---
function setMode(mode) {
  emit('mode-change', mode)
  closeDropdown()
}
</script>

<style scoped>
.docx-toolbar-wrap {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 3px 6px;
  user-select: none;
  flex-shrink: 0;
}
.dtb-row {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: nowrap;
  overflow: hidden;
}
.dtb-mgroup {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.dtb-group {
  display: flex;
  align-items: center;
  gap: 1px;
}
.dtb-sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
  flex-shrink: 0;
}
.dtb-spacer {
  flex: 1;
}

/* Buttons */
.dtb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 28px;
  min-width: 28px;
  padding: 0 5px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  font-size: var(--ui-font-label);
  font-family: var(--ui-font, 'Inter', sans-serif);
  white-space: nowrap;
  transition: background 0.08s, color 0.08s;
}
.dtb-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--fg-primary);
}
.dtb-btn.active {
  background: var(--bg-hover);
  color: var(--accent);
}
.dtb-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.dtb-btn.dtb-accept:not(:disabled):hover {
  color: #9ece6a;
}
.dtb-btn.dtb-reject:not(:disabled):hover {
  color: #f7768e;
}

.dtb-label {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--ui-font-label);
  line-height: 1;
}
.dtb-badge {
  font-size: var(--ui-font-micro);
  line-height: 1;
  padding: 1px 5px;
  border-radius: 8px;
  background: rgba(224,175,104,0.2);
  color: var(--warning, #e0af68);
  font-family: var(--ui-font, 'Inter', sans-serif);
}

/* Color button underbar */
.dtb-color-btn {
  position: relative;
}
.dtb-color-bar {
  position: absolute;
  bottom: 3px;
  left: 5px;
  right: 5px;
  height: 2.5px;
  border-radius: 1px;
}

/* Overflow button */
.dtb-overflow-btn {
  flex-shrink: 0;
}

/* Page zoom controls */
.dtb-zoom-group {
  flex-shrink: 0;
  gap: 0;
}
.dtb-zoom-btn {
  min-width: 24px;
  padding: 0 3px;
  color: var(--fg-muted);
  opacity: 0.7;
}
.dtb-zoom-btn:hover:not(:disabled) {
  opacity: 1;
}
.dtb-zoom-pct {
  min-width: 40px;
  padding: 0 2px;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  opacity: 0.8;
}
.dtb-zoom-pct:hover {
  opacity: 1;
}
</style>

<style>
/* Popover & dropdown styles (global — teleported) */
.dtb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
}
.dtb-popover {
  position: fixed;
  z-index: 10000;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  padding: 4px;
  max-height: 320px;
  overflow-y: auto;
  min-width: 140px;
}
.dtb-popover-narrow {
  min-width: 100px;
}
.dtb-popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--ui-font-label);
  color: var(--fg-primary);
  font-family: var(--ui-font, 'Inter', sans-serif);
  white-space: nowrap;
}
.dtb-popover-item:hover {
  background: var(--bg-hover);
}
.dtb-popover-item.active {
  color: var(--accent);
  background: rgba(122,162,247,0.1);
}

/* Color picker */
.dtb-color-popover {
  min-width: 180px;
  padding: 8px;
}
.dtb-color-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}
.dtb-color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.1s, transform 0.1s;
}
.dtb-color-swatch:hover {
  transform: scale(1.15);
  border-color: var(--fg-muted);
}
.dtb-color-swatch.active {
  border-color: var(--accent);
}

/* Link input popover */
.dtb-link-popover {
  min-width: 260px;
  padding: 8px;
}
.dtb-input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--fg-primary);
  font-size: var(--ui-font-label);
  font-family: var(--ui-font, 'Inter', sans-serif);
  outline: none;
}
.dtb-input:focus {
  border-color: var(--accent);
}
.dtb-link-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  justify-content: flex-end;
}
.dtb-link-btn {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  cursor: pointer;
  font-family: var(--ui-font, 'Inter', sans-serif);
}
.dtb-link-btn:hover {
  background: var(--bg-hover);
}
.dtb-link-btn:disabled {
  opacity: 0.4;
}

/* Table grid selector */
.dtb-table-popover {
  min-width: auto;
  padding: 8px;
}
.dtb-table-label {
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  text-align: center;
  margin-bottom: 6px;
  font-family: var(--ui-font, 'Inter', sans-serif);
}
.dtb-table-grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dtb-table-row {
  display: flex;
  gap: 3px;
}
.dtb-table-cell {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.08s;
}
.dtb-table-cell:hover,
.dtb-table-cell.active {
  background: var(--accent);
  border-color: var(--accent);
}

/* Overflow popover */
.dtb-overflow-popover {
  min-width: 200px;
  padding: 6px;
}
.dtb-overflow-section {
  padding: 4px 2px;
}
.dtb-overflow-section + .dtb-overflow-section {
  border-top: 1px solid var(--border);
}
.dtb-overflow-label {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  padding: 0 6px 4px;
  font-family: var(--ui-font, 'Inter', sans-serif);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Font dropdown — slightly wider for font name previews */
.dtb-font-popover {
  min-width: 170px;
}

/* Styles dropdown */
.dtb-styles-popover {
  min-width: 180px;
}
.dtb-style-item {
  line-height: 1.3;
  padding: 4px 10px;
  white-space: nowrap;
}
</style>
