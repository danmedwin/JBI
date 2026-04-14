# Siddur OCR Project — Complete Report (Updated 2026-04-14)

## Overview

This project consists of two tools for converting printed Jewish prayer books (siddurim/mahzorim) into accessible, large-print Word documents:

1. **SiddurOCRApp.jsx** — A React artifact that runs inside Claude's interface. It takes a PDF of siddur pages, sends each page image to Claude's vision API for OCR and layout analysis, then assembles the extracted text into a formatted Word document (.docx).

2. **siddur_page_numberer.py** — A Python post-processing script (currently v14) that takes the Word document output from the artifact and adds accurate page numbers. Since a single source page often spans 2–3 Word pages (due to the larger font), the script renders the document via LibreOffice to determine actual page breaks, then inserts lettered page numbers (e.g., "42a", "42b") so users can navigate back to the original book.

---

## Part 1: The React Artifact (SiddurOCRApp.jsx)

### What It Does

The user uploads a PDF of siddur pages. The app:

1. Converts each PDF page to an image (PNG, scale 2.0x)
2. Auto-detects the siddur layout from the first page image
3. Sends each page image to Claude Sonnet for OCR analysis
4. Parses the returned XML into structured elements
5. Applies layout-specific post-processing
6. Builds a formatted Word document with named paragraph styles
7. Collects footnotes and appends them grouped by source page

### Supported Layouts

The app supports two specific siddur layouts plus a generic fallback:

#### 1. Mishkan T'filah (CCAR Press / Reform Movement)

**Physical layout:**
- Hebrew liturgy RIGHT-ALIGNED on the right side of each page
- Transliteration LEFT-ALIGNED on the left side, running in parallel with Hebrew
- English translation/reading appears BELOW the parallel columns
- Section headers are CENTERED and in ALL CAPS
- Instructions are italicized and centered
- Page numbers in lower corners, formatted like "2 [120]" (book page [absolute page])
- Footnotes below a horizontal rule
- Margin navigation words in Hebrew on outer margins

**Element types extracted:**
- `navigation` — Hebrew margin words (skipped in output)
- `header` — Running header at top (skipped in output)
- `page_number` — e.g., "2 [120]"
- `section_header` — Centered ALL CAPS text
- `hebrew_liturgy` — Hebrew with all nikkud (vowel marks)
- `transliteration` — Phonetic English rendering
- `translation` — English meaning, with `<i>...</i>` for italic portions
- `instructions` — Italicized directions
- `footnote` — Text below horizontal rules

**MT-specific formatting rules:**
- **ALL CAPS normalization:** When transliteration or translation starts with ALL CAPS words (common in MT), only the first 3 words stay uppercase; the rest are converted to sentence case. Example: "BARUCH ATAH ADONAI ELOHEINU MELECH" → "BARUCH ATAH ADONAI eloheinu melech"
- **Chatimah handling:** A chatimah (closing blessing formula like "BARUCH ATAH ADONAI...") appearing as Hebrew + transliteration after an English section gets the same caps treatment
- **Spacing:** There is extra vertical space between transliteration and translation paragraphs
- **Page numbers:** Rendered in black (not gray)
- **ALL CAPS normalization is MT-only.** The `normalizeLeadingCaps` function is gated behind a `useCapsNorm` flag set only for `mishkan_tfilah` layout. KH text passes through unmodified.

#### 2. Kol Haneshamah (Reconstructionist Press)

**Physical layout:**
- Running header at top formatted "SECTION NAME / PAGE_NUMBER" (e.g., "MEDITATIONS / 9") or "PAGE_NUMBER / SECTION NAME" (e.g., "128 / MEDITATIONS")
- Hebrew text in blocks, sometimes two columns that must be merged
- Some prayers have a Hebrew prayer name as the first line in a slightly larger font (e.g., אֱלֹהַי נְצוֹר, וַיְכֻלּוּ, מֵעֵין שֶׁבַע)
- Transliteration below/near Hebrew
- English translation/reading text — often multiple distinct readings per page separated by whitespace
- Author attributions in smaller italic text, right-aligned or centered
- Responsive readings with "Reader:" and "Congregation:" labels in italics
- Divine names rendered in SMALL CAPS (THE ETERNAL ONE, etc.)
- Bottom of page: even pages show prayer/section name; odd pages show service name
- Footnotes below horizontal rule (includes COMMENTARY, NOTE, KAVANAH, DERASH sections)
- Decorative graphics/illustrations on some pages (e.g., Kiddush cup)
- Arrows (curved or straight) that should be skipped

