import { readFileSync, writeFileSync } from 'fs';
let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', 'utf-8');

// Insert the 'x' close span inside the main tab button
content = content.replace(
  /(\s*)<\/button>\s*<\/div>\s*<\/div>/,
  `$1  <span
$1    v-if="session.id === currentSessionId && sessions.length > 1"
$1    class="ai-session-rail__close"
$1    :title="t('Delete session')"
$1    @click.stop="$emit('delete', session.id)"
$1  >
$1    ×
$1  </span>
$1</button>
      </div>
    </div>`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', content);
