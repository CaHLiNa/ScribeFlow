import fs from 'fs';
let css = fs.readFileSync('src/components/panel/AiSessionRail.vue', 'utf8');

const targetStr = `  bottom: calc(100% + 10px);`;
const replacement = `  top: calc(100% + 8px);`;

css = css.replace(targetStr, replacement);
fs.writeFileSync('src/components/panel/AiSessionRail.vue', css);