**Element types extracted:**
- `page_number` — Just the number (extracted from running header or bottom)
- `section_header` — Section name from running header (name part only, no number). Also compound prayer titles with slashes like "KIDDUSH LEYL ROSH HASHANAH / KIDDUSH FOR ROSH HASHANAH EVE"
- `hebrew_header` — Hebrew prayer name appearing as the first line in a slightly larger font. Bold, same font size as body.
- `bottom_section_name` — Identifying text at bottom of even pages (prayer/section name)
- `bottom_service_name` — Identifying text at bottom of odd pages (service name)
- `hebrew_liturgy` — Hebrew blocks with all nikkud
- `transliteration` — Phonetic English (Latin diacritics stripped for KH)
- `translation` — English with `<i>...</i>` for italics. Each visually separated passage on a page is a separate element.
- `attribution` — Author/source credit, right-aligned, italic, smaller font. Placed immediately after the reading it credits.
- `instructions` — Italicized directions
- `footnote` — ALL text below horizontal rules, including COMMENTARY, NOTE, KAVANAH, DERASH

**KH-specific post-processing (`postProcessKolHaneshamah`):**

1. **Compound header splitting:** Running headers like "MEDITATIONS / 9" (name/number) or "128 / MEDITATIONS" (number/name) are split. Uses Unicode-aware slash matching (regular, fraction, division, fullwidth slashes). Page number goes to `page_number` element; name becomes `section_header`.

2. **`cleanHeaderText` helper:** Strips "NUMBER + any-separator" prefix or "any-separator + NUMBER" suffix from header text using `\W+` (any non-word character) as separator. Applied to section_headers during fallback cleanup AND during bottom label promotion. Also used by `normalizeHeader` for deduplication matching.

3. **Running header deduplication:** Only the FIRST `section_header` on each page (the running header) participates in global deduplication. Subsequent section_headers on the same page (content sub-headers like "TRADITIONAL VERSION", "ALTERNATIVE VERSION") are always kept.

4. **Bottom label promotion:** `bottom_section_name` and `bottom_service_name` are cleaned with `cleanHeaderText`, then deduplicated against the global `seenHeaders` set. Only the first unique occurrence is promoted to a `section_header` at the top of the page.

5. **Latin diacritics:** Stripped from transliteration text (macrons, dots, etc.)

6. **Arrow stripping:** Unicode arrow characters stripped from all element text during parsing.

**KH-specific prompt features:**

- **Reading separation:** The prompt emphasizes visual-block-based separation as the #1 priority. Each visually separate text block on a page must be its own translation element. Includes WRONG vs RIGHT examples.
- **Attribution placement:** Attributions go IMMEDIATELY after the reading they credit. The `reorderElements` function treats `attribution` as a buffer-flush boundary (NOT in `LITURGICAL_TYPES`) so it preserves the AI's placement.
- **Responsive readings:** "Reader:" and "Congregation:" labels are wrapped in `<i>` tags, but the prayer text after them stays regular (not italic).
- **Divine names in small caps:** Rendered as ALL CAPS in output, never italic or mixed case.
- **Footnote boundary:** Any text below a horizontal rule is a footnote, including COMMENTARY, NOTE, KAVANAH, DERASH sections.
- **Decorative images:** Ignored; text below them is still extracted.
- **Compound prayer titles:** Titles with slashes like "KIDDUSH LEYL ROSH HASHANAH / KIDDUSH FOR ROSH HASHANAH EVE" are kept intact — the slash is part of the title, not a page number separator.
- **Self-check:** An 8-point self-check runs before the AI returns results, verifying attribution count/placement, reading separation, prose combination, footnote boundaries, divine name formatting, responsive reading labels, and nikkud.

#### 3. Other / Unknown

Generic fallback with standard element types. No layout-specific post-processing.

### Word Document Output Format

**Font:** Tahoma throughout
**Default font size:** 22pt (user-adjustable from 10–48pt)
**Page:** Letter size (8.5" × 11"), 1" margins all around

**Named paragraph styles (important for the page numberer):**
- `PageNumber` (or `PageNumber1` in some KH docs) — Centered, spacing before 400, after 200
- `SectionHeader` — Centered, bold, spacing before 480, after 200
- `HebrewHeader` — Right-aligned, bold, RTL, spacing before 360, after 200
- `Instructions` — Left-aligned, italic, smaller font (fontSize - 1)
- `HebrewLiturgy` — Right-aligned, right-to-left
- `Transliteration` — Left-aligned, spacing after 240
- `Translation` — Left-aligned, spacing before 240, after 120
- `Attribution` — Right-aligned, italic, smaller font (fontSize - 1), spacing before 120, after 360

