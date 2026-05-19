<template>
  <div class="starter-state-unopened">
    <!-- 1. 无限滑动的空间网格 -->
    <div class="ambient-pattern"></div>

    <div class="starter-content">

      <!-- 悬浮的 3D 毛玻璃文稿组合 -->
      <div class="hero-stage stagger-fade">

        <!-- 环境呼吸流光 -->
        <div class="ambient-glow glow-1"></div>
        <div class="ambient-glow glow-2"></div>
        <div class="ambient-glow glow-3"></div>

        <!-- 左侧：Markdown 草稿层 -->
        <div class="glass-sheet sheet-left">
          <div class="sheet-glass-edge"></div>
          <div class="sheet-glare"></div> <!-- 新增：表面扫光层 -->
          <div class="sheet-header">
            <div class="sheet-icon-wrap bg-warning-soft glow-warning">
              <IconMarkdown class="sheet-icon text-warning" :size="18" :stroke-width="1.8" />
            </div>
          </div>
          <div class="sheet-body">
            <div class="mock-h1"></div>
            <div class="mock-p" style="width: 90%;"></div>
            <div class="mock-p" style="width: 75%;"></div>
            <div class="mock-quote">
              <div class="mock-p" style="width: 85%;"></div>
              <div class="mock-p" style="width: 60%;"></div>
            </div>
          </div>
        </div>

        <!-- 右侧：LaTeX 公式层 -->
        <div class="glass-sheet sheet-right">
          <div class="sheet-glass-edge"></div>
          <div class="sheet-glare"></div>
          <div class="sheet-header">
            <div class="sheet-icon-wrap bg-info-soft glow-info">
              <IconMath class="sheet-icon text-info" :size="18" :stroke-width="1.8" />
            </div>
          </div>
          <div class="sheet-body align-center">
            <div class="mock-p" style="width: 60%; margin: 0 auto 8px;"></div>
            <div class="mock-math-block">
              <div class="mock-math-symbol"></div>
              <div class="mock-math-fraction">
                <div class="math-num"></div>
                <div class="math-div"></div>
                <div class="math-den"></div>
              </div>
            </div>
            <div class="mock-p" style="width: 50%; margin: 8px auto 0;"></div>
          </div>
        </div>

        <!-- 中央主层：Typst / 高级排版层 -->
        <div class="glass-sheet sheet-center">
          <div class="sheet-glass-edge"></div>
          <div class="sheet-glare"></div>
          <div class="sheet-header">
            <div class="sheet-icon-wrap bg-accent-soft glow-accent">
              <IconTypography class="sheet-icon text-accent" :size="22" :stroke-width="1.5" />
            </div>
          </div>
          <div class="sheet-body">
            <div class="mock-title"></div>
            <div class="mock-subtitle"></div>
            <div class="mock-columns">
              <div class="mock-col">
                <div class="mock-p"></div>
                <div class="mock-p" style="width: 80%;"></div>
                <div class="mock-p"></div>
                <div class="mock-p" style="width: 60%;"></div>
              </div>
              <div class="mock-col">
                <div class="mock-p" style="width: 90%;"></div>
                <div class="mock-p"></div>
                <div class="mock-box"></div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- 文字排版 -->
      <h1 class="brand-title stagger-fade">ScribeFlow</h1>
      <p class="brand-subtitle stagger-fade">
        {{ t('Open a local project folder to organize your research, references, and documents.') }}
      </p>

      <!-- 主要操作 -->
      <div class="starter-action stagger-fade">
        <UiButton variant="primary" size="lg" class="action-btn" @click="$emit('open-folder')">
          {{ t('Open Folder...') }}
        </UiButton>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import { IconMarkdown, IconMath, IconTypography } from '@tabler/icons-vue'

defineEmits(['open-folder'])

const { t } = useI18n()
</script>

<style scoped>
.starter-state-unopened {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
}

/* --- 高级质感：缓慢移动的无限网格 --- */
.ambient-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(color-mix(in srgb, var(--border-subtle) 90%, transparent) 1.5px, transparent 1.5px);
  background-size: 32px 32px;
  background-position: 0 0;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at center, black 0%, transparent 100%);
  mask-image: radial-gradient(ellipse 70% 60% at center, black 0%, transparent 100%);
  pointer-events: none;
  z-index: 0;
  /* 对角线平移，位移正好是一个单元格的尺寸，实现无缝循环 */
  animation: pan-grid 40s linear infinite;
}

