<!-- START OF FILE src/components/sidebar/ContextMenu.vue -->
<template>
  <Teleport to="body">
    <div class="context-menu-backdrop" @mousedown.prevent.stop="emit('close')" @contextmenu.prevent.stop="emit('close')"></div>
    
    <Transition name="menu-fade" appear>
      <div
        ref="menuRef"
        class="context-menu"
        :style="menuStyle"
        @contextmenu.prevent.stop
      >
        <template v-if="!entry || entry.is_dir">
          <button type="button" class="context-menu-item" @click.stop="$emit('create', { ext: null, isDir: true })">
            <IconFolderPlus :size="14" :stroke-width="1.5" />
            <span class="flex-1">{{ t('New Folder') }}</span>
          </button>
          <button type="button" class="context-menu-item" @click.stop="$emit('create', { ext: null })">
            <IconFilePlus :size="14" :stroke-width="1.5" />
            <span class="flex-1">{{ t('New File...') }}</span>
          </button>
          <div class="context-menu-separator"></div>
          <button
            v-for="template in documentTemplates"
            :key="template.id"
            type="button"
            class="context-menu-item"
            @click.stop="$emit('create', { ext: template.ext, suggestedName: template.filename, initialContent: template.content })"
          >
            <component :is="template.ext === '.tex' ? IconMath : IconFileText" :size="14" :stroke-width="1.5" />
            <span class="flex-1">{{ template.label }}</span>
            <span class="context-menu-ext">{{ template.ext }}</span>
          </button>
        </template>

        <template v-if="entry">
          <div v-if="entry.is_dir" class="context-menu-separator"></div>
          <button type="button" class="context-menu-item" @click.stop="$emit('rename', entry)">
            <IconPencil :size="14" :stroke-width="1.5" />
            {{ t('Rename') }}
          </button>
          <button type="button" class="context-menu-item" @click.stop="$emit('duplicate', entry)">
            <IconCopy :size="14" :stroke-width="1.5" />
            {{ t('Duplicate') }}
          </button>
          <button type="button" class="context-menu-item context-menu-item-danger" @click.stop="$emit('delete', entry)">
            <IconTrash :size="14" :stroke-width="1.5" />
            {{ t('Delete') }}
          </button>
        </template>

        <template v-if="selectedCount > 1">
          <div class="context-menu-separator"></div>
          <button type="button" class="context-menu-item context-menu-item-danger" @click.stop="$emit('delete-selected')">
            <IconTrash :size="14" :stroke-width="1.5" />
            {{ t('Delete {count} selected', { count: selectedCount }) }}
          </button>
        </template>

        <template v-if="entry">
          <div class="context-menu-separator"></div>
          <button type="button" class="context-menu-item" @click.stop="$emit('reveal-in-finder', entry)">
            <IconExternalLink :size="14" :stroke-width="1.5" />
            {{ revealLabel }}
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  IconFileText, IconMath, IconFilePlus, IconFolderPlus,
  IconPencil, IconCopy, IconTrash, IconExternalLink,
} from '@tabler/icons-vue'
import { isMac } from '../../platform'
import { useI18n } from '../../i18n'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'

const isWindows = /Win/.test(navigator.platform)
const { t } = useI18n()
const documentTemplates = computed(() => listWorkspaceDocumentTemplates(t))
const revealLabel = isMac ? t('Reveal in Finder') : isWindows ? t('Show in Explorer') : t('Open in File Manager')

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  entry: { type: Object, default: null },
  selectedCount: { type: Number, default: 0 },
})

const emit = defineEmits([
  'close', 'create', 'rename', 'duplicate', 'delete', 'delete-selected', 'reveal-in-finder',
])

const menuRef = ref(null)
const menuStyle = ref({ top: `${props.y}px`, left: `${props.x}px` })

async function calculatePosition() {
  await nextTick()
  if (!menuRef.value) return

  const rect = menuRef.value.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  const vw = window.innerWidth || document.documentElement.clientWidth

  let top = props.y
  let left = props.x

  if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 8)
  if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 8)

  menuStyle.value = { top: `${top}px`, left: `${left}px` }
}

function handleKeyDown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  calculatePosition()
  document.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  cursor: default;
}
.context-menu {
  position: fixed;
  min-width: 200px !important;
}
.context-menu-item {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
}
.flex-1 {
  flex: 1;
  text-align: left;
}
.context-menu-ext {
  font-size: 10.5px;
  color: color-mix(in srgb, var(--text-muted) 76%, transparent);
  opacity: 1;
  margin-left: auto;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}
.context-menu-item:hover .context-menu-ext {
  color: var(--list-active-fg) !important;
}

.menu-fade-enter-active {
  transition: opacity 0.1s ease-out, transform 0.1s cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-fade-leave-active {
  transition: opacity 0.1s ease-in;
}
.menu-fade-enter-from {
  opacity: 0;
  transform: scaleY(0.98) translateY(-2px);
}
.menu-fade-leave-to {
  opacity: 0;
}
</style>