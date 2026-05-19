<template>
  <div class="starter-state-new-tab">
    <h2 class="starter-title stagger-1">{{ t('Create Document') }}</h2>
    <p class="starter-subtitle stagger-2">
      {{ t('Choose a format to start writing in the current workspace.') }}
    </p>

    <div class="starter-grid">
      <button
        v-for="(template, index) in templates"
        :key="template.id"
        class="starter-card hover-glow"
        :class="`stagger-${index + 3}`"
        @click="$emit('create-template', template)"
      >
        <div class="starter-card-bg"></div>
        <div class="starter-card-inner">
          <div class="starter-card-icon-plate">
            <component
              :is="iconForTemplate(template)"
              :size="24"
              :stroke-width="1.5"
              class="card-icon"
            />
          </div>
          <div class="starter-card-content">
            <div class="starter-card-header">
              <span class="starter-card-label">{{ template.label }}</span>
              <span class="starter-card-meta">{{ template.ext }}</span>
            </div>
            <div class="starter-card-desc">{{ template.description }}</div>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconBrandPython, IconFileText, IconMath } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'

defineEmits(['create-template'])

defineProps({
  templates: { type: Array, default: () => [] },
})

const { t } = useI18n()

function iconForTemplate(template) {
  if (template?.ext === '.tex') return IconMath
  if (template?.ext === '.py') return IconBrandPython
  return IconFileText
}
</script>

<style scoped>
@keyframes slide-up-fade {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.starter-state-new-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 680px);
  text-align: center;
  position: relative;
  z-index: 10;
}

.stagger-1 {
  animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
}
.stagger-2 {
  animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
}
.stagger-3 {
  animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
}
.stagger-4 {
  animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
}
.stagger-5 {
  animation: slide-up-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both;
}

.starter-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px;
  letter-spacing: -0.02em;
}

.starter-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 36px;
  line-height: 1.6;
  max-width: 400px;
}

.starter-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  text-align: left;
}

.starter-card {
  position: relative;
  padding: 1px;
  border: none;
  border-radius: 16px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  outline: none;
  transform: translateZ(0);
}

.starter-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    180deg,
    var(--border-subtle),
    color-mix(in srgb, var(--border-subtle) 20%, transparent)
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.starter-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 80%, transparent),
    color-mix(in srgb, var(--accent) 10%, transparent)
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.starter-card:hover::after,
.starter-card:focus-visible::after {
  opacity: 1;
}

.starter-card-bg {
  position: absolute;
  inset: 1px;
  border-radius: 15px;
  background: var(--surface-base);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  transition:
    background 0.3s ease,
    box-shadow 0.3s ease;
  z-index: 0;
}

:global(.theme-light) .starter-card-bg {
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
}

.starter-card:hover .starter-card-bg {
  background: var(--surface-hover);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--accent) 10%, transparent),
    0 8px 24px rgba(0, 0, 0, 0.1);
}

:global(.theme-light) .starter-card:hover .starter-card-bg {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 8px 24px rgba(0, 0, 0, 0.06);
}

.starter-card:active {
  transform: scale(0.98);
  transition: transform 0.1s;
}

.starter-card-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
}

.starter-card-icon-plate {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  transition: all 0.3s ease;
}

.card-icon {
  transition:
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.3s ease;
}

.starter-card:hover .starter-card-icon-plate {
  background: var(--surface-base);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 10%, transparent);
}

.starter-card:hover .card-icon {
  color: var(--text-primary);
  transform: scale(1.1) translateY(-1px);
}

.starter-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-top: 2px;
}

.starter-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.starter-card-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.starter-card-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-raised);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
  transition:
    border-color 0.3s ease,
    color 0.3s ease;
}

.starter-card:hover .starter-card-meta {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--text-secondary);
}

.starter-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  transition: color 0.3s ease;
}

.starter-card:hover .starter-card-desc {
  color: var(--text-primary);
}

@container (max-width: 600px) {
  .starter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
