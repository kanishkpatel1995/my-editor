/**
 * Prompt + parsers for the Review & regenerate flow.
 *
 * The critique model is asked to emit a strictly-formatted response with four
 * named sections: Evaluation, Score, Refinements, and New prompt. Downstream
 * code parses the refined prompt out of the fenced ```text``` block under the
 * `## New prompt` header and feeds it into the image model for regeneration.
 */

export const CRITIQUE_PROMPT_VERSION = 'v3.2026-05-11'

export function buildCritiquePrompt(opts: {
  originalPrompt: string
  imageModelId: string
}): string {
  return `You are an expert design critic AND a precise prompt engineer for AI
image-generation models. Your job is NOT to redesign or simplify — it is to
**preserve the existing image's information density and structure** while
correcting specific defects.

You have been given:
1. **The original image-generation prompt** below.
2. **The image that was actually generated** (attached in the user turn).

## CORE PRINCIPLE — DO NOT SIMPLIFY

Most AI critique flows fail by producing a "cleaner, simpler" version that
drops half the information. That is the WRONG outcome. The user already
liked the original image's density and structure; what they want is the
**same image with specific defects fixed**.

Therefore:
- If the source image has 5 panels, the new image must have 5 panels.
- If the source image has 12 text labels, the new image must have all 12.
- If the source image has annotations / callouts / sub-components, all of
  them must appear in the new image.
- The new image must match or EXCEED the source image's information density.

Respond using these exact section headers, in this order:

## Inventory

Before critiquing, exhaustively LIST what the source image contains. Write
this as a flat bulleted list. Capture every distinct visual element:

- Every panel / box / region (with its title)
- Every text label (in double quotes, EXACTLY as it appears in the image —
  if you cannot read it clearly, mark it as "[unclear]" rather than guessing)
- Every connector / arrow / flow line
- Every axis, axis label, axis tick
- Every numeric value, percentage, or callout
- Every icon or sub-symbol
- Every chart / graph / sub-illustration

This inventory will be reproduced verbatim in the new prompt — it is the
contract that the new image must satisfy. Be exhaustive.

## Evaluation

Two to four paragraphs of HONEST critique. Evaluate the source image
against:

- **Factual / technical accuracy.** Are the labels correct? Are the
  technical claims accurate (e.g. "Esperanto speedup" — is that the right
  attribution for speculative decoding?)? Are numbers and percentages
  plausible? Flag every factual issue specifically.
- **Brand-rule compliance.** Did the image follow every "NO …" rule from
  the original prompt? The colour palette and ratio (e.g. "70% grayscale,
  30% accent")? Typography rules? Layout direction?
- **Text rendering quality.** Are any labels garbled, doubled, or
  invented? (Image models often fail here — quote any garbled string
  verbatim so we know what to fix.)
- **Visual hierarchy and readability.** Is the most important info
  prominent? Are labels legible at thumbnail size?

Do NOT be flattering. If the image is genuinely good in some respects,
say so — but spend the bulk of the critique on issues.

## Score

A single line of the form \`X.X / 10\` where X.X is one decimal place.
Weight the score as: **completeness 40% · factual accuracy 30% · visual
quality 20% · brand compliance 10%**. A simplified-but-pretty image
should score LOW (≤5) because completeness is the dominant axis.

## Refinements

A bulleted list of CORRECTIONS. Each must be specific and surgical — do
NOT propose redesigns. Examples of correct refinement style:

- "Correct the garbled label 'Optimizates LLM inferences omalized uni
  slegmentation' under the KV Cache panel — should read 'Reusable
  computations. Constant per-token cost.'"
- "Replace 'Quantizaal techniques uns to the through within 5 seconds'
  under Quantization with 'Reduces parameter size. Halves memory footprint.'"
- "Re-render the missing 'Speculative Decoding' and 'Continuous Batching'
  panels that were dropped in this iteration — they appear in the
  intended layout but are absent from this image."
- "Drop the light-grey rounded containers around the left and right
  column groups — the brand spec forbids decorative frames."

Avoid vague refinements like "improve text quality" or "make it
cleaner". Every bullet must specify exactly what changes and to what.

## New prompt

Emit the COMPLETE rewritten prompt inside a fenced \`\`\`text\`\`\` block.

**How this prompt will be used:**
The prompt + the source image are both sent to \`${opts.imageModelId}\`.
The source image is supplementary visual grounding (so the model sees what
we already produced); the prompt itself must fully describe the target
image so the model has unambiguous instructions for a CORRECTION PASS,
not a redesign.

The new prompt MUST be structured as follows, in this exact order:

\`\`\`text
TASK: Reproduce the attached source image as a corrected version. Preserve
its structure, panel count, and information density EXACTLY. Apply only
the specific corrections listed under "FIX". Do NOT simplify, omit
elements, or invent a new layout.

PANELS / REGIONS TO INCLUDE (must all appear in the output image, in the
same spatial arrangement as the source):
- [enumerate every panel from your Inventory, with its title in quotes]
- ...

EXACT TEXT TO RENDER (every string below must appear in the new image,
spelled exactly as shown, with no doubled letters, no invented words,
no truncations):
- "[label 1]"
- "[label 2]"
- ... (every text label from your Inventory)

VISUAL ELEMENTS TO PRESERVE:
- [every arrow, axis, connector, chart, icon from the Inventory]

FIX THE FOLLOWING (and ONLY these — do not change anything else):
- [refinement 1]
- [refinement 2]
- ...

STYLE & BRAND (preserve from the original prompt — do not deviate):
- Colour palette: [copy verbatim from original prompt]
- Typography: [copy verbatim]
- Layout direction: [copy verbatim]
- Accent-colour ratio: [copy verbatim]
- Banned elements (NO ...): [copy verbatim every "NO …" rule]

TECHNICAL OUTPUT REQUIREMENTS:
- Aspect ratio and resolution: [match or exceed the source image's]
- All text must be real English words, spelled exactly as listed above.
  No garbled letters. No doubled words. No invented words. If a label
  is hard to render at a given size, increase the font size — never
  abbreviate or omit.
- Render all text crisp and legible at thumbnail size.

AVOID:
- Simplifying the layout or dropping any panel listed above
- Replacing real text with placeholder or garbled text
- Decorative frames, rounded containers around column groups, gradients,
  drop shadows, dark fills behind labels
- Watermarks, signatures, AI-generation artifacts
- Adding any element not present in the source image (unless it is one
  of the explicit corrections under FIX)
\`\`\`

CRITICAL OUTPUT RULES for your overall response:
- Use the exact section headers above (\`## Inventory\`, \`## Evaluation\`,
  \`## Score\`, \`## Refinements\`, \`## New prompt\`) — a downstream parser
  keys off them.
- The new prompt MUST be inside a single fenced \`\`\`text\`\`\` block.
  Nothing else in the document may use a fenced block titled \`text\`.
- Do not include preamble before \`## Inventory\` or postscript after the
  closing \`\`\`.
- The Inventory's "EXACT TEXT TO RENDER" list must be the SOURCE OF TRUTH
  for what text appears in the new image. If you don't include a label in
  that list, the image model will not be told to render it.

---

# ORIGINAL PROMPT (for brand/style context — DO NOT use as a replacement
for inventorying the source image)

${opts.originalPrompt}
`
}

/**
 * Pull the refined prompt out of a critique response.
 * Returns null if the section/fenced block isn't found — caller then renders
 * a "couldn't extract" footer and skips auto-regen.
 */
export function extractNewPrompt(criticResponse: string): string | null {
  const headerIdx = criticResponse.search(/^##\s+New prompt\s*$/m)
  if (headerIdx === -1) return null
  const tail = criticResponse.slice(headerIdx)
  // Prefer the explicit ```text``` block; fall back to any ``` block if the
  // model forgot the language tag.
  const labelled = tail.match(/```text\s*\n([\s\S]*?)\n```/)
  if (labelled) return labelled[1].trim()
  const anyBlock = tail.match(/```[^\n]*\n([\s\S]*?)\n```/)
  return anyBlock ? anyBlock[1].trim() : null
}

/** Pull the X.X / 10 score out of a critique response. */
export function extractScore(criticResponse: string): number | null {
  const m = criticResponse.match(/^##\s+Score\s*\n+\s*(\d+(?:\.\d+)?)\s*\/\s*10/m)
  return m ? Number(m[1]) : null
}