**Instructions formatting:**
- Left-aligned (NOT centered)
- When instructions contain `<i>` tags, the italic/non-italic mix is preserved
- When instructions have no `<i>` tags, the entire paragraph is italic

**Indentation handling:**
- Lines marked with `>>` prefix by the AI are rendered with 0.5" (720 twip) left indentation
- Each indented line becomes a separate paragraph
- `>>` should be used very sparingly — only for structurally indented text, not column line wrapping

**Reading separation spacing:**
- When a `translation` element follows an `attribution` element, a spacer paragraph is inserted to visually separate the new reading
- When a `hebrew_liturgy` or `hebrew_header` follows a `translation` or `attribution`, a spacer paragraph is also inserted
- These spacers create clear visual breaks between distinct readings

**Element ordering in output:**
- Section headers first
- Content follows: hebrew_header → hebrew_liturgy → transliteration → translation → attribution (enforced by `reorderElements`; attribution is a flush boundary, not reordered)
- Navigation and headers are skipped (not included in document)
- Page number appears at the bottom of each source page's content
- Footnotes collected at the end, grouped by source page

**Page numbers:** Rendered in black text (matching all other content)

### Processing Features

- **Layout auto-detection:** Tries up to 3 pages to identify the siddur layout (page 1 is often a title page or section divider with no identifiable content). Stops as soon as a known layout is identified with confidence; falls back to "other" only after all attempts fail. The status text updates to show which page is being tried. If detection succeeds on a later page, the reasoning note indicates which page was used.
- **Retry logic:** Up to 3 attempts per page for API errors, rate limits, content filters
- **Content filter safe mode:** When a page hits the content filter after standard retries, a "safe mode" retry appends instructions to skip sensitive content and mark omissions with `[content omitted due to filtering]`. If safe mode also fails, the page is skipped with full error detail.
- **Skipped pages:** Pages that fail after retries are marked as skipped with detailed reason (including full API error message for content filter blocks). The results summary shows per-page skip reasons.
- **Token usage tracking:** Displays estimated and actual API costs (Claude Sonnet: $3/MTok input, $15/MTok output)
- **Processing notes:** User can add custom instructions that get appended to the AI prompt
- **Page range selection:** User can specify which PDF pages to process
- **Auto-start timer:** When status becomes "ready", a 30-second countdown begins. Processing starts automatically when the timer reaches 0. The user can click "Begin Processing" at any time to start immediately, or click "Don't auto-start" to cancel the timer and wait.
- **Dynamic version timestamp:** Computed at load time using the user's local timezone (via `Intl.DateTimeFormat`, falling back to ISO format).

### How to Use

1. The `.jsx` file runs as a Claude artifact — upload it to a Claude conversation and ask Claude to render it
2. Upload a PDF of siddur pages
3. Select or confirm the detected layout
4. Adjust font size if needed (default 22pt)
5. Click Process (or wait 30 seconds for auto-start) — keep the browser/app active throughout
6. Download the generated .docx file

---

## Part 2: The Page Numberer Script (siddur_page_numberer.py)

### What It Does

The OCR artifact produces a Word document where each source siddur page's content is separated by page breaks. But since the output uses a larger font, one source page often fills 2–3 Word pages. The page numberer:

1. Finds all page number markers in the document (by paragraph style)
2. Renders the document to PDF via LibreOffice to determine actual page breaks
3. Maps each source page marker to the rendered Word page(s) it spans
4. For source pages spanning multiple Word pages: adds lettered suffixes (42a, 42b, 42c)
5. Inserts intermediate page number markers at smart break points
6. Repositions existing markers when needed
7. Splits long paragraphs at sentence boundaries when necessary
8. Runs a cleanup pass to consolidate empty pages and label missing overflows

### Requirements

- Python 3 with `python-docx`, `pypdf`, `lxml`
- LibreOffice (for headless PDF rendering)
- `pdftotext` from Poppler (for fast text extraction)

### Usage

```
python3 siddur_page_numberer.py input_processed.docx --output output_numbered.docx
```

If `--output` is omitted, it adds a `_numbered` suffix to the input filename.

### Processing Pipeline

The script runs seven steps:

**Step 1 — Analyze document:** Find all page number markers (paragraphs with "Page Number" style). Auto-detect the exact style ID (e.g., `PageNumber` vs `PageNumber1`).

**Step 2 — Render with LibreOffice:** Convert .docx → PDF via LibreOffice headless. Extract text with `pdftotext -layout` (fallback to pypdf). Strip Unicode bidirectional control characters.

