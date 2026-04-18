import fs from 'fs';
let css = fs.readFileSync('src/components/panel/AiSessionRail.vue', 'utf8');

css = css.replace(
`.ai-session-rail__main,
.ai-session-rail__editor {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
}`,
`.ai-session-rail__main,
.ai-session-rail__editor {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
}`
);

fs.writeFileSync('src/components/panel/AiSessionRail.vue', css);