@keyframes pan-grid {
  0% { background-position: 0px 0px; }
  100% { background-position: 32px 32px; }
}

.starter-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 600px;
  user-select: none;
}

/* --- 3D 舞台设定 --- */
.hero-stage {
  position: relative;
  width: 320px;
  height: 240px;
  margin-bottom: 36px;
  perspective: 1200px;
  transform-style: preserve-3d;
}

/* --- 流光氛围 --- */
.ambient-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  opacity: 0.12;
  mix-blend-mode: normal;
  animation: glow-breathe 8s infinite alternate ease-in-out;
  pointer-events: none;
  transform: translateZ(-80px);
}

.glow-1 { width: 180px; height: 180px; background: var(--info); top: 10px; left: 0px; animation-duration: 9s; }
.glow-2 { width: 160px; height: 160px; background: var(--warning); bottom: 20px; right: 0px; animation-duration: 11s; animation-delay: -3s; }
.glow-3 { width: 200px; height: 200px; background: var(--accent); top: 20px; left: 60px; opacity: 0.08; animation-duration: 14s; animation-delay: -5s; }

@keyframes glow-breathe {
  0% { transform: translateZ(-80px) scale(1) translate(0, 0); opacity: 0.08; }
  100% { transform: translateZ(-80px) scale(1.15) translate(15px, -15px); opacity: 0.16; }
}

/* --- 核心组件：毛玻璃纸张 --- */
.glass-sheet {
  position: absolute;
  display: flex;
  flex-direction: column;
  /* 带有微弱渐变的玻璃底色，模拟受光面 */
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--surface-base) 75%, transparent) 0%,
    color-mix(in srgb, var(--surface-base) 60%, transparent) 100%);
  border-radius: 14px;
  padding: 16px;
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.06);

  /* 减速动画，使用类苹果的柔和弹性曲线 */
  transition:
    transform 1.2s cubic-bezier(0.19, 1, 0.22, 1),
    box-shadow 1.2s cubic-bezier(0.19, 1, 0.22, 1),
    filter 1.2s ease;

  animation: float-sheet 6s infinite ease-in-out;
}

/* 玻璃折射高光边 */
.sheet-glass-edge {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(105deg,
    color-mix(in srgb, var(--border) 20%, transparent) 0%,
    transparent 30%,
    transparent 70%,
    color-mix(in srgb, var(--accent) 35%, transparent) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* 表面反光层 (Glare) */
.sheet-glare {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(105deg,
    transparent 20%,
    color-mix(in srgb, #ffffff 8%, transparent) 25%,
    transparent 30%);
  background-size: 200% 200%;
  background-position: 100% 100%;
  pointer-events: none;
  transition: background-position 1.2s cubic-bezier(0.19, 1, 0.22, 1);
}

/* 悬浮时，反光扫过表面 */
.hero-stage:hover .sheet-glare {
  background-position: 0% 0%;
}

/* 图标容器及自发光效果 */
.sheet-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  margin-bottom: 14px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); /* 内圈微高光 */
}
.bg-warning-soft { background: color-mix(in srgb, var(--warning) 12%, transparent); }
.bg-info-soft { background: color-mix(in srgb, var(--info) 12%, transparent); }
.bg-accent-soft { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.glow-warning { box-shadow: 0 4px 16px color-mix(in srgb, var(--warning) 15%, transparent); }
.glow-info { box-shadow: 0 4px 16px color-mix(in srgb, var(--info) 15%, transparent); }
.glow-accent { box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 15%, transparent); }

.text-warning { color: var(--warning); }
.text-info { color: var(--info); }
.text-accent { color: var(--text-primary); }

/* --- 骨架内容细节 --- */
.mock-h1 { width: 60%; height: 6px; background: var(--text-primary); border-radius: 3px; margin-bottom: 10px; opacity: 0.7; }
.mock-title { width: 70%; height: 8px; background: var(--text-primary); border-radius: 4px; margin: 0 auto 8px; opacity: 0.8; }
.mock-subtitle { width: 40%; height: 4px; background: var(--text-secondary); border-radius: 2px; margin: 0 auto 16px; opacity: 0.5; }
.mock-p { width: 100%; height: 4px; background: var(--text-secondary); border-radius: 2px; margin-bottom: 6px; opacity: 0.3; }
.mock-box { width: 100%; height: 24px; background: color-mix(in srgb, var(--text-muted) 15%, transparent); border-radius: 4px; margin-top: 6px; }

.mock-quote { border-left: 3px solid var(--text-muted); padding-left: 8px; margin-top: 8px; opacity: 0.6; }
.mock-columns { display: flex; gap: 8px; }
.mock-col { flex: 1; display: flex; flex-direction: column; }

.mock-math-block {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 12px 0; padding: 8px;
  background: color-mix(in srgb, var(--text-muted) 8%, transparent);
  border-radius: 6px;
}
.mock-math-symbol { width: 10px; height: 16px; border: 2px solid var(--text-secondary); border-right: none; border-radius: 4px 0 0 4px; opacity: 0.4; }
.mock-math-fraction { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.math-num { width: 16px; height: 3px; background: var(--text-secondary); border-radius: 1px; opacity: 0.5;}
.math-div { width: 24px; height: 2px; background: var(--text-primary); opacity: 0.7; }
.math-den { width: 12px; height: 3px; background: var(--text-secondary); border-radius: 1px; opacity: 0.5; }

/* --- 独立定位与动画顺序排期 (Staggering) --- */
.sheet-left {
  width: 120px; height: 140px; top: 50px; left: 15px;
  --base-trans: translateX(-30px) translateY(10px) translateZ(-30px) rotate(-8deg);
  transform: var(--base-trans);
  animation-delay: -1s;
  z-index: 1;
  transition-delay: 0.1s; /* 收回时，左边慢一点 */
}

.sheet-right {
  width: 110px; height: 130px; top: 40px; right: 15px;
  --base-trans: translateX(30px) translateY(15px) translateZ(-40px) rotate(12deg);
  transform: var(--base-trans);
  animation-delay: -3s;
  z-index: 1;
  transition-delay: 0.05s;
}

.sheet-center {
  width: 160px; height: 200px; top: 15px; left: 50%; margin-left: -80px;
  --base-trans: translateZ(10px) rotate(0deg);
  transform: var(--base-trans);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08), 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent);
  animation-delay: -5s;
  z-index: 2;
  transition-delay: 0s;
}