**Step 3 — Map source pages to Word pages:** Search for each marker's text in the PDF pages sequentially forward (critical for handling duplicate page numbers). Pass 1: exact line match. Pass 2: word-boundary regex, filtering out false matches inside "Page X skipped" messages. Sanity cap: no single source page spans more than 8 Word pages. Empty rendered pages are filtered out to prevent phantom labels.

**Step 4 — Compute labels:** For source pages spanning multiple Word pages, generate lettered suffixes (42a, 42b, 42c).

**Step 5 — Update and reposition markers:** Update existing markers with computed labels. Reposition markers that ended up in suboptimal positions, but only when a structurally meaningful break point is found (section headers, new readings, attributions) — not for default fallbacks.

**Step 6 — Insert overflow markers:** For overflow pages, find smart break points and insert new page number markers. Split paragraphs at sentence boundaries when necessary.

**Step 7 — Cleanup pass (v14):** Three tidy-up rules applied after all numbering is complete (see v14 section below).

### Key Algorithms

#### Smart Break Points (`find_best_insert_point`)

Rules in priority order:

1. **Section headers** always push to the next page — break before them regardless of position. Scans backward past attributions for cleaner breaks.
2. **New readings** (starting with ALL CAPS, excluding section headers) in the bottom two-thirds go to next page. Scans backward past consecutive new readings.
3. **Hebrew → Transliteration boundary:** Splits transliteration to keep the opening portion with preceding Hebrew. Strategy: blank-line split first, then 40% midpoint, then fallback to inserting before the transliteration.
4. **Hebrew after non-Hebrew:** Style transitions at Hebrew boundaries.
5. **Attribution lines** in the bottom two-thirds (with trailing instruction notes) mark natural reading boundaries — break after them.
6. **Full-page attribution scan:** Falls back to scanning the entire page for any attribution.
7. **Natural paragraph breaks:** Period-ending paragraphs in the lower two-thirds.
8. **Default:** Second-to-last paragraph (respects keep-with-above on last paragraph).
9. **Single-paragraph pages:** Split the paragraph at 75% bias.
10. **Long remainders:** If only 1 long paragraph (>200 chars) would remain after the break, it gets split.

Returns a 3-tuple `(para_index, split_flag, structural)`. The `structural` flag is `True` for pass-based breaks (headers, readings, attributions, style transitions) and `False` for default fallbacks.

#### Post-insertion adjustments

- `adjust_for_short_title`: Don't break after a short title-like paragraph (<60 chars) — keep it with the next paragraph of the same style.
- `adjust_insert_for_grouping`: Don't strand section headers (push to next page) or separate attributions/instruction notes from their readings.

#### Attribution Detection (`is_attribution`)

Style-based detection first (most reliable). Text heuristics only for unstyled or generic paragraphs:
- Short lines (<80 chars) starting with a capitalized name (e.g., "Sidney Greenberg (Adapted)")
- Scripture citations (Psalms, Isaiah, Genesis, Talmud, etc.)

#### Instruction Note Detection (`is_instruction_note`)

Recognizes navigation/cross-reference lines:
- "On Shabbat continue on page 132."
- "Additional meditations may be found on pages 1-20."
- "Concluding prayers begin on page 1195."

#### Keep-with-above Grouping (`is_keep_with_above`)

Returns `True` for attributions and instruction notes. Used throughout to prevent separating these from the content they belong with.

#### Paragraph Splitting

Three modes:
- **Blank-line split (`split_paragraph_at_blank_line`):** For transliterations with `\n\n` paragraph structure. Splits at the first blank line.
- **Midpoint split (`split_paragraph_at_midpoint`):** Finds sentence boundaries (periods, then commas/semicolons, then word boundaries) nearest the target percentage. Default target: 65%. Solo pages: 75%.
- **Last-period split (`split_paragraph_at_last_period`):** Splits at the LAST period to maximize content staying with preceding Hebrew. Tries earlier periods when the last gives an empty second half.

#### Hebrew Text Matching

Two normalization layers for matching Word paragraphs to rendered PDF text:
- `_strip_bidi()` removes Unicode bidirectional control characters (RTL/LTR marks that pdftotext inserts).
- `_strip_marks()` strips all Unicode combining marks (category M*) — Hebrew vowels, cantillation, diacritics. Used as a fallback when primary matching fails. Normalizes both `וַיְכֻלּוּ` (docx) and `ַוְיֻכּלּו` (pdftotext) to the same consonant skeleton.

### Output

- All inserted markers get the document's page number paragraph style applied
- All page numbers are in black
- Each inserted marker includes a page break after it
- The document validates against OOXML schema

