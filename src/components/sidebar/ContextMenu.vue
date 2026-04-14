<template>
  <DropdownMenuRoot :open="menuOpen" :modal="false" @update:open="handleOpenChange">
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="context-menu"
        :reference="menuReference"
        position="popper"
        position-strategy="fixed"
        side="bottom"
        align="start"
        :avoid-collisions="true"
        :prioritize-position="true"
        :side-flip="true"
        :align-flip="true"
        :side-offset="2"
        :collision-padding="8"
        @close-auto-focus.prevent
        @pointer-down-outside="emit('close')"
        @focus-outside="emit('close')"
        @interact-outside="emit('close')"
        @escape-key-down="emit('close')"
      >
        <template v-if="!entry || entry.is_dir">
          <DropdownMenuItem
            class="context-menu-item"
            @select="$emit('create', { ext: null, isDir: true })"
          >
            <IconFolderPlus :size="14" :stroke-width="1.5" />
            <span class="flex-1">{{ t('New Folder') }}</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="context-menu-item" @select="$emit('create', { ext: null })">
            <IconFilePlus :size="14" :stroke-width="1.5" />
            <span class="flex-1">{{ t('New File...') }}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="context-menu-separator" />
          <DropdownMenuItem
            v-for="template in documentTemplates"
            :key="template.id"
            class="context-menu-item"
            @select="
              $emit('create', {
                ext: template.ext,
                suggestedName: template.filename,
                initialContent: template.content,
              })
            "
          >
            <component
              :is="template.ext === '.tex' ? IconMath : IconFileText"
              :size="14"
              :stroke-width="1.5"
            />
            <span class="flex-1">{{ template.label }}</span>
            <span class="context-menu-ext">{{ template.ext }}</span>
          </DropdownMenuItem>
        </template>

        <template v-if="entry">
          <DropdownMenuSeparator v-if="entry.is_dir" class="context-menu-separator" />
          <DropdownMenuItem class="context-menu-item" @select="$emit('rename', entry)">
            <IconPencil :size="14" :stroke-width="1.5" />
            {{ t('Rename') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="context-menu-item" @select="$emit('duplicate', entry)">
            <IconCopy :size="14" :stroke-width="1.5" />
            {{ t('Duplicate') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            class="context-menu-item context-menu-item-danger"
            @select="$emit('delete', entry)"
          >
            <IconTrash :size="14" :stroke-width="1.5" />
            {{ t('Delete') }}
          </DropdownMenuItem>
        </template>

        <template v-if="selectedCount > 1">
          <DropdownMenuSeparator class="context-menu-separator" />
          <DropdownMenuItem
            class="context-menu-item context-menu-item-danger"
            @select="$emit('delete-selected')"
          >
            <IconTrash :size="14" :stroke-width="1.5" />
            {{ t('Delete {count} selected', { count: selectedCount }) }}
          </DropdownMenuItem>
        </template>

        <template v-if="entry">
          <DropdownMenuSeparator class="context-menu-separator" />
          <DropdownMenuItem class="context-menu-item" @select="$emit('reveal-in-finder', entry)">
            <IconExternalLink :size="14" :stroke-width="1.5" />
            {{ revealLabel }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup>
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
} from 'reka-ui'
import { computed, ref } from 'vue'
import {
  IconFileText,
  IconMath,
  IconFilePlus,
  IconFolderPlus,
  IconPencil,
  IconCopy,
  IconTrash,
  IconExternalLink,
} from '@tabler/icons-vue'
import { isMac } from '../../platform'
import { useI18n } from '../../i18n'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import { createPointReference } from '../../utils/floatingReference'

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
  'close',
  'create',
  'rename',
  'duplicate',
  'delete',
  'delete-selected',
  'reveal-in-finder',
])

const menuOpen = ref(true)
const menuReference = computed(() => createPointReference(props.x, props.y))

function handleOpenChange(open) {
  menuOpen.value = open
  if (!open) emit('close')
}
</script>

<style>
.context-menu-ext {
  font-size: 10.5px;
  color: color-mix(in srgb, var(--text-muted) 76%, transparent);
  opacity: 1;
  margin-left: auto;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}
</style>
