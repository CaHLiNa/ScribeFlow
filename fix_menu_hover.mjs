import fs from 'fs';
let css = fs.readFileSync('src/components/panel/AiSessionRail.vue', 'utf8');

css = css.replace(
`.ai-session-rail__item:hover,
.ai-session-rail__item.is-active {
  border-color: color-mix(in srgb, var(--accent) 20%, var(--border-color) 80%);
  background: color-mix(in srgb, var(--surface-hover) 22%, transparent);
}`,
`.ai-session-rail__item:hover,
.ai-session-rail__item.is-active {
  background: var(--surface-hover);
  border-color: transparent;
}`
);

fs.writeFileSync('src/components/panel/AiSessionRail.vue', css);
