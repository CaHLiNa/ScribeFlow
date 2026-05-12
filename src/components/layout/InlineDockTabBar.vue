<template>
  <header v-if="pages.length > 0" class="inline-dock__tabbar" :class="tabbarClass">
    <div class="inline-dock__tabs" :class="tabsClass" role="tablist" :aria-label="ariaLabel">
      <div
        v-for="page in pages"
        :key="page.key"
        class="inline-dock__tab"
        :class="[
          page.tabClass,
          {
            'is-active': page.key === activeKey,
            'has-close-action': canClosePage(page),
          },
        ]"
        role="tab"
        :aria-selected="page.key === activeKey"
        :aria-label="page.ariaLabel || page.title || page.label"
        tabindex="0"
        :title="page.title || page.label"
        @click="$emit('activate', page)"
        @keydown.enter.prevent="$emit('activate', page)"
        @keydown.space.prevent="$emit('activate', page)"
      >
        <div class="inline-dock__tab-label" :class="page.labelClass">
          <component
            :is="page.icon"
            v-if="page.icon"
            class="inline-dock__tab-icon"
            :class="page.iconClass"
            :size="page.iconSize || 15"
            :stroke-width="page.iconStrokeWidth || 1.8"
          />
          <span v-if="page.label">{{ page.label }}</span>
        </div>
        <button
          v-if="canClosePage(page)"
          type="button"
          class="inline-dock__tab-close"
          :class="page.closeClass"
          :title="page.closeTitle || closeLabel"
          :aria-label="page.closeAriaLabel || page.closeTitle || closeLabel"
          @click.stop="$emit('close', page)"
        >
          <IconX :size="12" :stroke-width="2" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { IconX } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  activeKey: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  pages: { type: Array, default: () => [] },
  tabbarClass: { type: [String, Array, Object], default: '' },
  tabsClass: { type: [String, Array, Object], default: '' },
})

defineEmits(['activate', 'close'])

const { t } = useI18n()
const closeLabel = t('Close')

function canClosePage(page = {}) {
  return page.closeable === true && (!page.closeWhenActiveOnly || page.key === props.activeKey)
}
</script>
