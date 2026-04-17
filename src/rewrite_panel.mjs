import { readFileSync, writeFileSync } from 'fs';

// 1. Remove the subnav completely from AiAgentPanel.vue, moving UiSelect to the composer.
let panelContent = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', 'utf-8');

// Remove the subnav header we added earlier
panelContent = panelContent.replace(
  /<header class="ai-agent-panel__subnav">[\s\S]*?<\/header>/,
  ''
);

// Add the provider select in the composer actions (bottom) next to the paperclip, remove trash
panelContent = panelContent.replace(
  /<div class="ai-agent-panel__composer-actions">/,
  `<div class="ai-agent-panel__composer-actions">
          <div class="ai-agent-panel__composer-tools">
            <UiButton
              variant="ghost"
              size="sm"
              icon-only
              @click="attachFiles"
              :title="t('Attach files')"
            >
              <IconPaperclip :size="16" :stroke-width="1.5" />
            </UiButton>
            <UiSelect
              :model-value="aiStore.providerState.currentProviderId"
              size="sm"
              class="ai-agent-panel__provider-select-inline"
              shell-class="ai-agent-panel__provider-shell"
              :options="providerOptions"
              @update:model-value="switchProvider"
            />
          </div>
          <div class="ai-agent-panel__composer-primary">`
);

// Close the wrapper divs we just added in composer-actions next to send button
panelContent = panelContent.replace(
  /(\s*<button\s*type="button"\s*class="ai-agent-panel__send-button"[\s\S]*?<\/button>\s*)<\/div>/,
  `$1</div>
        </div>`
);

// Re-adjust CSS to put these in a row
panelContent = panelContent.replace(
  /\.ai-agent-panel__composer-actions\s*\{[\s\S]*?\}/,
  `.ai-agent-panel__composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}

.ai-agent-panel__composer-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-agent-panel__composer-primary {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-agent-panel__provider-select-inline {
  width: auto;
  max-width: 140px;
}`
);

// Ensure select deep styles are back to target .ai-agent-panel__composer
panelContent = panelContent.replace(/\.ai-agent-panel__subnav \:deep/g, '.ai-agent-panel__composer :deep');

// Smooth input box
panelContent = panelContent.replace(
  /\.ai-agent-panel__textarea\s*\{[^}]*\}/,
  `.ai-agent-panel__textarea {
  padding: 0 !important;
  min-height: 24px;
  max-height: 400px;
}`
);

// We need to make the textarea fit organically
panelContent = panelContent.replace(
  /\.ai-agent-panel__composer-card\s*\{[\s\S]*?\}/,
  `.ai-agent-panel__composer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
  background: color-mix(in srgb, var(--surface-base) 60%, transparent);
}`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', panelContent);
