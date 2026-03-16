export const DEFAULT_SELECTION_HIGHLIGHT_MAX_LENGTH = 200

export function shouldHighlightSelectionMatches({
  hasSelection,
  isSingleLine,
  selectedTextLength,
  maxLength = DEFAULT_SELECTION_HIGHLIGHT_MAX_LENGTH,
}) {
  if (!hasSelection) return false
  if (!isSingleLine) return false
  if (typeof selectedTextLength !== 'number' || selectedTextLength <= 0) return false
  if (maxLength !== 0 && selectedTextLength > maxLength) return false
  return true
}