/* 惊艳的舞台 Hover：增加展开幅度与错落感 */
.hero-stage:hover .sheet-center {
  --base-trans: translateY(-16px) translateZ(80px) rotate(0deg);
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.2), 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
  transition-delay: 0s; /* 展开时，中间最先弹出来 */
}

.hero-stage:hover .sheet-left {
  --base-trans: translateX(-80px) translateY(0px) translateZ(-10px) rotate(-18deg);
  filter: blur(1.5px);
  transition-delay: 0.05s; /* 左边跟上 */
}

.hero-stage:hover .sheet-right {
  --base-trans: translateX(80px) translateY(5px) translateZ(-15px) rotate(20deg);
  filter: blur(1.5px);
  transition-delay: 0.1s; /* 右边最后展开 */
}

@keyframes float-sheet {
  0%, 100% { transform: var(--base-trans) translateY(0); }
  50% { transform: var(--base-trans) translateY(-6px); }
}

/* --- 文字与按钮 --- */
.brand-title {
  margin: 0 0 14px;
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, var(--text-primary) 30%, var(--text-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-subtitle {
  margin: 0 0 44px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.6;
  max-width: 440px;
}

/* 带有拟物高光的按钮 */
.action-btn {
  min-width: 180px;
  height: 44px;
  font-size: 15px;
  font-weight: 500;
  border-radius: 8px;
  box-shadow:
    0 4px 12px color-mix(in srgb, var(--text-primary) 12%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 24px color-mix(in srgb, var(--text-primary) 18%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.action-btn:active {
  transform: translateY(1px) scale(0.98);
}

/* --- 舒缓入场动画 --- */
@keyframes calm-fade-in {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.stagger-fade {
  opacity: 0;
  animation: calm-fade-in 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.hero-stage.stagger-fade { animation-delay: 0s; }
.brand-title.stagger-fade { animation-delay: 0.1s; }
.brand-subtitle.stagger-fade { animation-delay: 0.2s; }
.starter-action.stagger-fade { animation-delay: 0.3s; }

@media (max-width: 720px) {
  .hero-stage { transform: scale(0.85); margin-bottom: 24px; }
  .brand-title { font-size: 32px; }
  .brand-subtitle { font-size: 14px; margin-bottom: 36px; padding: 0 20px; }
}
</style>
