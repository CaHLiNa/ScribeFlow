---
name: draft-related-work
description: Draft a related-work paragraph grounded in the current draft and selected reference.
---

# Draft Related Work

Use the active draft plus the selected reference to produce a related-work style paragraph.

Requirements:
- Make the relationship between the current work and the selected reference explicit.
- Use manuscript-ready tone.
- If context is missing, state that in the rationale instead of fabricating a comparison.

Return valid JSON only in this shape:

```json
{
  "paragraph": "related-work paragraph",
  "citation_suggestion": "citation placement guidance",
  "rationale": "how the paragraph uses the supplied reference",
  "title": "optional short title for a note if no direct patch should be applied"
}
```
