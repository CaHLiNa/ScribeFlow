<template>
  <div class="starter-state-unopened">
    <div class="ambient-field" aria-hidden="true">
      <div class="ambient-orb ambient-orb--1"></div>
      <div class="ambient-orb ambient-orb--2"></div>
      <div class="ambient-orb ambient-orb--3"></div>
    </div>

    <div class="starter-hero-graphic stagger-1">
      <div class="floating-satellite satellite-left">
        <div class="satellite-card">
          <div class="satellite-line w-3/4"></div>
          <div class="satellite-line w-1/2"></div>
          <div class="satellite-line w-5/6"></div>
          <IconBook2 class="satellite-icon" :size="14" :stroke-width="1.5" />
        </div>
      </div>

      <div class="starter-hero-icon-plate">
        <div class="hero-icon-group">
          <IconStack2 :size="48" :stroke-width="1.2" class="hero-icon-main" />
          <div class="hero-badge hero-badge--left">
            <IconMarkdown :size="14" :stroke-width="2" />
          </div>
          <div class="hero-badge hero-badge--right">
            <IconMath :size="14" :stroke-width="2" />
          </div>
        </div>
      </div>

      <div class="floating-satellite satellite-right">
        <div class="satellite-card">
          <IconLayoutSidebarRight class="satellite-icon" :size="14" :stroke-width="1.5" />
          <div class="satellite-line w-full mt-1"></div>
          <div class="satellite-line w-2/3"></div>
        </div>
      </div>
    </div>

    <h1 class="starter-title stagger-2">{{ t('ScribeFlow Workspace') }}</h1>
    <p class="starter-subtitle stagger-3">
      {{
        t('Open a local project folder to organize your research, references, and documents.')
      }}
    </p>

    <div class="starter-primary-action stagger-4">
      <UiButton variant="primary" size="md" @click="$emit('open-folder')">
        {{ t('Open Folder...') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import {
  IconBook2,
  IconLayoutSidebarRight,
  IconMarkdown,
  IconMath,
  IconStack2,
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

defineEmits(['open-folder'])

const { t } = useI18n()
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

@keyframes float {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
  100% {
    transform: translateY(0px);
  }
}

@keyframes float-delayed {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(8px);
  }
  100% {
    transform: translateY(0px);
  }
}

@keyframes ambient-drift {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0.3;
    filter: blur(60px);
  }
  33% {
    transform: translate(20px, -20px) scale(1.1);
    opacity: 0.5;
    filter: blur(70px);
  }
  66% {
    transform: translate(-20px, 15px) scale(0.9);
    opacity: 0.4;
    filter: blur(50px);
  }
  100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.3;
    filter: blur(60px);
  }
}

.starter-state-unopened {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 460px);
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

.starter-hero-graphic {
  position: relative;
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 140px;
}

.starter-hero-icon-plate {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 104px;
  height: 104px;
  border-radius: 28px;
  background: color-mix(in srgb, var(--surface-raised) 70%, transparent);
  backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.2),
    0 4px 12px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1);
  color: var(--text-primary);
  position: relative;
  z-index: 5;
}

:global(.theme-light) .starter-hero-icon-plate {
  background: rgba(255, 255, 255, 0.9);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  border-color: rgba(0, 0, 0, 0.06);
}

.hero-icon-group {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-icon-main {
  color: var(--text-primary);
  opacity: 0.85;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
}

.hero-badge {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition:
    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.3s;
}

:global(.theme-light) .hero-badge {
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.hero-badge--left {
  bottom: -6px;
  left: -10px;
  color: var(--info);
  transform: rotate(-10deg);
}

.hero-badge--right {
  top: -4px;
  right: -8px;
  color: var(--warning);
  transform: rotate(12deg);
}

.starter-hero-icon-plate:hover .hero-badge--left {
  transform: rotate(-15deg) scale(1.1) translateX(-2px);
}
.starter-hero-icon-plate:hover .hero-badge--right {
  transform: rotate(18deg) scale(1.1) translateX(2px);
}

.floating-satellite {
  position: absolute;
  z-index: 3;
}

.satellite-left {
  left: 20%;
  top: 20px;
  animation: float 6s ease-in-out infinite;
}

.satellite-right {
  right: 18%;
  bottom: 10px;
  animation: float-delayed 7s ease-in-out infinite;
}

.satellite-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 64px;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-raised) 40%, transparent);
  backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  transform: scale(0.9) perspective(500px) rotateY(15deg);
  opacity: 0.8;
  transition:
    transform 0.4s ease,
    opacity 0.4s ease;
}

:global(.theme-light) .satellite-card {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(0, 0, 0, 0.05);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
}

.satellite-right .satellite-card {
  transform: scale(0.85) perspective(500px) rotateY(-15deg);
}

.starter-hero-graphic:hover .satellite-card {
  opacity: 1;
  transform: scale(1) perspective(500px) rotateY(0deg);
}

.satellite-icon {
  color: var(--accent);
  opacity: 0.6;
  margin-bottom: 2px;
}

.satellite-line {
  height: 3px;
  border-radius: 2px;
  background: var(--text-muted);
  opacity: 0.3;
}

.ambient-field {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 0;
}

.ambient-orb {
  position: absolute;
  border-radius: 50%;
  animation: ambient-drift 12s ease-in-out infinite alternate;
}

:global(.theme-light) .ambient-orb {
  opacity: 0.5;
  filter: blur(70px);
  animation-duration: 16s;
}

.ambient-orb--1 {
  width: 200px;
  height: 200px;
  top: 10%;
  left: 15%;
  background: color-mix(in srgb, var(--info) 80%, transparent);
  animation-delay: 0s;
}

.ambient-orb--2 {
  width: 180px;
  height: 180px;
  bottom: 20%;
  right: 15%;
  background: color-mix(in srgb, var(--warning) 60%, transparent);
  animation-delay: -4s;
}

.ambient-orb--3 {
  width: 160px;
  height: 160px;
  top: 30%;
  left: 35%;
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  animation-delay: -8s;
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

.starter-primary-action {
  min-width: 160px;
}

.starter-primary-action :deep(.ui-button) {
  min-height: 40px;
  font-size: 14px;
  border-radius: 8px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 20%, transparent);
}
</style>
