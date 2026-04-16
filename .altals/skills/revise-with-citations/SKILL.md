---
name: revise-with-citations
description: Revise the selected passage into tighter academic prose while staying grounded in the selected reference.
---

# Revise With Citations

Use the active document, the current editor selection, and the selected reference as grounding.

Requirements:
- Keep the core claim unless the evidence is too weak.
- Stay close to the selected source and do not invent citations.
- If the selected reference is not enough support, say so clearly in the rationale.

Return valid JSON only in this shape:

```json
{
  "replacement_text": "the revised paragraph only",
  "citation_suggestion": "where the citation should appear",
  "rationale": "why this revision is grounded in the supplied context"
}
```
