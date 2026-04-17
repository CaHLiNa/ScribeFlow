import { readFileSync, writeFileSync } from 'fs';

// 1. AiAgentPanel.vue: Flatten the composer card
let agentPanel = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', 'utf-8');
agentPanel = agentPanel.replace(
  /\.ai-agent-panel__composer-card\s*\{[\s\S]*?\}/,
  `.ai-agent-panel__composer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
  background: transparent;
}`
);
writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', agentPanel);

// 2. AiConversationMessage.vue: Remove the dark backgrounds entirely
let msgPanel = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiConversationMessage.vue', 'utf-8');
msgPanel = msgPanel.replace(
  /\.ai-conversation-message__surface--user\s*\{[\s\S]*?\}/,
  `.ai-conversation-message__surface--user {
  max-width: 92%;
  padding: 4px 6px;
  background: transparent;
  border: none;
}`
);
msgPanel = msgPanel.replace(
  /\.ai-conversation-message__surface--assistant\s*\{[\s\S]*?\}/,
  `.ai-conversation-message__surface--assistant {
  width: 100%;
  padding: 4px 6px;
  background: transparent;
  border: none;
}`
);
msgPanel = msgPanel.replace(
  /\.ai-conversation-message__surface\s*\{[\s\S]*?\}/,
  `.ai-conversation-message__surface {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}`
);

// Premove heavy box around notes and support details
msgPanel = msgPanel.replace(
  /\.ai-conversation-message__support\s*\{[\s\S]*?\}/,
  `.ai-conversation-message__support {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px;
  background: transparent;
  border-left: 2px solid color-mix(in srgb, var(--border-color) 60%, transparent);
}`
);
writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiConversationMessage.vue', msgPanel);

// 3. AiToolLine.vue: Make tools compact text without giant boxes
let toolContent = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiToolLine.vue', 'utf-8');
toolContent = toolContent.replace(
  /\.ai-tool-line\s*\{[\s\S]*?\}/,
  `.ai-tool-line {
  background: transparent;
  border: none;
  font-family: var(--font-mono);
}`
);
toolContent = toolContent.replace(
  /\.ai-tool-line__summary\s*\{[\s\S]*?\}/,
  `.ai-tool-line__summary {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 6px;
  list-style: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.8;
  transition: opacity 0.2s ease;
}
.ai-tool-line__summary:hover {
  opacity: 1;
}`
);
writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiToolLine.vue', toolContent);