---

## Part 3: Page Numberer Version History

### v12 — Attribution-aware break points

Version 12 overhauled how the page numberer decides where to place page breaks on overflow pages. The core insight: **attributions and instruction notes are natural reading boundaries** and should be treated as first-class break points rather than afterthoughts.

#### Issues Addressed

**1. Page breaks ignoring attribution boundaries (pages 127, 129)**

When a section header appeared later on the page, Pass 1 traced back to the content paragraph before it but stopped there, even when an attribution line immediately preceded it. This put the break in the middle of a reading instead of at the natural boundary between readings.

*Example (page 127):* The Levertov poem ended with the attribution "Denise Levertov" at [10], followed by "The day has come..." at [12] (start of a new reading), then "MEDITATIONS" at [15] (section header). v11 broke after [12]; v12 breaks after [10].

*Fix:* Pass 1 now scans backward past attributions after finding its candidate. If `page_paras[candidate_idx - 1]` is a `keep_with_above` paragraph (attribution or instruction note), the candidate moves back to it.

**2. Over-eager repositioning of markers (page 3b)**

Step 5 repositioned page number markers using `find_best_insert_point`, but when the function returned a default fallback (second-to-last paragraph) rather than a structurally meaningful boundary, the repositioning moved the marker unnecessarily early, pushing content to the next page that would have fit.

*Fix:* `find_best_insert_point` now returns a 3-tuple with a `structural` flag. Step 5 only repositions when `structural=True`.

**3. Instruction notes separated from their reading (pages 130, 137)**

Navigation notes like "Additional meditations may be found on pages 1-20." were pushed to the next page by marker repositioning, separating them from the attribution and reading they belong with.

*Fix:* New `is_instruction_note()` recognizes navigation/cross-reference lines. New `is_keep_with_above()` groups attributions and instruction notes as a unit. The default fallback in `find_best_insert_point` respects this grouping, and the `structural` flag prevents repositioning when only default fallback candidates exist.

**4. Phantom page labels from empty Word pages (page 132)**

LibreOffice sometimes generates blank pages at section transitions. These empty pages were counted in the overflow range, inflating labels (e.g., 132a/b/c instead of 132a/b).

*Fix:* `build_page_ranges` now builds a `nonempty_pages` set and filters `word_pages` to exclude blank pages.

**5. Hebrew paragraphs not matching PDF text (page 132)**

Hebrew vowel marks and combining marks differ between the Word document and `pdftotext` output, causing signature mismatches in `build_paragraph_page_map`.

*Fix:* `_strip_bidi()` applied to both sides of the comparison. New `_strip_marks()` function strips all Unicode combining marks as a fallback.

**6. Paragraph splits too early in long prose (page 137)**

`split_paragraph_at_midpoint` targeted 50%, which split single-paragraph pages too early.

*Fix:* New `target_pct` parameter (default 65%). A `split_solo` action type passes 75% for single-paragraph pages.

#### v12 Test Results (kh-machzor-end-of-amidah_processed-8.docx)

| Page | v11 Behavior | v12 Behavior |
|------|-------------|-------------|
| 127a | After [12] "The day has come" | After [10] "Denise Levertov" |
| 3b | Repositioned to after [20], pushed "Can I commit" | No repositioning; marker stays |
| 129a | Split mid-paragraph [27] | After [25] "Richard N. Levy" |
| 130c | "Additional meditations" separated to next page | Note stays with attribution |
| 132 | 132a/b/c (phantom empty page) + WARNING | 132a/b only; transliteration split correctly |
| 137a | Split at 50% → "piling of gold" | Split at 82% → after "contemplation" |

---

### v13 — Transliteration splitting and expanded search range

Version 13 improved transliteration paragraph splitting and expanded the scan range for break points.

#### Changes

**Transliteration split strategy overhauled:**
- New `split_paragraph_at_blank_line` for transliterations with `\n\n` paragraph structure — splits at the first blank line, keeping the opening section with Hebrew.
- Three-stage strategy: blank-line first, then 40% midpoint, then fallback to inserting before the transliteration.
- Short transliterations (<150 chars) are NOT split — page number inserted before them instead.

**`split_paragraph_at_last_period` improved:** Tries earlier periods when the last period gives an empty second half.

**Scan range expanded:** Lowered midpoint threshold from 1/2 to 1/3, so break-point scans now cover the bottom two-thirds of the page.

**New Pass 4:** Finds natural paragraph breaks (period-ending paragraphs) in the lower two-thirds.

