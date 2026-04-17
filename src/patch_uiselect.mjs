import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', 'utf-8');

// The UiSelect CSS rule refers to `.ai-agent-panel__composer`. But we moved it to `.ai-agent-panel__subnav`.
content = content.replace(/\.ai-agent-panel__composer\s*:deep/g, '.ai-agent-panel__subnav :deep');

// Also remove heavy padding from the composer.
content = content.replace(
  /\.ai-agent-panel__composer-actions\s*\{[\s\S]*?\}/,
  `.ai-agent-panel__composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', content);
