<template>
  <div
    class="py-1.5 px-2 cursor-pointer ref-item group select-none"
    :class="{
      'bg-[var(--bg-hover)]': isActive || isSelected,
    }"
    @click="handleClick"
    @contextmenu.prevent="$emit('context-menu', { event: $event, ref: reference })"
    @mousedown="handleMouseDown"
  >
    <!-- Line 1: Title + indicators -->
    <div class="ref-item-title-row flex items-center gap-1">
      <div class="ref-item-title flex-1 min-w-0 ui-text-xs truncate">
        {{ reference.title || t('Untitled') }}
      </div>
      <!-- Copy citation button (hover) -->
      <UiButton
        type="button"
        variant="ghost"
        size="icon-xs"
        icon-only
        class="ref-item-copy shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        :class="{ 'is-copied': copied }"
        :title="t('Copy citation')"
        :aria-label="t('Copy citation')"
        @click.stop="copyCitation"
      >
        <svg
          v-if="!copied"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="5" y="5" width="8" height="8" rx="1" />
          <path d="M3 11V3a1 1 0 011-1h8" />
        </svg>
        <svg
          v-else
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 8l3 3 7-7" />
        </svg>
      </UiButton>
      <span
        v-if="isCited"
        class="ref-item-cited-dot shrink-0 inline-block w-[5px] h-[5px] rounded-full"
        :title="t('Cited in document')"
      ></span>
      <svg
        v-if="reference._pdfFile"
        class="ref-item-pdf-icon shrink-0"
        width="11"
        height="11"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" />
        <path d="M9 1v4h4" />
      </svg>
      <span v-if="reference._needsReview" class="ref-needs-review shrink-0"></span>
    </div>
    <!-- Line 2: Author (year) -->
    <div class="ref-item-subtitle ui-text-micro mt-0.5 truncate">
      {{ authorLine }}{{ yearStr ? ` (${yearStr})` : '' }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useReferencesStore } from '../../stores/references'
import { useEditorStore } from '../../stores/editor'
import { buildCitationText } from '../../editor/citationSyntax'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  reference: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  isCited: { type: Boolean, default: false },
})

const copied = ref(false)
let copiedTimer = null

function copyCitation() {
  const citation = buildCitationText(editorStore.activeTab, props.reference._key)
  navigator.clipboard.writeText(citation)
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1200)
}

const emit = defineEmits(['click', 'context-menu', 'drag-start'])

const referencesStore = useReferencesStore()
const editorStore = useEditorStore()
const { t } = useI18n()

const isActive = computed(() => referencesStore.activeKey === props.reference._key)

const authorLine = computed(() => {
  const authors = props.reference.author || []
  if (authors.length === 0) return t('Unknown')
  const first = authors[0].family || authors[0].given || ''
  if (authors.length === 1) return first
  if (authors.length === 2) return `${first} & ${authors[1].family || ''}`
  return `${first} et al.`
})

const yearStr = computed(() => {
  return props.reference.issued?.['date-parts']?.[0]?.[0] || ''
})

function handleClick(event) {
  emit('click', { key: props.reference._key, event })
}

let mouseDownInfo = null

function handleMouseDown(event) {
  if (event.button !== 0) return
  mouseDownInfo = { x: event.clientX, y: event.clientY, key: props.reference._key }

  const onMouseMove = (ev) => {
    if (!mouseDownInfo) return
    const dx = Math.abs(ev.clientX - mouseDownInfo.x)
    const dy = Math.abs(ev.clientY - mouseDownInfo.y)
    if (dx > 3 || dy > 3) {
      emit('drag-start', { key: mouseDownInfo.key, event: ev })
      mouseDownInfo = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }
  const onMouseUp = () => {
    mouseDownInfo = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.ref-item-title {
  color: var(--fg-secondary);
  line-height: 1.25;
}

.ref-item-copy {
  color: var(--fg-muted);
}

.ref-item-copy.is-copied {
  color: var(--success);
}

.ref-item-cited-dot {
  background: var(--success);
}

.ref-item-pdf-icon,
.ref-item-subtitle {
  color: var(--fg-muted);
}

.ref-item-subtitle {
  line-height: 1.2;
}
</style>
