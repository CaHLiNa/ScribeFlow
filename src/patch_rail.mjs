import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', 'utf-8');

// The big problem is the `.ai-session-rail__actions` rendering below the tab. Let's move delete inside the tab as an 'x'.
// 1. Remove the actions div entirely
content = content.replace(
  /\<div\s*v-if="editingSessionId !== session\.id[\s\S]*?<\/div>\s*<\/div>/,
  `</div>`
);

// 2. Add an 'x' icon/button inside .ai-session-rail__main for deleting (only when active and length > 1)
content = content.replace(
  /<span v-else-if="session\.hasError"[\s\S]*?<\/span>/,
  `$&
          <button
            v-if="session.id === currentSessionId && sessions.length > 1"
            class="ai-session-rail__close"
            type="button"
            :title="t('Delete session')"
            @click.stop="$emit('delete', session.id)"
          >
            ×
          </button>`
);

// CSS fixes
// Make the rail horizontal non-wrapping
content = content.replace(
  /\.ai-session-rail\s*\{[\s\S]*?\}/,
  `.ai-session-rail {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 28%, transparent);
  overflow: hidden;
}`
);

content = content.replace(
  /\.ai-session-rail__scroll\s*\{[\s\S]*?\}/,
  `.ai-session-rail__scroll {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none; /* Hide scrollbar for neatness */
}`
);

content = content.replace(
  /\.ai-session-rail__item\s*\{[\s\S]*?\}/,
  `.ai-session-rail__item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 0 0 auto; /* Don't grow to fill space randomly */
}`
);

// Remove max-width and make it look like a smooth pill
content = content.replace(
  /\.ai-session-rail__main,\s*\.ai-session-rail__editor\s*\{[\s\S]*?\}/,
  `.ai-session-rail__main,
.ai-session-rail__editor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 200px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
}`
);

// Close button CSS
content = content.replace(
  /<\/style>/,
  `
.ai-session-rail__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  margin-left: 2px;
}
.ai-session-rail__close:hover {
  background: color-mix(in srgb, var(--surface-hover) 80%, transparent);
  color: var(--text-primary);
}
.scrollbar-hidden::-webkit-scrollbar {
  display: none;
}
</style>`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', content);
