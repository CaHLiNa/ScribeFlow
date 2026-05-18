<template>
  <InlineDockFrame
    :aria-label="ariaLabel || t('Details')"
    :open="open"
    :width="width"
    :resizing="resizing"
    region-class="reference-workbench__detail-dock"
    resize-slot-class="reference-workbench__detail-resize-slot"
    resize-handle-class="reference-workbench__detail-resize-handle"
    :get-container-width="getContainerWidth"
    @motion-state-change="$emit('motion-state-change', $event)"
    @resize="$emit('resize', $event)"
    @resize-start="$emit('resize-start')"
    @resize-end="$emit('resize-end')"
    @resize-snap="$emit('resize-snap', $event)"
  >
    <section class="reference-workbench__detail-shell inline-dock" :aria-label="ariaLabel || t('Details')">
      <InlineDockTabBar
        :active-key="activeKey"
        :aria-label="ariaLabel || t('Details')"
        :pages="pages"
        tabbar-class="reference-workbench__detail-tabbar"
        tabs-class="reference-workbench__detail-tabs"
        @activate="$emit('activate-page', $event)"
        @close="$emit('close-page', $event)"
      />

      <div class="reference-workbench__detail-body inline-dock__body is-flush">
        <component
          :is="activePage?.component"
          v-if="activePage?.component"
          :class="activePage?.componentClass"
          v-bind="activePage?.componentProps || {}"
          v-on="activePage?.componentEvents || {}"
        />
        <div v-else class="reference-workbench__detail-empty inline-dock__empty">
          {{ t('No PDF attached') }}
        </div>
      </div>
    </section>
  </InlineDockFrame>
</template>

<script setup>
import { useI18n } from '../../i18n'
import InlineDockFrame from '../layout/InlineDockFrame.vue'
import InlineDockTabBar from '../layout/InlineDockTabBar.vue'

defineProps({
  activeKey: { type: String, default: '' },
  activePage: { type: Object, default: null },
  ariaLabel: { type: String, default: '' },
  getContainerWidth: { type: Function, default: null },
  open: { type: Boolean, default: false },
  pages: { type: Array, default: () => [] },
  resizing: { type: Boolean, default: false },
  width: { type: Number, default: 360 },
})

defineEmits([
  'activate-page',
  'close-page',
  'motion-state-change',
  'resize',
  'resize-start',
  'resize-end',
  'resize-snap',
])

const { t } = useI18n()
</script>

<style scoped>
.reference-workbench__detail-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.reference-workbench__detail-shell {
  --inline-dock-toolbar-height: 28px;
  --inline-dock-control-height: 24px;
  width: 100%;
}

:deep(.reference-workbench__detail-tabbar) {
  padding: 0 8px;
}

:deep(.reference-workbench__detail-tabs) {
  flex: 0 0 auto;
  gap: 4px;
}

:deep(.reference-workbench__detail-tab--icon) {
  flex: 0 0 26px;
  justify-content: center;
  width: 26px;
  min-width: 26px;
  max-width: 26px;
  height: 24px;
  padding: 0;
  border-radius: 5px;
}

:deep(.reference-workbench__detail-tab--icon .reference-workbench__detail-tab-label) {
  flex: 0 0 auto;
  justify-content: center;
  gap: 0;
}

:deep(.reference-workbench__detail-tab--details.inline-dock__tab:hover .reference-workbench__detail-tab-icon),
:deep(.reference-workbench__detail-tab--details.inline-dock__tab:focus-within .reference-workbench__detail-tab-icon) {
  opacity: 1;
  transform: none;
}

:deep(.reference-workbench__detail-tab--icon .reference-workbench__detail-tab-close) {
  left: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%) scale(0.94);
}

:deep(.reference-workbench__detail-tab--icon:hover .reference-workbench__detail-tab-close),
:deep(.reference-workbench__detail-tab--icon:focus-within .reference-workbench__detail-tab-close) {
  transform: translate(-50%, -50%) scale(1);
}

:deep(.reference-workbench__detail-tab--pdf:not(.is-active).inline-dock__tab:hover .reference-workbench__detail-tab-icon),
:deep(.reference-workbench__detail-tab--pdf:not(.is-active).inline-dock__tab:focus-within .reference-workbench__detail-tab-icon) {
  opacity: 1;
  transform: none;
}
</style>