**`is_attribution` tightened:** Checks paragraph style first; text-based heuristics only apply to unstyled or generic paragraphs. This prevents false positives on Translation or Hebrew paragraphs that happen to start with a capitalized name.

**`adjust_insert_for_grouping` (new):** Post-insertion adjustment that prevents stranding section headers (pushes them to the next page) and keeps attributions/instruction notes with their readings.

**Pass 2 fixes:** Excludes section headers from "new reading" detection. The new-reading handler won't return a section header as the break point.

---

### v14 — Cleanup pass (current version)

Version 14 adds a post-processing cleanup pass (Step 7) that runs after all numbering is complete. Three rules address structural artifacts left by the earlier steps.

#### Rule 1 — Collapse empty suffix pairs

**Problem:** When the page numberer assigns two Word pages to a source page but the content only fills one page, the second label (e.g., 1197b) ends up immediately after the first (1197a) with no content between them. The second page is empty.

**Fix:** When two consecutive Page Number paragraphs share the same base number and both have letter suffixes, remove the second and strip the suffix from the first. For example, 1197a + 1197b (no content between) → 1197.

**Implementation note:** Text updates use raw lxml `w:t` element editing rather than python-docx's `run.text` setter, which calls `run.clear()` and destroys `w:br` page break elements in sibling runs.

#### Rule 2 — Label unlabeled overflow pages

**Problem:** When Step 5 repositions an overflow marker (e.g., moving 1195b after an instruction note), the content after the repositioned marker may span a page break that the script didn't originally account for. This creates a page of content with no label.

**Fix:** Scan between consecutive page numbers for the pattern: suffixed overflow marker (has page break) → content → empty paragraph with page break → more content → next marker. When found, replace the empty paragraph with a new page number carrying the next sequential suffix. For example, content after 1195b gets labeled 1195c.

#### Rule 3 — Consolidate blank page separators

**Problem:** The OCR artifact produces an empty Normal paragraph with a page break between each source page's content and the next page number marker. When the page numberer moves the page break onto the page number marker (by adding one to markers that lack it), the original empty paragraph becomes redundant — it renders as a blank page in the output.

**Fix:** When a page number paragraph (without a page break) is immediately followed by an empty paragraph whose only purpose is carrying a page break, move the break onto the page number and delete the empty paragraph. This eliminates stray blank pages.

**Implementation note:** All three rules use raw lxml XML traversal (`body.findall`, `el.find`, etc.) rather than `doc.paragraphs` wrappers, because Step 6 inserts raw XML elements via `make_page_num_xml()` that don't have proper python-docx paragraph objects. The `_el_text` helper reads only `w:r/w:t` elements (not `itertext()`, which double-counts through nested XML nodes).

#### v14 Test Results (kh-machor-concluding-prayers_processed-4.docx)

| Rule | Action | Count |
|------|--------|-------|
| Collapse empty suffix pairs | 1197a+1197b → 1197, 1219a+1219b → 1219 | 2 |
| Label unlabeled overflow pages | 1195c, 1215c inserted | 2 |
| Consolidate blank separators | Page break moved to PN, empty para removed | 31 |

Total paragraphs: 297 → 262 (35 removed). Zero orphaned blank-break paragraphs remaining.

---

## File Inventory

| File | Purpose |
|------|---------|
| `SiddurOCRApp.jsx` | React artifact — PDF → Word converter |
| `siddur_page_numberer.py` | Python script (v14) — adds lettered page numbers |

---

## Known Issues and Limitations

1. **Processing requires active browser:** The artifact makes API calls from the browser. The computer must stay awake and the Claude app must stay open during processing. The 30-second auto-start timer helps when the user may not notice the ready state.

2. **Auth token expiration:** For long processing runs, the Claude interface's session token can expire mid-processing, causing 401 errors on all remaining pages. Fix: refresh the page and rerun. Consider processing in smaller batches.

3. **Content filter blocks:** Some pages with certain content may be blocked by Anthropic's content filter. The app now attempts a "safe mode" retry that asks the AI to skip sensitive content and mark omissions. If that also fails, the page is skipped with full error detail visible in the results summary.

4. **Reading separation:** The AI generally separates readings correctly when visual whitespace is clear. In dense pages where readings flow without clear gaps, the AI may combine readings. The attribution-as-boundary rule (attribution followed by translation = new reading) provides reliable separation in post-processing.

5. **Two-column Hebrew merge:** In Kol Haneshamah, Hebrew sometimes appears in two columns. The AI is instructed to merge them into one line, but OCR quality varies.

