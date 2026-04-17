import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/settings/SettingsAi.vue', 'utf-8');

// replace all globalSuccess assignments
content = content.replace(/globalSuccess\.value = (.*)/g, 'toastStore.show($1)');

// replace all globalError assignments
content = content.replace(/globalError\.value = (.*)/g, 'toastStore.show($1, { type: \'error\' })');

// remove empty assignments
content = content.replace(/toastStore\.show\(''\)/g, '');

// remove the template blocks
content = content.replace(/<div v-if="globalError"[\s\S]*?<\/div>\s*<\/div>/, '</div>');

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/settings/SettingsAi.vue', content);
