import fs from 'fs';
let css = fs.readFileSync('src/components/panel/AiSessionRail.vue', 'utf8');

// Fix menu container
css = css.replace(
`.ai-session-rail__menu {
  position: absolute;
  left: 0;
  min-width: 220px;
  width: max-content;
  top: calc(100% + 8px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--border-color) 50%, transparent);
  background: color-mix(in srgb, var(--panel-surface) 60%, transparent);
  box-shadow:
    0 18px 44px color-mix(in srgb, black 24%, transparent),
    inset 0 0 0 1px color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(24px) saturate(1.2);
}`,
`.ai-session-rail__menu {
  position: absolute;
  left: 0;
  min-width: 200px;
  width: max-content;
  top: calc(100% + 8px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--panel-surface) 40%, transparent);
  box-shadow:
    0 8px 32px color-mix(in srgb, black 12%, transparent);
  backdrop-filter: blur(32px) saturate(1.5);
}`
);

// Fix menu top bar gap
css = css.replace(
`.ai-session-rail__menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}`,
`.ai-session-rail__menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  gap: 12px;
}`
);

// Fix create button
css = css.replace(
`.ai-session-rail__menu-create {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border-color) 48%, transparent);
  background: color-mix(in srgb, var(--surface-base) 92%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}`,
`.ai-session-rail__menu-create {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
}
.ai-session-rail__menu-create:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}`
);

// Fix active item background and border
css = css.replace(
`.ai-session-rail__item.is-active {
  background: color-mix(in srgb, white 70%, var(--surface-raised) 30%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 60%, transparent);
}`,
`.ai-session-rail__item.is-active {
  background: var(--surface-active);
  border-color: transparent;
  box-shadow: none;
}`
);

css = css.replace(
`.ai-session-rail__item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}`,
`.ai-session-rail__item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  transition: all 160ms ease;
}`
);

fs.writeFileSync('src/components/panel/AiSessionRail.vue', css);
