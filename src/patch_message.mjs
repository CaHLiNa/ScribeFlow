import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiConversationMessage.vue', 'utf-8');

// Replace assistant message background to be transparent and have no border box, just lay on the panel
content = content.replace(
  /\.ai-conversation-message__surface--assistant\s*\{[\s\S]*?\}/,
  `.ai-conversation-message__surface--assistant {
  width: 100%;
  padding: 4px 6px;
}`
);

// Replace user message to look like a subtle, nice generic bubble
content = content.replace(
  /\.ai-conversation-message__surface--user\s*\{[\s\S]*?\}/,
  `.ai-conversation-message__surface--user {
  max-width: 92%;
  padding: 10px 14px;
  border-radius: 18px;
  border-bottom-right-radius: 4px;
  background: color-mix(in srgb, var(--surface-hover) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 50%, transparent);
}`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiConversationMessage.vue', content);
