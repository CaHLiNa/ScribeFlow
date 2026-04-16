---
name: find-supporting-references
description: Diagnose what supporting evidence or citation types are missing from the selected passage.
---

# Find Supporting References

Use the selected passage to reason about evidence gaps.

Requirements:
- Focus on missing support, not generic topic keywords.
- If the current selected reference is enough, say that directly.
- Suggest the type of literature that should be added.

Return valid JSON only in this shape:

```json
{
  "answer": "diagnosis of what support is missing",
  "rationale": "what in the passage created this diagnosis",
  "title": "optional short label"
}
```
