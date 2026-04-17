import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', 'utf-8');

// The composer card looks too separate because of surface-flyout. Let's make it more seamless.
content = content.replace(
  /\.ai-agent-panel__composer-card\s*\{[\s\S]*?\}/,
  `.ai-agent-panel__composer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
  background: color-mix(in srgb, var(--surface-base) 90%, transparent);
}`
);

// We need to make sure subnav doesn't look like a completely independent island. 
content = content.replace(
  /\.ai-agent-panel__subnav\s*\{[\s\S]*?\}/,
  `.ai-agent-panel__subnav {
  display: flex;
  align-items: center;
  padding: 8px 14px 4px;
}`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', content);
