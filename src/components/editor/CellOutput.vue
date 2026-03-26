<template>
  <div class="cell-output" v-if="outputs && outputs.length > 0">
    <div v-for="(output, i) in outputs" :key="i" class="output-item">
      <!-- stream (stdout/stderr) -->
      <pre
        v-if="output.output_type === 'stream'"
        class="output-stream"
        :class="output.name === 'stderr' ? 'output-stderr' : 'output-stdout'"
        v-html="ansiToHtml(joinText(output.text))"
      ></pre>

      <!-- display_data / execute_result -->
      <template
        v-else-if="output.output_type === 'display_data' || output.output_type === 'execute_result'"
      >
        <!-- HTML output -->
        <div
          v-if="hasData(output, 'text/html')"
          class="output-html"
          v-html="DOMPurify.sanitize(joinText(output.data['text/html']))"
        ></div>
        <!-- PNG image -->
        <img
          v-else-if="hasData(output, 'image/png')"
          :src="'data:image/png;base64,' + joinText(output.data['image/png']).trim()"
          class="output-image"
        />
        <!-- SVG image -->
        <div
          v-else-if="hasData(output, 'image/svg+xml')"
          class="output-svg"
          v-html="DOMPurify.sanitize(joinText(output.data['image/svg+xml']))"
        ></div>
        <!-- JPEG image -->
        <img
          v-else-if="hasData(output, 'image/jpeg')"
          :src="'data:image/jpeg;base64,' + joinText(output.data['image/jpeg']).trim()"
          class="output-image"
        />
        <!-- LaTeX (rendered as text for now) -->
        <pre v-else-if="hasData(output, 'text/latex')" class="output-stream output-stdout">{{
          joinText(output.data['text/latex'])
        }}</pre>
        <!-- Plain text fallback -->
        <pre v-else-if="hasData(output, 'text/plain')" class="output-stream output-stdout">{{
          joinText(output.data['text/plain'])
        }}</pre>
      </template>

      <!-- error -->
      <pre
        v-else-if="output.output_type === 'error'"
        class="output-error"
        v-html="formatError(output)"
      ></pre>
    </div>
  </div>
</template>

<script setup>
import DOMPurify from 'dompurify'
import { ansiToHtml, escapeHtml } from '../../domains/editor/cellOutputAnsiRuntime'

defineProps({
  outputs: { type: Array, default: () => [] },
})

function joinText(val) {
  if (!val) return ''
  return Array.isArray(val) ? val.join('') : String(val)
}

function hasData(output, mimeType) {
  return output.data && output.data[mimeType] != null
}

function formatError(output) {
  if (output.traceback && output.traceback.length > 0) {
    return ansiToHtml(output.traceback.join('\n'))
  }
  const name = output.ename || 'Error'
  const value = output.evalue || ''
  return `<span class="error-name">${escapeHtml(name)}</span>: ${escapeHtml(value)}`
}
</script>

<style scoped>
.cell-output {
  --output-ansi-fg-30: #545454;
  --output-ansi-fg-31: #ff5555;
  --output-ansi-fg-32: #50fa7b;
  --output-ansi-fg-33: #f1fa8c;
  --output-ansi-fg-34: #bd93f9;
  --output-ansi-fg-35: #ff79c6;
  --output-ansi-fg-36: #8be9fd;
  --output-ansi-fg-37: #f8f8f2;
  --output-ansi-fg-90: #6272a4;
  --output-ansi-fg-91: #ff6e6e;
  --output-ansi-fg-92: #69ff94;
  --output-ansi-fg-93: #ffffa5;
  --output-ansi-fg-94: #d6acff;
  --output-ansi-fg-95: #ff92df;
  --output-ansi-fg-96: #a4ffff;
  --output-ansi-fg-97: #ffffff;
  border-top: 1px solid var(--border);
  padding: 6px 0 2px 0;
  font-size: var(--ui-font-body);
  overflow-x: auto;
}

.output-item + .output-item {
  margin-top: 4px;
}

.output-stream {
  margin: 0;
  padding: 4px 8px;
  font-family: var(--font-mono, 'SF Mono', 'Menlo', monospace);
  font-size: var(--ui-font-label);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--fg-primary);
}

.output-stderr {
  color: var(--error, #ff5555);
  background: color-mix(in srgb, var(--error, #ff5555) 8%, transparent);
}

.output-error {
  margin: 0;
  padding: 6px 8px;
  font-family: var(--font-mono, 'SF Mono', 'Menlo', monospace);
  font-size: var(--ui-font-label);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  background: color-mix(in srgb, var(--error, #ff5555) 10%, transparent);
  border-left: 3px solid var(--error, #ff5555);
  color: var(--fg-primary);
}

.output-error :deep(.error-name) {
  color: var(--error, #ff5555);
  font-weight: bold;
}

.output-html {
  padding: 4px 8px;
  overflow-x: auto;
  color: var(--fg-primary);
}

.output-html :deep(table) {
  border-collapse: collapse;
  font-size: var(--ui-font-label);
}

.output-html :deep(th),
.output-html :deep(td) {
  border: 1px solid var(--border);
  padding: 3px 8px;
  text-align: left;
}

.output-html :deep(th) {
  background: var(--bg-secondary);
  font-weight: 600;
}

.output-image {
  max-width: 100%;
  height: auto;
  padding: 4px 8px;
  background: white;
  border-radius: 4px;
}

.output-svg {
  padding: 4px 8px;
  overflow-x: auto;
}

.output-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

.cell-output :deep(.output-ansi-bold) {
  font-weight: bold;
}

.cell-output :deep(.output-ansi-italic) {
  font-style: italic;
}

.cell-output :deep(.output-ansi-underline) {
  text-decoration: underline;
}

.cell-output :deep(.output-ansi-fg-30) {
  color: var(--output-ansi-fg-30);
}

.cell-output :deep(.output-ansi-fg-31) {
  color: var(--output-ansi-fg-31);
}

.cell-output :deep(.output-ansi-fg-32) {
  color: var(--output-ansi-fg-32);
}

.cell-output :deep(.output-ansi-fg-33) {
  color: var(--output-ansi-fg-33);
}

.cell-output :deep(.output-ansi-fg-34) {
  color: var(--output-ansi-fg-34);
}

.cell-output :deep(.output-ansi-fg-35) {
  color: var(--output-ansi-fg-35);
}

.cell-output :deep(.output-ansi-fg-36) {
  color: var(--output-ansi-fg-36);
}

.cell-output :deep(.output-ansi-fg-37) {
  color: var(--output-ansi-fg-37);
}

.cell-output :deep(.output-ansi-fg-90) {
  color: var(--output-ansi-fg-90);
}

.cell-output :deep(.output-ansi-fg-91) {
  color: var(--output-ansi-fg-91);
}

.cell-output :deep(.output-ansi-fg-92) {
  color: var(--output-ansi-fg-92);
}

.cell-output :deep(.output-ansi-fg-93) {
  color: var(--output-ansi-fg-93);
}

.cell-output :deep(.output-ansi-fg-94) {
  color: var(--output-ansi-fg-94);
}

.cell-output :deep(.output-ansi-fg-95) {
  color: var(--output-ansi-fg-95);
}

.cell-output :deep(.output-ansi-fg-96) {
  color: var(--output-ansi-fg-96);
}

.cell-output :deep(.output-ansi-fg-97) {
  color: var(--output-ansi-fg-97);
}
</style>
