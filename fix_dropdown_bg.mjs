import fs from 'fs';
let css = fs.readFileSync('src/components/panel/AiSessionRail.vue', 'utf8');

const targetMenuCss = `  background: color-mix(in srgb, var(--panel-surface) 92%, white 8%);
  box-shadow:
    0 18px 44px color-mix(in srgb, black 16%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 58%, transparent);
  backdrop-filter: blur(18px) saturate(1.06);`;

const newMenuCss = `  background: color-mix(in srgb, var(--panel-surface) 60%, transparent);
  box-shadow:
    0 18px 44px color-mix(in srgb, black 24%, transparent),
    inset 0 0 0 1px color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(24px) saturate(1.2);`;

css = css.replace(targetMenuCss, newMenuCss);
fs.writeFileSync('src/components/panel/AiSessionRail.vue', css);