6. **Nikkud fidelity:** Hebrew vowel marks are the #1 priority, but AI vision occasionally misses or adds marks. Manual review is recommended.

7. **Unfound page markers:** When a page number marker doesn't appear cleanly in the rendered PDF (due to bidi text, merged lines, or "skipped page" messages), the numberer guesses its position. This is usually correct but can occasionally be off by a page.

8. **Small caps divine names:** The AI may occasionally render small-caps divine names as italic or mixed case instead of ALL CAPS. The prompt now includes explicit instructions and a self-check item for this.

9. **Transliteration split heuristics:** The automatic split-point selection for transliteration paragraphs targets a percentage-based midpoint. In some cases the split may land a sentence too late (e.g., after the third *b'rakhah* instead of the second). Manual adjustment of the output may be needed for specific pages.

---

## Revision History (Key Changes)

### Pre-2026-04-13 (from original report)

- **Compound header splitting (KH):** Headers like "MEDITATIONS / 9" split into section_header + page_number
- **ALL CAPS normalization (MT):** First 3 words stay caps, rest sentence-cased
- **Chatimah support (MT):** Closing blessing formulas handled correctly
- **Black page numbers:** Changed from gray (#666666) to black throughout
- **Transliteration spacing:** Added vertical space between transliteration and translation
- **Instructions left-aligned:** Changed from centered to left-aligned, preserving italic markup
- **Attribution protection:** Page numberer keeps author names with their readings
- **Sequential marker search:** Fixed critical bug where duplicate page numbers caused cascade failures
- **Bidi stripping:** Fixed invisible Unicode directional characters breaking marker matching
- **"Page " prefix filtering:** Prevented false matches against "Page X skipped" messages
- **Span sanity cap:** No single source page can span more than 8 Word pages
- **Style ID detection:** Inserted page numbers get the document's actual page number style applied

### 2026-04-13 Session — Artifact Changes

#### New Element Types
- **`hebrew_header`** — Hebrew prayer name in slightly larger font (e.g., אֱלֹהַי נְצוֹר). Bold, right-aligned, same body font size. Own paragraph style `HebrewHeader`.
- **`attribution`** — Author/source credits. Right-aligned, italic, smaller font (fontSize - 1). Own paragraph style `Attribution` with generous after-spacing (360 twips).

#### Attribution Handling (Critical Fix)
- **Root cause found:** `attribution` was in `LITURGICAL_TYPES`, causing `reorderElements` to sort it after all translations in a group — undoing the AI's correct placement.
- **Fix:** Removed `attribution` from `LITURGICAL_TYPES`. It now acts as a flush boundary in `reorderElements`, preserving its position between readings.
- **Post-attribution spacing:** When a `translation` follows an `attribution`, a spacer paragraph is inserted to clearly delineate a new reading.

#### Header Processing (Multiple Fixes)
- **Number-first compound headers:** Added pattern for "128 / MEDITATIONS" format (previously only handled "MEDITATIONS / 9").
- **Unicode slash handling:** Regex now matches regular, fraction (⁄), division (∕), and fullwidth (／) slashes.
- **`cleanHeaderText` helper:** Reusable function strips number+separator prefixes/suffixes using `\W+` to match ANY non-word character.
- **Bottom label promotion fix:** Bottom labels now cleaned with `cleanHeaderText` BEFORE promotion and BEFORE dedup comparison.
- **`normalizeHeader` uses `cleanHeaderText`:** Dedup comparisons strip page numbers before matching.
- **Running header dedup narrowed:** Only the FIRST section_header per page participates in global deduplication. Content sub-headers always kept.

#### ALL CAPS Handling
- **Layout-conditional normalization:** `normalizeLeadingCaps` only runs for Mishkan T'filah layout. KH text passes through unmodified.
- **Small caps divine names:** Prompt instructs AI to render small-caps text (THE ETERNAL ONE, MY REDEEMER, etc.) as ALL CAPS.

#### Line Break, Indentation, and Other Fixes
- **Column line breaks eliminated:** Prompt explicitly says "Do NOT preserve line breaks from the printed column layout."
- **Indentation tightened:** `>>` marker used only for structurally indented text.
- **Content filter safe mode:** On content filter block, retries with appended prompt asking AI to skip sensitive content.
- **Responsive readings:** "Reader:" / "Congregation:" labels wrapped in `<i>` tags; prayer text stays regular.
- **Footnote boundary strengthened:** Any text below a horizontal rule is a footnote.
- **Decorative graphics:** Ignored; text below them still extracted.
- **Arrow stripping:** Comprehensive Unicode arrow pattern.
- **Dynamic version timestamp:** Computed at load time using user's local timezone.
- **30-second auto-start timer.**
- **AI self-check:** 8-point verification in KH prompt.

### 2026-04-13 Session — Page Numberer v12

- Attribution lines as preferred break points (Pass 3)
- Instruction/navigation notes kept with preceding reading
- `is_keep_with_above()` groups attributions + notes as a unit
- Pass 1 scans back past attributions for cleaner breaks
- `_strip_bidi()` applied in paragraph-page mapping
- `_strip_marks()` fallback for Hebrew vowel mismatches
- Empty Word pages filtered from ranges (eliminates phantom labels)
- `split_paragraph_at_midpoint` biased to 65% default / 75% solo
- `find_best_insert_point` returns structural flag; Step 5 only repositions for structural breaks
- Default fallback respects keep-with-above on last paragraph

### Page Numberer v13 (undated)

- Three-stage transliteration split: blank-line → 40% midpoint → fallback
- `split_paragraph_at_blank_line` for `\n\n` paragraph structure
- Short transliterations (<150 chars) not split — page number inserted before
- `split_paragraph_at_last_period` tries earlier periods on empty second half
- Scan range expanded from bottom half to bottom two-thirds
- New Pass 4: natural paragraph breaks (period-ending) in lower two-thirds
- `is_attribution` checks style first; text heuristics only for unstyled paragraphs
- `adjust_insert_for_grouping` prevents stranding headers and attributions
- Pass 2 excludes section headers from "new reading" detection

### 2026-04-14 Session — Artifact Changes

- **Multi-page layout detection:** Detection now tries up to 3 PDF pages instead of only the first. If page 1 returns "other" (title page, table of contents, section divider), pages 2 and 3 are tried. Stops early on the first successful identification. The reasoning string notes which page was used when it's not page 1. Token usage from all detection attempts is tracked.

### 2026-04-14 Session — Page Numberer v14

- New Step 7: Cleanup pass with three rules (collapse empty suffix pairs, label unlabeled overflow pages, consolidate blank page separators)
- All cleanup rules use raw lxml XML traversal to handle both python-docx paragraphs and raw XML elements from Step 6
- `_el_text` reads only `w:r/w:t` elements (fixes triple-counting from `itertext()`)
- `_el_set_text` preserves page break runs when renaming labels
- Tested on KH Machzor Concluding Prayers: 2 collapsed, 2 labeled, 31 consolidated, 297→262 paragraphs

---

## For Continuing This Work

To continue development in a new Claude thread:

1. Upload `SiddurOCRApp.jsx` and ask Claude to review it as the codebase
2. Upload `siddur_page_numberer.py` as the companion script
3. Upload this report as context
4. Reference the two supported layouts (Mishkan T'filah and Kol Haneshamah) and their specific rules
5. Any new siddur layout would need: a new entry in the `LAYOUTS` object with a `systemPrompt`, `detectHints`, and optionally a post-processing function

The artifact runs as a Claude React artifact (`.jsx` file rendered in Claude's interface). The page numberer runs as a standalone Python script requiring LibreOffice.

### Key Architecture Notes for Developers

- **`reorderElements`:** Sorts liturgical elements within each group (hebrew_liturgy → transliteration → translation). `attribution` is deliberately NOT in `LITURGICAL_TYPES` — it acts as a flush boundary to preserve its position between readings. Adding it to `LITURGICAL_TYPES` would cause it to sort to the end of groups, breaking attribution placement.
- **`cleanHeaderText`:** Must be called on any text before dedup comparison or promotion to section_header. It strips number+separator patterns from both ends.
- **`normalizeHeader`:** Calls `cleanHeaderText` first, then uppercases and normalizes whitespace/apostrophes. Used for all dedup comparisons.
- **`useCapsNorm`:** Flag in `buildDocx` set only for `mishkan_tfilah`. Guards all `normalizeLeadingCaps` calls. Adding it for other layouts would incorrectly lowercase ALL CAPS content.
- **Content filter retry:** Uses nested try/catch — inner catch for content filter (triggers safe mode retry), outer catch for final failure.
- **`cleanup_pass` uses raw XML:** All three rules operate on lxml elements directly (`body.findall`, `el.find`), not `doc.paragraphs`, because Step 6 inserts raw XML elements that lack python-docx wrappers. The `_el_text` helper reads only `w:r/w:t` to avoid triple-counting from `itertext()`.

---

## Additional Notes

- A hosted version of the app is available at https://techrabbi.org/JBI/siddur-ocr.html — this version requires an Anthropic API key. The Claude artifact version does not require a key.
