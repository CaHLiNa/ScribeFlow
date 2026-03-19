import { tool } from 'ai'
import { z } from 'zod'
import { t } from '../../i18n'
import { generateWorkspaceText, resolveTextAccess } from './textGeneration'

const GHOST_TIMEOUT_MS = 15000

async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(t('Ghost suggestion timed out'))), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function smartTruncate(text, maxLen, mode) {
  if (text.length <= maxLen) return text

  if (mode === 'start') {
    let trimmed = text.slice(-maxLen)
    const firstSpace = trimmed.indexOf(' ')
    if (firstSpace > 0 && firstSpace < 100) {
      trimmed = trimmed.slice(firstSpace + 1)
    }
    return '[…] ' + trimmed
  }

  let trimmed = text.slice(0, maxLen)
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > maxLen - 100 && lastSpace > 0) {
    trimmed = trimmed.slice(0, lastSpace)
  }
  return trimmed + ' […]'
}

export async function getGhostSuggestions(before, after, systemPrompt, workspace, instructions) {
  const access = await resolveTextAccess({ workspace, strategy: 'ghost' })
  if (access?._networkError) {
    return { suggestions: [], usage: null, networkError: true }
  }
  if (!access) {
    return { suggestions: [], usage: null, noAccess: true }
  }

  const safeBefore = smartTruncate(before, 5000, 'start')
  const safeAfter = smartTruncate(after, 1000, 'end')

  const userMessage = `<prefix>${safeBefore}</prefix><cursor/><suffix>${safeAfter || ''}</suffix>

Predict text at <cursor/> by calling suggest_completions.`

  const system = `You are an inline text completion engine for a research workspace called Altals. Your users are researchers. Predict 3 continuations at <cursor/>.

Rules:
- Match the author's voice, style, and register exactly
- Length: 1 word to 3 sentences depending on context. Vary lengths across suggestions
- If completing a partial word (prefix ends mid-word), finish that word first then optionally continue
- If prefix ends at a word boundary, start a new word or phrase
- Include necessary whitespace in each suggestion (leading space, newline, etc.)
- NEVER hallucinate facts. Use [placeholder] for unknowns: [citation], [value], [source], [year]
- Do NOT repeat or complete text from <suffix> — your text is INSERTED BETWEEN prefix and suffix
- For empty documents, suggest a natural starting point based on the filename or context
- Markdown formatting (headers, lists, bold) is fine when contextually appropriate

Call suggest_completions with prefix_end, suffix_start, and your predictions.${systemPrompt ? '\n\n' + systemPrompt : ''}${instructions ? '\n\nUser instructions:\n<_instructions.md>\n' + instructions + '\n</_instructions.md>' : ''}`

  let result
  let generationUsage = null
  let provider = access.providerHint || access.provider
  try {
    const generated = await withTimeout(generateWorkspaceText({
      workspace,
      access,
      feature: null,
      system,
      messages: [{ role: 'user', content: userMessage }],
      tools: {
        suggest_completions: tool({
          description: 'Insert predicted text at <cursor/> position',
          inputSchema: z.object({
            prefix_end: z.string().describe('Copy the last 20 characters from <prefix> verbatim'),
            suffix_start: z.string().describe('Copy the first 20 characters from <suffix> verbatim, or "EMPTY" if suffix is empty'),
            suggestions: z.array(z.string()).min(3).max(5).describe('Text completions to insert between prefix_end and suffix_start.'),
          }),
        }),
      },
      toolChoice: { type: 'tool', toolName: 'suggest_completions' },
      maxOutputTokens: 4096,
    }), GHOST_TIMEOUT_MS)
    generationUsage = generated?.usage || null
    provider = generated?.provider || provider
    result = generated?.result
    console.log('[ghost] generateText result:', { text: result?.text, finishReason: result?.finishReason, toolCalls: result?.toolCalls, usage: result?.usage })
  } catch (callErr) {
    console.error('[ghost] generateText error:', callErr)
    throw callErr
  }

  const meta = {
    usage: generationUsage,
    provider,
    billingProvider: access.provider,
    modelId: access.model,
  }

  const toolCall = result.toolCalls?.find(tc => tc.toolName === 'suggest_completions')
  const toolArgs = toolCall?.input ?? toolCall?.args
  if (toolArgs?.suggestions) {
    return { suggestions: toolArgs.suggestions, ...meta }
  }

  return { suggestions: [], ...meta }
}
