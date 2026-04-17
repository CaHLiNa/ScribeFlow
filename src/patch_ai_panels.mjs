import fs from 'fs';
import path from 'path';

const PANEL_DIR = './components/panel';

// 1. AiSessionRail.vue
const railPath = path.join(PANEL_DIR, 'AiSessionRail.vue');
let rail = fs.readFileSync(railPath, 'utf8');
rail = rail.replace(/variant="secondary"([\s\S]*?)class="ai-session-rail__create"/, 'variant="ghost"$1class="ai-session-rail__create"');
rail = rail.replace(/background: color-mix\(in srgb, var\(--surface-base\) 76%, transparent\);/, 'background: transparent;');
rail = rail.replace(/background: color-mix\(in srgb, var\(--accent\) 10%, var\(--surface-base\) 90%\);/, 'background: color-mix(in srgb, var(--surface-hover) 28%, transparent);');
fs.writeFileSync(railPath, rail);

// 2. AiAgentPanel.vue
const agentPath = path.join(PANEL_DIR, 'AiAgentPanel.vue');
let agent = fs.readFileSync(agentPath, 'utf8');
agent = agent.replace(/variant="secondary"([\s\S]*?)class="ai-agent-panel__clear-btn"/, 'variant="ghost"$1class="ai-agent-panel__clear-btn"');
agent = agent.replace(/variant="secondary"([\s\S]*?)@click="attachFiles"/, 'variant="ghost"$1@click="attachFiles"');
agent = agent.replace(/background: color-mix\(in srgb, var\(--surface-base\) 58%, transparent\);/, 'background: transparent;');
agent = agent.replace(/background: color-mix\(in srgb, var\(--surface-base\) 72%, transparent\);/, 'background: color-mix(in srgb, var(--surface-hover) 40%, transparent);');
agent = agent.replace(/background: color-mix\(in srgb, var\(--surface-base\) 90%, transparent\);/, 'background: transparent;');

agent = agent.replace(/border: 1px solid color-mix\(in srgb, var\(--button-primary-bg\) 80%, var\(--border-color\)\);\n *border-radius: 14px;\n *background: var\(--button-primary-bg\);\n *color: var\(--button-primary-text\);/, 
`border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: var(--text-primary);`);

agent = agent.replace(/background: var\(--button-primary-bg-hover\);/, 'background: color-mix(in srgb, var(--surface-hover) 50%, transparent);');
fs.writeFileSync(agentPath, agent);

// 3. AiConversationMessage.vue
const msgPath = path.join(PANEL_DIR, 'AiConversationMessage.vue');
let msg = fs.readFileSync(msgPath, 'utf8');
msg = msg.replace(/background: color-mix\(in srgb, var\(--surface-hover\) 80%, transparent\);/, 'background: transparent;');
msg = msg.replace(/background: color-mix\(in srgb, var\(--panel-muted\) 36%, transparent\);/g, 'background: color-mix(in srgb, var(--panel-muted) 10%, transparent);');
fs.writeFileSync(msgPath, msg);

console.log("Patched AI Panels successfully!");
