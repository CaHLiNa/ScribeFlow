import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', 'utf-8');

// I might have missed injecting the function logic if regex didn't match. Add it properly.
if (!content.includes('function handleWheelScroll')) {
  content = content.replace(
    /const \{ t \} = useI18n\(\)/,
    `const { t } = useI18n()

const scrollContainerRef = ref(null)

function handleWheelScroll(e) {
  if (!scrollContainerRef.value) return
  const isVertical = Math.abs(e.deltaY) > Math.abs(e.deltaX)
  if (isVertical && e.deltaY !== 0) {
    e.preventDefault()
    scrollContainerRef.value.scrollBy({ left: e.deltaY > 0 ? 50 : -50, behavior: 'smooth' })
  }
}`
  );
}

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiSessionRail.vue', content);
