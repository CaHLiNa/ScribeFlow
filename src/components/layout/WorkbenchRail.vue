<template>
  <nav
    class="workbench-rail flex h-full w-11 shrink-0 flex-col items-center gap-1.5 border-r px-1.5 pt-1.5 pb-1.5"
    :aria-label="t('Project navigation')"
  >
    <div class="flex w-full flex-col items-center gap-1.5">
      <UiButton
        v-for="entry in entries"
        :key="entry.key"
        class="workbench-rail-button"
        variant="ghost"
        size="icon-sm"
        :active="activeKey === entry.key"
        :title="entry.title"
        :aria-label="entry.label"
        @click="activate(entry.key)"
      >
        <component :is="entry.icon" :size="18" :stroke-width="1.7" />
      </UiButton>
    </div>

    <div class="mt-auto flex w-full flex-col items-center">
      <UiButton
        class="workbench-rail-button"
        variant="ghost"
        size="icon-sm"
        :title="t('Settings ({shortcut})', { shortcut: `${modKey}+,` })"
        :aria-label="t('Settings')"
        @click="$emit('open-settings')"
      >
        <IconSettings :size="18" :stroke-width="1.7" />
      </UiButton>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { IconBook2, IconFileDescription, IconHome, IconSettings, IconSparkles } from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { modKey } from '../../platform'
import { useI18n } from '../../i18n'

defineEmits(['open-settings'])

const workspace = useWorkspaceStore()
const { t } = useI18n()

const entries = computed(() => [
  {
    key: 'workspace',
    label: t('Project'),
    title: t('Open project workspace'),
    icon: IconHome,
  },
  {
    key: 'conversion',
    label: t('Conversion'),
    title: t('Open document conversion workspace'),
    icon: IconFileDescription,
  },
  {
    key: 'library',
    label: t('Library'),
    title: t('Open global library'),
    icon: IconBook2,
  },
  {
    key: 'ai',
    label: t('AI'),
    title: t('Open AI workspace'),
    icon: IconSparkles,
  },
])

const activeKey = computed(() => {
  if (workspace.isAiSurface) return 'ai'
  if (workspace.isLibrarySurface) return 'library'
  if (workspace.isConversionSurface) return 'conversion'
  return 'workspace'
})

function activate(key) {
  if (!workspace.isOpen) return

  if (key === 'conversion') {
    workspace.openConversionSurface()
    return
  }
  if (key === 'library') {
    workspace.openLibrarySurface()
    return
  }
  if (key === 'ai') {
    workspace.openAiSurface()
    return
  }
  workspace.openWorkspaceSurface()
}
</script>

<style scoped>
.workbench-rail {
  background: var(--bg-primary);
  border-color: var(--border);
}

.workbench-rail-button {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  opacity: 0.88;
}

.workbench-rail-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 72%, transparent);
  color: var(--text-secondary);
  opacity: 1;
}

.workbench-rail-button.is-active {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  opacity: 1;
}

.workbench-rail-button.is-active::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  width: 2px;
  height: 14px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: color-mix(in srgb, var(--accent) 78%, white 12%);
}
</style>
