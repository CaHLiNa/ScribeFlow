import fs from 'fs';
let css = fs.readFileSync('src/components/panel/AiAgentPanel.vue', 'utf8');

const cssOld = `.ai-agent-panel__subnav {
  display: flex;
  align-items: center;
  padding: 8px 14px 4px;
}`;
const cssNew = `.ai-agent-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px 8px;
  background: transparent;
  z-index: 10;
}

` + cssOld;

css = css.replace(cssOld, cssNew);
fs.writeFileSync('src/components/panel/AiAgentPanel.vue', css);
