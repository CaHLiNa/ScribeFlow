<template>
  <div class="library-shell-sidebar">
    <div v-if="isViewsPanel" class="library-shell-sidebar-section">
      <div class="library-shell-sidebar-head is-simple">
        <div class="library-shell-sidebar-kicker">{{ t('Views') }}</div>
      </div>
      <div class="library-shell-sidebar-list is-views">
        <button
          v-for="view in sidebarViewOptions"
          :key="view.id"
          type="button"
          class="library-shell-sidebar-item"
          :class="{ 'is-active': activeView === view.id }"
          @click="activateView(view.id)"
        >
          <span class="truncate">{{ view.label }}</span>
          <span class="library-shell-sidebar-count">{{ view.count }}</span>
        </button>
      </div>
    </div>

    <div v-else class="library-shell-sidebar-section grow">
      <div class="library-shell-sidebar-head">
        <div class="library-shell-sidebar-kicker">{{ t('Tags') }}</div>
        <button
          v-if="selectedTags.length > 0"
          type="button"
          class="library-shell-sidebar-action"
          @click="clearSelectedTags()"
        >
          {{ t('Clear') }}
        </button>
      </div>

      <div v-if="tagFacets.length > 0" class="library-shell-sidebar-list is-tags">
        <button
          v-for="tag in tagFacets"
          :key="tag.tag"
          type="button"
          class="library-shell-sidebar-item is-tag"
          :class="{ 'is-active': selectedTags.includes(tag.tag) }"
          @click="toggleTag(tag.tag)"
        >
          <span class="truncate">{{ tag.tag }}</span>
          <span class="library-shell-sidebar-count">{{ tag.count }}</span>
        </button>
      </div>

      <div v-else class="library-shell-sidebar-empty">
        {{ t('No tags in this view') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { useLibraryWorkbenchUi } from '../../composables/useLibraryWorkbenchUi'

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
  padding: 10px 0 0;
}

.library-shell-sidebar-section.grow {
  flex: 1;
  padding-top: 12px;
}

.library-shell-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px 8px;
}

.library-shell-sidebar-head.is-simple {
  justify-content: flex-start;
}

.library-shell-sidebar-kicker {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  line-height: 1.3;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--fg-muted) 92%, var(--fg-primary));
}

.library-shell-sidebar-action {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--fg-muted);
  font-size: 0.72rem;
  line-height: 1.3;
  cursor: pointer;
}

.library-shell-sidebar-action:hover {
  color: var(--fg-primary);
}

.library-shell-sidebar-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding-bottom: 8px;
}

.library-shell-sidebar-list.is-views,
.library-shell-sidebar-list.is-tags {
  gap: 0;
}

.library-shell-sidebar-item {
  width: 100%;
  min-height: 28px;
  padding: 0 14px 0 16px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--fg-muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.84rem;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--border) 58%, transparent);
  transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
}

.library-shell-sidebar-item.is-tag {
  min-height: 24px;
  padding: 0 14px 0 18px;
  font-size: 0.77rem;
}

.library-shell-sidebar-list.is-views .library-shell-sidebar-item:first-child,
.library-shell-sidebar-list.is-tags .library-shell-sidebar-item:first-child {
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--border) 74%, transparent);
}

.library-shell-sidebar-item:hover {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  color: var(--fg-secondary);
}

.library-shell-sidebar-item.is-active {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  color: var(--fg-primary);
  box-shadow:
    inset 2px 0 0 color-mix(in srgb, var(--accent) 52%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--border) 58%, transparent);
}

.library-shell-sidebar-count {
  min-width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 0.7rem;
  line-height: 1.3;
  color: var(--fg-muted);
}

.library-shell-sidebar-empty {
  padding: 6px 16px;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--fg-muted);
}
</style>
