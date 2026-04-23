<!-- START OF FILE src/components/editor/WorkspaceStarter.vue -->
<template>
  <div class="workspace-starter" data-surface-context-guard="true">
    <div class="workspace-starter-shell">
      <!-- ==========================================
           State 1: 未打开文件夹 (App 空状态)
      =========================================== -->
      <div v-if="!hasWorkspace" class="starter-state-unopened">
        <!-- 环境光场 (Ambient Light System) -->
        <div class="ambient-field" aria-hidden="true">
          <div class="ambient-orb ambient-orb--1"></div>
          <div class="ambient-orb ambient-orb--2"></div>
          <div class="ambient-orb ambient-orb--3"></div>
        </div>

        <!-- 复合主视觉 (Hero Graphic) -->
        <div class="starter-hero-graphic stagger-1">
          <!-- 左侧浮游物: 文献/笔记暗示 -->
          <div class="floating-satellite satellite-left">
            <div class="satellite-card">
              <div class="satellite-line w-3/4"></div>
              <div class="satellite-line w-1/2"></div>
              <div class="satellite-line w-5/6"></div>
              <IconBook2 class="satellite-icon" :size="14" :stroke-width="1.5" />
            </div>
          </div>

          <!-- 中心底座: 项目核心 -->
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

          <!-- 右侧浮游物: 结构/代码暗示 -->
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
          <UiButton variant="primary" size="md" @click="openFolder">
            {{ t('Open Folder...') }}
          </UiButton>
        </div>
      </div>

      <!-- ==========================================
           State 2: 已打开文件夹，空标签页 (New Tab)
      =========================================== -->
      <div v-else class="starter-state-new-tab">
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
            @click="createTemplateDraft(template)"
          >
            <div class="starter-card-bg"></div>
            <div class="starter-card-inner">
              <div class="starter-card-icon-plate">
                <component
                  :is="template.ext === '.tex' ? IconMath : template.ext === '.py' ? IconBrandPython : IconFileText"
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
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  IconStack2,
  IconMath,
  IconFileText,
  IconBrandPython,
  IconMarkdown,
  IconBook2,
  IconLayoutSidebarRight,
} from '@tabler/icons-vue'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  paneId: { type: String, default: '' },
})

const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const hasWorkspace = computed(() => !!workspace.path)
const templates = computed(() => listWorkspaceDocumentTemplates(t))

async function createTemplateDraft(template) {
  if (!hasWorkspace.value) return
  if (props.paneId) editorStore.setActivePane(props.paneId)
  window.dispatchEvent(
    new CustomEvent('app:begin-new-file', {
      detail: {
        ext: template.ext,
        suggestedName: template.filename,
        initialContent: template.content,
      },
    })
  )
}

function openFolder() {
  window.dispatchEvent(new CustomEvent('app:open-folder'))
}
</script>

<style scoped>
.workspace-starter {
  display: flex;
  height: 100%;
  background: transparent;
  color: var(--text-primary);
  container-type: inline-size;
  overflow: hidden;
}

.workspace-starter-shell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  position: relative;
  z-index: 1;
}

/* =========================================================================
   进场动画：错步弹入 (Staggered Entrance)
========================================================================= */
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

/* =========================================================================
   全局布局状态
========================================================================= */
.starter-state-unopened,
.starter-state-new-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  z-index: 10;
}

.starter-state-unopened {
  width: min(100%, 460px); /* 给浮游元素留一点空间 */
}

.starter-state-new-tab {
  width: min(100%, 680px);
}

/* =========================================================================
   复合主视觉 (Hero Graphic & Satellites)
========================================================================= */
.starter-hero-graphic {
  position: relative;
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 140px; /* 给上下浮动留足空间 */
}

/* --- 中心底板与图标组 --- */
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

.theme-light .starter-hero-icon-plate {
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

.theme-light .hero-badge {
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.hero-badge--left {
  bottom: -6px;
  left: -10px;
  color: var(--info); /* Markdown 蓝 */
  transform: rotate(-10deg);
}

.hero-badge--right {
  top: -4px;
  right: -8px;
  color: var(--warning); /* LaTeX 黄 */
  transform: rotate(12deg);
}

.starter-hero-icon-plate:hover .hero-badge--left {
  transform: rotate(-15deg) scale(1.1) translateX(-2px);
}
.starter-hero-icon-plate:hover .hero-badge--right {
  transform: rotate(18deg) scale(1.1) translateX(2px);
}

/* --- 浮游卫星元素 (Floating Satellites) --- */
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
  transform: scale(0.9) perspective(500px) rotateY(15deg); /* 轻微的空间透视 */
  opacity: 0.8;
  transition:
    transform 0.4s ease,
    opacity 0.4s ease;
}

.theme-light .satellite-card {
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

/* =========================================================================
   环境光栅系统 (Ambient Light System)
========================================================================= */
.ambient-field {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 0;
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

.ambient-orb {
  position: absolute;
  border-radius: 50%;
  animation: ambient-drift 12s ease-in-out infinite alternate;
}

.theme-light .ambient-orb {
  opacity: 0.5;
  filter: blur(70px);
  animation-duration: 16s;
}

/* 左上：蓝色/青色 (科技感、Markdown) */
.ambient-orb--1 {
  width: 200px;
  height: 200px;
  top: 10%;
  left: 15%;
  background: color-mix(in srgb, var(--info) 80%, transparent);
  animation-delay: 0s;
}

/* 右下：琥珀色/粉色 (学术感、LaTeX) */
.ambient-orb--2 {
  width: 180px;
  height: 180px;
  bottom: 20%;
  right: 15%;
  background: color-mix(in srgb, var(--warning) 60%, transparent);
  animation-delay: -4s;
}

/* 中心：主强调色 (微亮) */
.ambient-orb--3 {
  width: 160px;
  height: 160px;
  top: 30%;
  left: 35%;
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  animation-delay: -8s;
}

/* =========================================================================
   排版文字
========================================================================= */
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

/* =========================================================================
   新标签页卡片 (New Tab Cards) - 采用高级 Hover 辉光效果
========================================================================= */
.starter-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  text-align: left;
}

.starter-card {
  position: relative;
  padding: 1px; /* 给内发光渐变留出1px边框位置 */
  border: none;
  border-radius: 16px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  outline: none;
  transform: translateZ(0); /* 开启硬件加速 */
}

/* 卡片的静态背板边框 */
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

/* Hover 时的流光渐变边框 */
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

/* 卡片内部背景板 */
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

.theme-light .starter-card-bg {
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
}

.starter-card:hover .starter-card-bg {
  background: var(--surface-hover);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--accent) 10%, transparent),
    0 8px 24px rgba(0, 0, 0, 0.1);
}

.theme-light .starter-card:hover .starter-card-bg {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 8px 24px rgba(0, 0, 0, 0.06);
}

.starter-card:active {
  transform: scale(0.98);
  transition: transform 0.1s;
}

/* 卡片内容区 */
.starter-card-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
}

/* 图标微动效 */
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
