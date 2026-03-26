<template>
  <div class="library-shell-sidebar">
    <div v-if="isViewsPanel" class="library-shell-sidebar-section">
      <div class="library-shell-sidebar-list is-views">
        <UiButton
          v-for="view in sidebarViewOptions"
          :key="view.id"
          type="button"
          variant="ghost"
          size="sm"
          content-mode="raw"
          :active="activeView === view.id"
          class="library-shell-sidebar-item"
          @click="activateView(view.id)"
        >
          <span class="truncate">{{ view.label }}</span>
          <span class="library-shell-sidebar-count">{{ view.count }}</span>
        </UiButton>
      </div>
    </div>

    <div v-else class="library-shell-sidebar-section grow">
      <div v-if="tagFacets.length > 0" class="library-shell-sidebar-list is-tags">
        <UiButton
          v-for="tag in tagFacets"
          :key="tag.tag"
          type="button"
          variant="ghost"
          size="sm"
          content-mode="raw"
          :active="selectedTags.includes(tag.tag)"
          class="library-shell-sidebar-item is-tag"
          @click="toggleTag(tag.tag)"
        >
          <span class="truncate">{{ tag.tag }}</span>
          <span class="library-shell-sidebar-count">{{ tag.count }}</span>
        </UiButton>
      </div>

      <div v-else class="library-shell-sidebar-empty">
        {{ t('No tags in this view') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { useLibraryWorkbenchUi } from '../../composables/useLibraryWorkbenchUi'
import UiButton from '../shared/ui/UiButton.vue'

const emit = defineEmits(['tag-selection-change'])

const workspace = useWorkspaceStore()
const { t } = useI18n()
const {
  activeView,
  selectedTags,
  sidebarViewOptions,
  tagFacets,
  activateView,
  clearSelectedTags,
  toggleTag,
} = useLibraryWorkbenchUi()

const isViewsPanel = computed(() => workspace.leftSidebarPanel === 'library-views')

watch(
  () => selectedTags.value.length,
  (count) => emit('tag-selection-change', count),
  { immediate: true }
)

defineExpose({
  clearSelectedTags,
})
</script>

<style scoped>
.library-shell-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: color-mix(in srgb, var(--bg-primary) 94%, var(--bg-primary));
}

.library-shell-sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  padding: 8px 0 0;
}

.library-shell-sidebar-section.grow {
  flex: 1;
  padding-top: 10px;
}

.library-shell-sidebar-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  gap: 2px;
  padding: 0 8px 8px;
}

.library-shell-sidebar-list.is-views,
.library-shell-sidebar-list.is-tags {
  gap: 2px;
}

.library-shell-sidebar-item {
  width: 100%;
  min-height: var(--sidebar-row-height);
  padding: 0 8px 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: var(--sidebar-font-item);
  line-height: 1.32;
  text-align: left;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    box-shadow 120ms ease;
}

.library-shell-sidebar-item.is-tag {
  min-height: var(--sidebar-row-height-tight);
  padding: 0 8px 0 12px;
  font-size: var(--sidebar-font-item);
}

.library-shell-sidebar-item:hover {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  color: var(--fg-secondary);
}

.library-shell-sidebar-item.is-active {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  color: var(--fg-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent);
}

.library-shell-sidebar-count {
  min-width: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  font-size: var(--sidebar-font-meta);
  line-height: 1.3;
  color: var(--fg-muted);
}

.library-shell-sidebar-item.is-active .library-shell-sidebar-count {
  color: var(--accent);
}

.library-shell-sidebar-empty {
  padding: 4px 14px 0;
  font-size: var(--sidebar-font-body);
  line-height: 1.6;
  color: var(--fg-muted);
}
</style>
