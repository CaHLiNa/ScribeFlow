import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', 'utf-8');

// Add the ref and the wheel handler to the scroll div
content = content.replace(
  /<div class="ai-session-rail__scroll scrollbar-hidden">/,
  `<div 
      ref="scrollContainerRef" 
      class="ai-session-rail__scroll scrollbar-hidden"
      @wheel.prevent="handleWheelScroll"
    >`
);

// Add the JS logic
if (!content.includes('scrollContainerRef')) {
  // Add right after const { t } = useI18n()
  content = content.replace(
    /const \{ t \} = useI18n\(\)\n/,
    `const { t } = useI18n()
const scrollContainerRef = ref(null)

function handleWheelScroll(e) {
  if (!scrollContainerRef.value) return
  // If moving mostly vertically, translate to horizontal scroll
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    scrollContainerRef.value.scrollLeft += e.deltaY * 0.8
  } else {
    // If user is actually swiping horizontally on trackpad, let it act naturally
    scrollContainerRef.value.scrollLeft += e.deltaX
  }
}
`
  );
}

// Adjust some CSS to make sure items are clickable and smooth
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
  overflow-y: hidden;
  scrollbar-width: none;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}`
);

// We need to remove the @wheel.prevent if we are translating, otherwise it stops natural horizontal swipe on trackpad 
// actually better not to use .prevent in template, let's remove .prevent
content = content.replace('@wheel.prevent="handleWheelScroll"', '@wheel="handleWheelScroll"');

// Wait we must conditionally e.preventDefault() in JS
content = content.replace(
  /function handleWheelScroll\(e\) \{[\s\S]*?\}\n/,
  `function handleWheelScroll(e) {
  if (!scrollContainerRef.value) return
  const isVertical = Math.abs(e.deltaY) > Math.abs(e.deltaX)
  if (isVertical && e.deltaY !== 0) {
    e.preventDefault()
    scrollContainerRef.value.scrollLeft += e.deltaY * 0.8
  }
}
`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', content);
