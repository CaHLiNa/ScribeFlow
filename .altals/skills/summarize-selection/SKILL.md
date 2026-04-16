---
name: summarize-selection
description: Turn the active selection into a structured research note.
---

# Summarize Selection

Use the selected passage as the primary source. If a reference is selected, use it to label the note more precisely.

Return valid JSON only in this shape:

```json
{
  "title": "short note title",
  "note_markdown": "# Heading\n\nstructured markdown note",
  "takeaway": "one sentence takeaway",
  "rationale": "why these are the key points"
}
```
