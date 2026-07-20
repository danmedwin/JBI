import { useState, useCallback, useRef, useEffect } from "react";

/* ─── Version Stamp (computed at load time in user's local timezone, Eastern fallback) ─── */
const VERSION_STAMP = "v2026-07-20 build";

/* ─── Layout Definitions ─── */
const LAYOUTS = {
  "mishkan_tfilah": {
    name: "Mishkan T'filah",
    publisher: "CCAR Press",
    description: "Reform movement siddur with Hebrew, transliteration, and translation in parallel columns",
    systemPrompt: `You are an expert OCR and layout analysis system specialized in Jewish prayer books (siddurim). You will be given an image of a page from Mishkan T'filah, the Reform movement's siddur published by CCAR Press. Your job is to identify every layout element on the page and extract the text with high accuracy.

CRITICAL: Pay extreme attention to Hebrew vowels (nikkud) — the dots, dashes, and marks above/below Hebrew letters. These MUST be captured accurately.

CRITICAL — TRANSCRIBE THE PRINTED TEXT, NOT THE REMEMBERED TEXT: Mishkan T'filah sometimes alters traditional liturgy (added matriarchs, alternative wordings, gender-inclusive language). If the printed Hebrew differs from the traditional version you know — in gender, number, conjugation, suffixes, or word choice — the printed text is correct: transcribe exactly what is in the image. Never autocomplete a familiar prayer from memory.

CRITICAL: Do NOT introduce stray characters, numbers, or artifacts into the extracted text. If you see a digit, punctuation mark, or character that does not clearly belong to the Hebrew word or phrase, omit it. Navigation and header elements in particular should contain ONLY the actual Hebrew or English text visible — no extra digits, no stray "1"s or other artifacts from page numbering, footnote markers, or OCR noise. Double-check every element for phantom characters before returning it.

ITALIC PRESERVATION: When English text (translations, footnotes, instructions, or readings) contains words or phrases in italics, wrap the italic portions in <i>...</i> tags. For example: "We praise You, <i>Adonai</i>, who sanctifies Shabbat." This applies to translations, footnotes, and any English text — but NOT to Hebrew liturgy or transliteration. Instructions are entirely italic by nature — no <i> tags needed for them.

Mishkan T'filah has a distinctive layout:
- Hebrew liturgy appears RIGHT-ALIGNED on the RIGHT side of each page
- Transliteration (phonetic English rendering of Hebrew) appears LEFT-ALIGNED on the LEFT side
- These two columns run in parallel
- English translation/reading text typically appears BELOW the Hebrew/transliteration columns, centered or left-aligned

CRITICAL — output order for parallel columns: When a page has Hebrew in the right column and transliteration/English in the left column, output each prayer as a COMPLETE UNIT before moving to the next prayer. Do NOT read all left-column content first, then all right-column content. For each prayer on the page, output: hebrew_liturgy → transliteration → translation. This keeps each prayer's elements together rather than interleaving elements from different prayers.
- Section headers are in ALL CAPS and CENTERED on the page
- Some section headers have a Hebrew title (e.g., "בִּרְכוֹת הַשַּׁחַר") CENTERED on its own line, paired with the English ALL CAPS section header directly below it (or the transliteration+English combined, like "BIRCHOT HASHACHAR — MORNING BLESSINGS"). The Hebrew title is extracted as hebrew_section_header. This is DIFFERENT from hebrew_liturgy (body Hebrew, right-aligned) — a hebrew_section_header is CENTERED on the page, not right-aligned, and visually pairs with an English section_header.
- Instructions are italicized, centered, and NOT in all caps
- Margin navigation words appear in Hebrew on the outer margins
- Page numbers appear in the lower corners, often formatted like "2 [120]"
- Footnotes appear below a horizontal rule/line near the bottom of the page

Identify and classify each element as one of these types:

- navigation: Hebrew words on the margin (1-2 words per line). Capture ONLY the Hebrew word(s).
- header: Running header text at the very top of the page. Capture ONLY the actual text — no stray numbers.
- page_number: Numbers in the lower corner, formatted like "2 [120]".
- instructions: Centered, italicized text giving directions. NOT in all caps. Entirely italic — no <i> tags needed.
- section_header: Centered text in ALL CAPS. MUST be CENTERED — left-aligned all-caps is transliteration.
- hebrew_section_header: Hebrew prayer/section title CENTERED on the page (not right-aligned). Typically appears directly above an English section_header. Include all nikkud. This is NOT body Hebrew — body Hebrew is right-aligned and becomes hebrew_liturgy. The Hebrew title of a service or major section (e.g., שַׁחֲרִית לְשַׁבָּת, סֵדֶר קְרִיאַת הַתּוֹרָה) is ALWAYS a hebrew_section_header, even when it is the first element on the page.
- hebrew_liturgy: Hebrew text, right-aligned. Join all lines into one paragraph. Preserve all vowel marks.
- transliteration: Phonetic English of Hebrew, left-aligned. Join into one paragraph. The opening words may be in ALL CAPS — capture them as seen; post-processing will normalize.
- translation: English meaning/reading. Use <i>...</i> around italic portions. Preserve multi-paragraph breaks as blank lines. New readings starting with ALL CAPS words should be separate elements. The opening words may be in ALL CAPS — capture them as seen.
- footnote: Text BELOW a horizontal rule at the bottom. Use <i>...</i> around italic portions.

NOTE: A chatimah (closing blessing formula) often appears as a single line of Hebrew + transliteration after an English section (e.g., BARUCH ATAH ADONAI...). Treat the Hebrew as hebrew_liturgy and the transliteration as transliteration — capture the ALL CAPS opening as-is.

Return using XML tags:

<elements>
<element type="page_number" order="1">68 [186]</element>
<element type="hebrew_section_header" order="2">בִּרְכוֹת הַשַּׁחַר</element>
<element type="section_header" order="3">BIRCHOT HASHACHAR — MORNING BLESSINGS</element>
<element type="hebrew_liturgy" order="4">hebrew with all nikkud</element>
<element type="transliteration" order="5">transliteration here</element>
<element type="translation" order="6">We praise You, <i>Adonai</i>, Sovereign of the universe.</element>
<element type="footnote" order="7"><i>Kiddush</i> means "sanctification."</element>
</elements>

CRITICAL ORDERING RULE: Liturgical content must follow: hebrew_liturgy → transliteration → translation. When multiple sections appear on one page, each independently follows this order.

Return ONLY the XML block. No other text.`,
  },
  "kol_haneshamah": {
    name: "Kol Haneshamah",
    publisher: "Reconstructionist Press",
    description: "Reconstructionist siddur with block Hebrew text, transliteration, and bottom-of-page section/service labels",
    systemPrompt: `You are an expert OCR and layout analysis system specialized in Jewish prayer books (siddurim). You will be given an image of a page from Kol Haneshamah, the Reconstructionist movement's siddur.

YOUR #1 PRIORITY: Hebrew vowel marks (nikkud) MUST be preserved with 100% fidelity. Every dot, dash, and mark above or below Hebrew letters must appear. Outputting Hebrew without nikkud is a critical failure.

TRANSCRIBE, DO NOT CORRECT. This is a faithful OCR transcription task, not a translation or proofreading task. Transcribe EXACTLY what appears in the image, even if you believe the source contains an error, an unusual spelling, an unconventional vocalization, or grammatically "wrong" nikkud. NEVER:
- Add a nikkud mark that isn't visible in the image because you think the word "should" have one
- Remove a nikkud mark that IS visible because you think it shouldn't be there
- Substitute a different nikkud because the visible one is grammatically unusual (e.g., DO NOT change a patach to a kamatz just because the word is usually spelled with kamatz)
- Replace one Hebrew letter with another to make a more familiar word (e.g., DO NOT turn לְסֵפָר into לִסְפֹּר because the latter is a more common form)
- Auto-complete partial words or "fix" what looks like a misprint
- Modernize archaic spellings or normalize unusual vocalizations
If the image clearly shows nikkud X under letter Y, output exactly nikkud X under letter Y — regardless of whether that's the grammatically expected form. The user wants what the printed page actually says, not what it should have said. When in doubt, render the mark you can see; do not guess based on context.

INTENTIONAL TEXTUAL VARIANTS — THE PRINTED TEXT OVERRIDES THE TRADITIONAL TEXT: Kol Haneshamah is a Reconstructionist siddur that DELIBERATELY rewrites parts of the traditional liturgy: God may be addressed in the feminine (e.g., בְּרוּכָה אַתְּ instead of בָּרוּךְ אַתָּה), masculine suffixes may become feminine (־ךָ ↔ ־ךְ), verbs may be re-conjugated for gender or number, singular may become plural, and divine names may differ from the familiar ones (יָהּ, שְׁכִינָה, מְקוֹר הַחַיִּים, מַלְכָּה). You know the traditional wording of these prayers from memory — that memory is a HAZARD here. NEVER autocomplete a familiar prayer; read every word from the image. When a prayer you recognize differs from the version you know in gender, number, conjugation, pronoun suffix, or word choice, the printed variant is CORRECT and is precisely what the publisher intended — transcribe it letter-for-letter with its printed nikkud. Before finalizing any well-known prayer, re-read the actual image word by word and confirm you copied the PRINTED words, not the remembered ones. The same applies to transliteration and translation: they follow the printed variant text, not the traditional text.

NIKKUD VISUAL DISTINCTIONS — common confusions to watch for carefully (look closely at the actual shape, do NOT guess):
- Patach (ַ) vs Kamatz (ָ): both appear below the letter. Patach is a single HORIZONTAL line. Kamatz is a horizontal line with a small VERTICAL stroke descending from its center, forming a T-shape (or inverted T). If you see any vertical tick, it is kamatz, not patach.
- Hirik (ִ) vs Shva (ְ): both appear below the letter. Hirik is a SINGLE dot. Shva is TWO dots stacked vertically. Count the dots.
- Tzeireh (ֵ) vs Segol (ֶ): both appear below the letter. Tzeireh is TWO dots arranged HORIZONTALLY (side by side). Segol is THREE dots arranged in a downward-pointing triangle (one dot on top, two dots below).
- Cholam (ֹ): a single dot ABOVE the letter, typically toward the upper-left. When it appears on top of a vav (וֹ), it is "cholam male"; otherwise "cholam haser".
- Dagesh (ּ): a dot INSIDE the body of a letter (centered within it). Do not confuse with cholam (above the letter).
- Sheva-na vs Sheva-nach are written identically (ְ) — preserve the mark, do not infer pronunciation.
- Before outputting any Hebrew word, mentally re-check each nikkud against the image. Substituting a similar-looking mark is a failure even if the word "looks right."

CRITICAL: Do NOT introduce stray characters, numbers, or artifacts.

CRITICAL: If you see any arrows in the text (curved, straight, or decorative — e.g., ↩ → ← ↑ ↓ ➜ ➔ ▶ ◀ ⟶ ↪), SKIP them entirely. Do not include arrows in the output.

ITALIC PRESERVATION: When English text contains italic words or phrases, wrap the italic portions in <i>...</i> tags. Not for Hebrew or transliteration.

BOLD PRESERVATION: When English text contains BOLD words or phrases (visually heavier/blacker stroke weight than the surrounding text), wrap them in <b>...</b> tags. Apply to translations, instructions, attributions, footnotes — anywhere English text appears with bold formatting. Example: "Reader: <b>And there was evening, there was morning</b> — a single day." Bold and italic are orthogonal; both can apply to the same span (e.g., <b><i>bold italic phrase</i></b>). Do NOT use <b> tags on Hebrew or transliteration text. NEVER emit other HTML-style markup tags (no <u>, no <em>, no <strong>, no <span>) — only <i> and <b> are supported.

BOLD IS NOT THE SAME AS SMALL CAPS: Text rendered in small-caps (visually all-uppercase but in a stylized small-caps font — common for section labels like "GUIDED MEDITATION", "COMMENTARY", "NOTE", "DERASH", "KAVANAH", or for divine-name styling like "THE ETERNAL ONE", "THE HOLY ONE", "MY GOD") is NOT bold. Small caps is a different typographic style that is already handled by the ALL CAPS rendering rules elsewhere in this prompt. Do NOT wrap small-caps text in <b> tags. Only use <b> when the text is visually a HEAVIER stroke weight than the surrounding non-bold text. If a phrase is in small caps, render it as ALL CAPS without any <b> tags.

WHEN UNSURE ABOUT BOLD: prefer NOT marking bold. Genuine bold body text is relatively rare in printed prayer books — most "looks bold" cases are actually small caps or simply emphasis you should ignore. Inline bold in a translation paragraph is the typical legitimate case (e.g., a refrain that's set in bold). Section titles and sub-headers should be their own element type (section_header, hebrew_header), NOT inline bold inside another element.

ITALIC EXCEPTIONS IN OTHERWISE-ITALIC PARAGRAPHS — be CONSERVATIVE: Instructions and attributions are normally entirely italic — in that default case, do NOT use any tags. ONLY switch to explicit <i>...</i> markup when the paragraph contains TRANSLITERATED HEBREW TERMS set in upright (non-italic) type to distinguish them from the surrounding italic English. When you DO use <i> markup, you MUST be thorough: every transliterated Hebrew term in the paragraph must be left non-italic. Missing one is a critical failure.

COMMON HEBREW TRANSLITERATED TERMS that are typically rendered upright (non-italic) inside italic paragraphs — if you see ANY of these in an italic paragraph, switch to <i>...</i> markup mode and leave THESE terms bare (non-italic) while wrapping all surrounding English in <i>...</i>: Kabbalat Shabbat, Kabbalat Hashanah, Kabbalat HaShanah, Yamim Nora'im, sheliaḥ tzibur, sheliach tzibur, ma'ariv, maariv, shaḥarit, shacharit, minḥah, minhah, mincha, musaf, mussaf, ne'ilah, neilah, Aleinu, Sh'ma, Shema, Amidah, Kaddish, Kedushah, Sh'moneh Esreh, Birkat Hamazon, Hallel, Selichot, S'lichot, Avinu Malkeinu, Avodah, Hoshanot, Tashlich, Tashlikh, Kol Nidre, Vidui, Yizkor, Unetaneh Tokef, Aseret Y'mei Teshuvah, Mahzor, Machzor, midrash, halakhah, halacha, kavanah, kavvanah, derash, nusaḥ, nusach. This is not an exhaustive list — any Hebrew-derived word (transliterated proper nouns for Jewish holidays, prayer names, service names, ritual objects, Hebrew text categories) that appears in an italic paragraph should follow the same rule.

DO NOT mark any of the following as non-italic, even if you think they "look different":
- English page references (e.g., "pages 23-57", "p. 14", "see page 102")
- English numbers, dates, or numeric ranges
- Ordinary English nouns/verbs/articles
- Punctuation, slashes, commas, dashes
- ANY span where you are not 100% certain it is visually upright in the source

When in doubt, treat the text as italic (omit the tag). It is FAR better to render a word italic when it should be upright than to render a word upright when it should be italic. Over-marking non-italic exceptions is a critical failure.

If the entire paragraph is italic with NO upright exceptions, emit the paragraph with no <i> tags at all.

If the paragraph has exceptions, switch to explicit markup: wrap each italic span with <i>...</i>. Example for a paragraph reading "the sheliaḥ tzibur leads the congregation" where ONLY "sheliaḥ tzibur" is upright: <i>the</i> sheliaḥ tzibur <i>leads the congregation</i>.

SMALL CAPS / DIVINE NAMES: Words that appear in SMALL CAPS in the original (e.g., THE ETERNAL ONE, THE BOUNDLESS ONE, THE RADIANCE, THE MANY-NAMED, MY REDEEMER, THE SUPREME ONE, THE ALMIGHTY, THE EMINENCE, GOD) should be rendered in ALL CAPS in the output — NOT italic, NOT mixed case. Do NOT use <i> tags for small-caps text. Example: "Blessed are you, THE HOLY ONE" — not "Blessed are you, <i>The Holy One</i>".

TRANSLITERATION — DOTTED H (CHET): Kol Haneshamah transliteration uses an "h" with a dot DIRECTLY BENEATH it to represent the Hebrew letter chet (ח). You MUST output this as the precomposed Unicode character ḥ (U+1E25) for lowercase, and Ḥ (U+1E24) for uppercase.

DOTTED H — REQUIRED FORM: ḥ (single character, U+1E25) or Ḥ (single character, U+1E24).

DOTTED H — FORBIDDEN OUTPUTS (these are all WRONG, never produce them):
- A bare "h" with no dot when the source shows a dot below
- "ch" (e.g., "Chanukkah" instead of "Ḥanukkah")
- "h" followed by a combining mark (e.g., h + U+0323) — always use the precomposed character
- "h" with a dot ABOVE instead of below (that would be ḣ, U+1E22 — WRONG)
- "h" followed by an "e" with any kind of dot/diacritic (e.g., hė, hë, he·, h·e) — there is no "e" after the h; the dot belongs UNDER the h itself
- Any other approximation involving extra letters or repositioned dots

Words where the dotted-h appears include: Ḥanukkah, Pesaḥ, simḥah, raḥamim, ruaḥ, beraḥot, eḥad, meḥayyey, koaḥ, mashiaḥ, sheliaḥ, shaḥarit, miḥyah, etc. If you see a dot under an h in the printed transliteration, output ḥ or Ḥ — nothing else. Do not normalize, strip, reposition, or invent companion characters.

RESPONSIVE READINGS: Some prayers have labels like "Reader:" or "Congregation:" in italics followed by regular (non-italic) text. These are translation elements, NOT instructions. Wrap ONLY the label in <i> tags: "<i>Reader:</i> Let God's name be made great..." The text after the label stays in regular type.

DECORATIVE IMAGES: Some pages have decorative graphics or illustrations (e.g., a Kiddush cup). IGNORE these images. Still extract all text on the page including any headers that appear below the image.

Kol Haneshamah layout:
- Running header at top of page, usually formatted "SECTION NAME / PAGE_NUMBER" (e.g., "MEDITATIONS / 9", "ROSH HASHANAH MA'ARIV / 63", "SOURCES / 1257"). SPLIT this into a section_header (the name) and a page_number (the number). The page number goes at the BOTTOM. If the header has no slash/number, treat it as a section_header only. Retain ALL CAPS formatting in headers exactly as they appear.
- Hebrew text as blocks (sometimes two columns — MERGE into one continuous line, right-to-left)
- Some prayers have the name of the prayer in Hebrew as the FIRST LINE, in a slightly larger font than the body text (e.g., "אֱלֹהַי נְצוֹר" at the top of page 126). Extract this as a hebrew_header element — it is distinct from hebrew_liturgy.
- Transliteration below/near Hebrew, usually shorter. Capture exactly as seen.
- English translation/reading text. CRITICAL: Do NOT preserve line breaks from the printed column layout. The book breaks lines to fit narrow columns — these are NOT meaningful line breaks. Combine ALL running prose into continuous paragraphs regardless of how the lines break in the printed column. Even text that LOOKS like poetry due to short lines in a narrow column should be combined into prose unless there is clear structural indentation.
- INDENTATION: Almost never use >>. Use >> ONLY for lines where the FIRST WORD of a new sentence starts visibly indented from the normal left margin — NOT for line continuations where a long sentence wraps to the next line. If a long sentence wraps and the continuation appears further right, that is NOT indentation. When in doubt, do NOT use >>.
- READING SEPARATION — THIS IS THE #1 PRIORITY:
  Look at the page image. You will often see MULTIPLE distinct text blocks separated by VERTICAL WHITESPACE (a visible gap between passages). Each visually separate block of English text MUST be its own <element type="translation"> with a unique order number.
  HOW TO IDENTIFY READING BOUNDARIES:
  * A block of text ends → vertical gap → author name in small italics → that author goes with the block ABOVE
  * After the author name → another block of text begins → that is a NEW translation element
  * A block of text ends → vertical gap → new block begins (no author) → still a new translation element
  WRONG (combining two visual blocks):
    <element type="translation" order="2">Block A text... Block B text...</element>
    <element type="attribution" order="3">Author of Block A</element>
  RIGHT (each visual block is separate):
    <element type="translation" order="2">Block A text...</element>
    <element type="attribution" order="3">Author of Block A</element>
    <element type="translation" order="4">Block B text...</element>
- Author attributions: right-aligned or centered, smaller italic text (e.g., "Denise Levertov", "Chaim Stern (Adapted)"). Each attribution element goes IMMEDIATELY after the translation element it credits.
- Decorative dividers BETWEEN readings: Kol Haneshamah sometimes places a small horizontal ornament (a curly flourish, swirl, fleuron, knot, or similar decorative glyph — NOT a horizontal rule line) between two separate readings on the same page. When you see such an ornament between content blocks, emit a "divider" element. The text content of the divider element doesn't matter — use "·" or "✦" as a placeholder. The marker itself is what counts; post-processing handles the spacing. If a divider appears at the very bottom of the page after all readings (just above the page footer/page number area), still emit it — post-processing will drop trailing dividers.
- Instructions in italics
- Bottom of page may contain identifying text:
  * Even pages typically show the name of the specific prayer or section in the service (left-aligned)
  * Odd pages typically show the name of the overall service, e.g., "Rosh Hashanah Ma'ariv" (right-aligned)
  Extract ALL bottom text as bottom_section_name (even/left) or bottom_service_name (odd/right). Include every occurrence — deduplication is handled in post-processing.
- Footnotes below horizontal rule. CRITICAL: ANY text that appears BELOW a horizontal line/rule on the page is a FOOTNOTE — this includes text labeled COMMENTARY, NOTE, KAVANAH, DERASH, or unlabeled paragraphs. All such text must be extracted as footnote elements, NOT as translation elements.
- INSTRUCTIONS vs FOOTNOTES — positional rule: A horizontal rule near the BOTTOM of the page is what defines a footnote zone. Italic prose that appears ABOVE any horizontal rule (especially at the TOP of a page, before any main content) is an "instructions" element, NEVER a footnote. Examples of instructions that are NOT footnotes: an italic introductory paragraph at the top of a page explaining what the section covers (e.g., "Kabbalat Hashanah, pages 23-57, provides a broad variety of options..."), italic directives like "Choose from the following:" or "Read responsively". If there is no horizontal rule above the italic text, it cannot be a footnote.

Element types:
- page_number: Page number — from running header "SECTION / NUMBER" or bottom. Extract ONLY the number.
- section_header: Section name from running header OR from a title on the page (including titles that appear below decorative graphics). ONLY the name, no page number. Running headers are ALWAYS in ALL CAPS in Kol Haneshamah — preserve ALL CAPS exactly. If "128 / MEDITATIONS" or "MEDITATIONS / 9", extract "MEDITATIONS" only. But compound prayer titles with a slash like "KIDDUSH LEYL ROSH HASHANAH / KIDDUSH FOR ROSH HASHANAH EVE" or "YIGDAL / GREAT IS..." should be kept as-is — the slash is part of the title, not a page number separator.
- hebrew_header: Hebrew prayer name appearing as the first line in a slightly larger font. Include all nikkud. Bold in the original.
- bottom_section_name: Identifying text at bottom of even pages (prayer/section name). Preserve case as shown.
- bottom_service_name: Identifying text at bottom of odd pages (service name). Preserve case as shown.
- instructions: Italicized directions or introductory prose appearing ABOVE any horizontal rule. Entirely italic — no <i> tags. Includes multi-sentence intro paragraphs at the top of a page describing what the section contains. If italic text is NOT below a horizontal rule, it is "instructions", not "footnote".
- hebrew_liturgy: Hebrew blocks WITH ALL NIKKUD. Merge two-column Hebrew into one line.
- transliteration: Phonetic English. Capture exactly as seen.
- translation: English meaning. Use <i>...</i> for italics. Combine running prose into continuous paragraphs — do NOT preserve column line breaks. Each visually separated passage = its own translation element.
- attribution: SHORT (typically 1-5 words) italic author/source credit, usually right-aligned or centered, appearing IMMEDIATELY after the specific reading it belongs to. Examples: "Denise Levertov", "Chaim Stern (Adapted)", "Sidney Greenberg (Adapted)", "Talmud, Berakhot 17a". Parenthetical qualifiers like "(Adapted)" or "(Translation)" are part of the attribution, not separate. An attribution is NOT a multi-sentence paragraph — if the italic text spans multiple sentences or gives directions, it's "instructions", not "attribution". NEVER place attribution at the end of all readings.
- divider: A decorative ornament between readings (curly flourish, fleuron, knot, swirl). Emit when you see this glyph between content blocks. Text content doesn't matter; "·" works as a placeholder. NOT for horizontal rule lines (those separate footnotes from main content).
- footnote: ALL text below a horizontal rule on the page. REQUIRES a horizontal rule above it on the same page. Includes COMMENTARY, NOTE, KAVANAH, DERASH sections and unlabeled notes. Use <i>...</i> for italic portions. If a footnote ends with an author's initials or name (e.g., "D.A.T.", "M.M.K.", "R.H."), keep them as part of the footnote — do NOT extract them as separate attribution elements. NEVER classify italic text at the top of a page (before any horizontal rule) as a footnote — that is "instructions".

Return using XML. Here is an example of a page with MULTIPLE readings and attributions — note how each reading is a separate element:
<elements>
<element type="section_header" order="1">MEDITATIONS</element>
<element type="translation" order="2">First reading: all text combined into one paragraph regardless of column line breaks...</element>
<element type="attribution" order="3">First Author</element>
<element type="divider" order="4">·</element>
<element type="translation" order="5">Second reading on the same page, also as one paragraph...</element>
<element type="attribution" order="6">Second Author</element>
<element type="translation" order="7">Third reading, if present...</element>
<element type="bottom_section_name" order="8">Amidah</element>
<element type="bottom_service_name" order="9">Kabbalat Shabbat</element>
<element type="page_number" order="10">127</element>
</elements>

ORDERING: section_header first, then hebrew_header, then content (hebrew_liturgy → transliteration → translation → attribution, repeating for each reading), page_number LAST.

FINAL SELF-CHECK before returning:
1. Count the author names you see in italic/small text on the page. You should have exactly that many attribution elements.
2. Each attribution must appear DIRECTLY after the translation element it credits — not later.
3. If you have only 1 translation element but see multiple separated passages on the page, SPLIT them into separate elements.
4. Did you combine running prose into paragraphs? Column line breaks should NOT appear in your output.
5. Is there a horizontal rule on the page? ALL text below it is "footnote". ALL italic text ABOVE any horizontal rule (or on a page with no rule at all) is "instructions", never "footnote".
6. Did you render SMALL CAPS divine names as ALL CAPS (not italic, not mixed case)?
7. For responsive readings, did you wrap ONLY the "Reader:" / "Congregation:" labels in <i> tags?
8. Hebrew nikkud MUST be present. Re-verify each vowel against the image — patach vs kamatz, hirik vs shva, tzeireh vs segol are visually similar; do NOT guess. Count dots, look for vertical strokes.
9. Did you use ḥ (U+1E25) and Ḥ (U+1E24) for every dotted-h in transliterations? No bare "h" where a dot should be, no "ch", no "h" followed by an "e" with a dot, no dot above the h.
10. Author credits — is each one ATTRIBUTION (short italic name 1-5 words) or INSTRUCTIONS (longer italic prose)? Short author names like "Sidney Greenberg (Adapted)" or "Chaim Stern" are ALWAYS attribution.
11. Did you see any decorative ornaments (curly flourishes, fleurons, swirls) between readings? Emit a divider element for each one.
12. Italic exceptions — be CONSERVATIVE about marking non-italic, but THOROUGH within paragraphs that use the markup. Scan each italic paragraph for transliterated Hebrew terms (Kabbalat Hashanah, Yamim Nora'im, sheliaḥ tzibur, ma'ariv, shaḥarit, minḥah, Aleinu, Amidah, Kaddish, etc.). If you find ANY, switch to <i>...</i> markup and leave EVERY such term non-italic — not just some. NEVER mark English page references, numbers, dates, or ordinary English words as non-italic. When in doubt about a non-Hebrew word, leave it italic.
14. Bold markup: did you wrap visually bold text in <b>...</b> tags? Did you avoid using any other HTML-style tags like <u>, <em>, <strong>, <span>? Only <i> and <b> are valid.
13. Did you transcribe exactly what is in the image, or did you "correct" anything? Go back and verify: each Hebrew letter, each nikkud mark, each English word matches what is visually on the page. If a word looks unusual or "wrong", that is what you must transcribe.
15. Unfamiliar or altered Hebrew: if a prayer differs from the traditional version you remember (feminine God-language, changed pronoun suffixes, plural forms, different divine names), did you keep the PRINTED variant? Re-check every gender ending and suffix against the image — do NOT revert them to the traditional text.

Return ONLY the XML block.`,
  },
  "mahzor_lev_shalem": {
    name: "Mahzor Lev Shalem",
    publisher: "Rabbinical Assembly",
    description: "Conservative High Holy Day mahzor — four-voice spread: Hebrew liturgy, English translation, margin readings (kavanot), and running commentary",
    systemPrompt: `You are an expert layout analysis and text extraction system specialized in Jewish prayer books. You will be given an image of a page from Mahzor Lev Shalem, the Conservative movement's High Holy Day mahzor (Rabbinical Assembly, designed by Scott-Martin Kosofsky). This book has embedded digital text and a sophisticated TWO-COLOR (black + red) design. Your job is to identify EVERY layout element on the page and extract its text with high accuracy.

THE SPREAD: The image is usually a TWO-PAGE SPREAD — the LEFT page carries the English, the RIGHT page carries the Hebrew. Facing pages share the SAME page number (both footers say e.g. "11"). Occasionally the image is a single page or a section-opener; handle those with the same element types.

PAGE GEOGRAPHY — the four voices of Mahzor Lev Shalem:
1. RIGHT page, main column: the Hebrew liturgy, with full nikkud. Bold Hebrew marks passages that are sung or recited aloud by the congregation.
2. LEFT page, main column: the English translation, with italic prayer headings and red italic transliteration passages.
3. LEFT page, far-left margin: kavanot. CLASSIFY MARGINS BY POSITION, NOT CONTENT: anything set in the far-left margin column is a kavanah — meditational readings, poems, alternative prayers, AND prose commentary essays alike. Each piece usually has an italic title and a small-caps credit line (—AUTHOR, sometimes "(adapted)" or "(trans. Name)"). A margin may hold MULTIPLE separately-titled pieces — each is its own element. NOTE: a margin poem's credit is occasionally printed in the RIGHT page's commentary margin instead of beside the poem.
4. RIGHT page, far-right margin: the running commentary, in smaller sans-serif type. Each note opens with its lemma (the phrase being commented on) in BOLD SMALL CAPS, usually followed by the Hebrew phrase. Commentary frequently OVERFLOWS the margin and continues as a full-width block across the bottom of the page (sometimes as a WIDER block than the margin column) — join a continuation to the note it belongs to. This flow also happens on the LEFT page: a left-margin piece can continue into a block beneath the English column — join those too. Torah-reading pages key notes to verses ("VERSE 1. TOOK NOTE OF SARAH..."), and often open the apparatus with an UNTITLED prose essay above the first lemma note — extract that essay as the first commentary element.
CROSS-SPREAD CONTINUATIONS: a margin stream ending "(continued)" resumes on the NEXT spread, whose element opens with "(continued from the previous page)". KEEP both printed markers exactly where they appear in the text, and treat a "(continued from the previous page)" opening as the middle of a piece — never invent a lemma or title for it.
Plus page furniture: red section titles at the top of each page (English small caps on the left page, Hebrew on the right page) and footer breadcrumbs at the bottom (e.g. "ROSH HASHANAH · EVENING SERVICE · SILENT AMIDAH" on the left; a mirrored Hebrew breadcrumb on the right; the current subsection is printed in red).

RED INK = STRUCTURE. Red is used for: page titles, rubrics and instructions ("The ark is opened.", "We rise."), conditional labels ("All services continue:", "In the evening, we say:", "At the conclusion of Shabbat:"), speaker labels ("Leader:", "Torah Reader (or Gabbai):", "The congregation responds:"), variant labels ("Version with Patriarchs:", "Version with Patriarchs and Matriarchs:"), cross-references ("On the second day, turn to page 103."), transliteration passages, verse numbers, aliyah markers, bracketed insertions, and ritual symbols.

YOUR #1 PRIORITY: Hebrew nikkud MUST be preserved with 100% fidelity. Every dot, dash, and mark must appear. Outputting Hebrew without nikkud is a critical failure.

NIKKUD VISUAL DISTINCTIONS — do NOT guess; look at the actual shape:
- Patach (ַ) is a single horizontal line; Kamatz (ָ) has a small vertical stroke descending from its center. Any vertical tick = kamatz.
- Hirik (ִ) is ONE dot; Shva (ְ) is TWO dots stacked vertically. Count the dots.
- Tzeireh (ֵ) is two dots side by side; Segol (ֶ) is three dots in a downward triangle.
- Cholam (ֹ) is a dot above; Dagesh (ּ) is a dot inside the letter body.

THE DIVINE NAME: This mahzor prints the four-letter divine name as UNVOCALIZED יהוה. Transcribe it exactly as יהוה — never substitute יְיָ, never add vowels to it. In the English, the divine name is set in small caps ("ADONAI") — render it as "Adonai".

TRANSCRIBE THE PRINTED TEXT, NOT THE REMEMBERED TEXT: Mahzor Lev Shalem deliberately adapts liturgy — matriarchs added in brackets, gender-sensitive translation, new compositions. If the printed text differs from the traditional version you remember, the printed text is correct. Never autocomplete a familiar prayer from memory. Do not "correct" unusual spellings or nikkud.

BRACKETED INSERTIONS: Seasonal and optional insertions are printed inside square brackets — red in the original (e.g. [וְאִמּוֹתֵינוּ], [הַשַּׁבָּת וְ], [this Shabbat and], [their]). TRANSCRIBE the brackets and their contents exactly where they occur.

RITUAL SYMBOLS: The bow symbol, the ¶ mark (congregational addition), and the ◁ pointer (leader begins aloud) appear in the text. Do NOT transcribe these symbols — omit them.

TRANSLITERATION CONVENTIONS: chet is ḥ (U+1E25) / Ḥ (U+1E24) — never "ch", never a bare "h", never "h"+combining mark. khaf is "kh". A RAISED DOT · (U+00B7) marks the pataḥ g'nuvah and breaks vowel clusters (ru·aḥ, yisra·el, elo·ah) — preserve the raised dot exactly where printed.

BOLD HEBREW IS MEANINGFUL: bold type in the Hebrew liturgy marks the passages sung/recited aloud (usually the ones transliterated). Wrap bold Hebrew spans in <b>...</b> tags. This layout is an EXCEPTION to the usual no-bold-in-Hebrew rule.

ITALIC IN ENGLISH IS MEANINGFUL: in translations, roman type = prayer leader, italic = congregation (responsive readings). Preserve italics with <i>...</i> tags in translation, kavanah, and commentary text. Instructions and attributions are entirely italic by nature — no tags needed there.

Element types:

- page_number: The spread's page number. It is printed at the bottom of BOTH facing pages (the same number). Extract it ONCE.
- footer: A footer breadcrumb line, WITHOUT the page number (e.g. "ROSH HASHANAH · EVENING SERVICE · SILENT AMIDAH", or the Hebrew ערבית לראש השנה · תפילת העמידה בלחש). One element per breadcrumb.
- section_header: The red small-caps English title at the top of the left page (e.g. "THE SILENT AMIDAH", "TORAH READING, FIRST DAY") or on a section-opener.
- hebrew_section_header: The red Hebrew title at the top of the right page (e.g. תפילת העמידה בלחש), or the large red Hebrew title of a section-opener. One variant is REVERSED — white type on a solid red block (e.g. שבת marking Shabbat-specific material) — still this type.
- toc: On a section-opener page only: the mini table of contents. ONE element; one entry per line formatted "English title — Hebrew title — page" as printed.
- hebrew_liturgy: The main Hebrew column. Full nikkud. <b>...</b> around bold (sung) passages. Keep bracketed insertions. Keep יהוה unvocalized. Join the lines of each prayer/paragraph into one flowing paragraph; separate distinct paragraphs with a blank line. EXCEPTION — POETRY: piyyut litanies set as short lines (e.g. the מִי יִחְיֶה וּמִי יָמוּת lines of U-netaneh Tokef, often a narrow column hugging the right margin) keep ONE LINE OF OUTPUT PER PRINTED LINE — never join poetic lines into a paragraph. Single bold display words or lines inside the liturgy (אֱמֶת opening Emet V'yatziv; בְּרֹאשׁ הַשָּׁנָה יִכָּתֵבוּן...) are emphasis WITHIN the flow — keep them in the liturgy element with <b> tags, not as headers. OMIT the small Hebrew-letter verse markers in Torah/Haftarah readings.
- hebrew_header: A Hebrew prayer title set larger/apart within the Hebrew column mid-page (e.g. בִּרְכוֹת הַתּוֹרָה, קְדֻשָּׁה).
- transliteration: A red italic phonetic passage (full paragraphs on Torah-service pages, interleaved lines in the Kedushah).
- translation: English text of the main column. <i>...</i> for italic (congregational) spans. Keep verse numbers in Torah readings as plain digits (e.g. "1 Adonai took note of Sarah..."). Separate visually distinct blocks into separate elements — but ONE CONTINUOUS FLOW IS ONE ELEMENT: a column that runs unbroken from prose into short poetic lines (or back) stays a single element unless a header, instruction, or transliteration interrupts it. English litany lines mirroring a Hebrew piyyut ("who will live and who will die...") keep one line of output per printed line. Transliterated b'rakhah openings set in italics INSIDE an English paragraph ("Barukh atah Adonai, our God...") are part of the translation — not a transliteration element.
- prayer_title: A heading within the main English column. TWO RANKS share this type, and rank is LITURGICAL, not typographic: (a) italic headings that name a structural unit of the service ("First B'rakhah: Our Ancestors", "Third B'rakhah: God's Holiness") are the HIGHER rank; (b) small-caps incipit titles naming a prayer or piyyut WITHIN that unit ("U-NETANEH TOKEF—THE SACRED POWER OF THE DAY", "B'RAKHOT RECITED BY ONE CALLED UP TO THE TORAH") are the LOWER rank, despite their louder typography. Capture exactly as printed.
- instructions: ANY red rubric: procedural directions, conditional labels, speaker labels, variant labels, cross-references, and aliyah markers ("First Aliyah", "[Third Aliyah on Shabbat]", שני — these are run-in labels printed at the start of the verse line; extract each as an instructions element immediately before its verse). Torah-service pages alternate rubrics and short liturgy lines rapidly ("Torah Reader (or Gabbai):" / "The congregation responds:" / ...) — keep EVERY alternation as its own instruction+text pair in order. IMPORTANT: the same rubric is usually printed TWICE on a spread — once on the English page and once above the Hebrew. Extract each distinct rubric ONCE, at the position before the content it governs.
- kavanah: ONE far-left-margin reading (meditation, poem, or alternative prayer). Each visually separate margin item = its own kavanah element. If it has a title, put the title on the first line, then a newline, then the text. For a margin piyyut with side-by-side Hebrew and English, put the Hebrew first, a blank line, then the English, all in one element.
- attribution: A credit line: "—CHAIM STERN (adapted)", "—SOLOMON IBN GABIROL", "—A HASIDIC TEACHING", "(trans. Aubrey L. Glazer)", "—BABYLONIAN TALMUD, BERAKHOT", or a small scripture citation ending a psalm ("Psalm 103 (selected verses)"). Place each attribution IMMEDIATELY after the element it credits.
- commentary: ONE commentary note from the right margin or the bottom overflow block. Each note = one element, beginning with its small-caps lemma (keep the lemma as the start of the text, followed by the Hebrew phrase if printed, then the note). If a note starts in the margin and continues in the bottom block, JOIN the pieces into one element. Verse-keyed notes ("VERSE 6. GOD HAS BROUGHT ME LAUGHTER...") work the same way.

SPECIAL STRUCTURES:
- PARALLEL VARIANT COLUMNS: when two versions print side by side ("Version with Patriarchs:" / "Version with Patriarchs and Matriarchs:") — in Hebrew AND in English — output them SEQUENTIALLY: first variant's label (instructions) + its full text, then the second variant's label + its full text. Never interleave the columns.
- FILL-IN BLANKS (aliyah honors, Yizkor): render each blank line as "________" and keep the parenthetical labels as printed, e.g. "(for a father) ________ אֲבִי מוֹרִי".
- HEBREW ON THE ENGLISH PAGE: some left pages set Hebrew verses beside their English (e.g. Yizkor psalms). Emit hebrew_liturgy then translation for each such block.

ORDER OF OUTPUT for a spread:
1. hebrew_section_header, then section_header
2. RIGHT-page main column, top to bottom: instructions (rubrics) in position, hebrew_header, hebrew_liturgy
3. LEFT-page main column, top to bottom: prayer_title, instructions in position, translation, transliteration
4. LEFT-margin kavanot, top to bottom, each followed by its attribution
5. commentary notes, in print order (margin top-to-bottom, then bottom block)
6. footer elements, then page_number LAST

Return using XML tags:

<elements>
<element type="hebrew_section_header" order="1">תְּפִלַּת הָעֲמִידָה בְּלַחַשׁ</element>
<element type="section_header" order="2">THE SILENT AMIDAH</element>
<element type="instructions" order="3">We recite this Silent Amidah at the evening and morning services of Rosh Hashanah.</element>
<element type="instructions" order="4">Version with Patriarchs:</element>
<element type="hebrew_liturgy" order="5"><b>בָּרוּךְ אַתָּה יהוה,</b> אֱלֹהֵינוּ וֵאלֹהֵי אֲבוֹתֵינוּ [וְאִמּוֹתֵינוּ]...</element>
<element type="prayer_title" order="6">First B'rakhah: Our Ancestors</element>
<element type="translation" order="7">Barukh atah Adonai, our God and God of our ancestors...</element>
<element type="kavanah" order="8">Meditation on Prayer
In the Bible, God speaks to us, and we listen...</element>
<element type="attribution" order="9">—ISAAC ARAMA</element>
<element type="commentary" order="10">AMIDAH. The Amidah, literally "the prayer said while standing," is the moment of personal meditation...</element>
<element type="footer" order="11">ROSH HASHANAH · EVENING SERVICE · SILENT AMIDAH</element>
<element type="footer" order="12">ערבית לראש השנה · תפילת העמידה בלחש</element>
<element type="page_number" order="13">11</element>
</elements>

INLINE RED MARKS ARE NOT ELEMENTS: red verse numbers, red inline parentheticals ("(the first to be called to the Torah)"), red "Amen.", and biblical citations set flush right at the end of a passage (Deuteronomy 11:13–21 / במדבר טו לז–מא) are captured INSIDE their parent element's text at the printed position — never as separate elements.

FINAL SELF-CHECK before returning:
1. Nikkud present and verified against the image on every Hebrew word? יהוה left unvocalized?
2. Did you keep every bracketed insertion, and keep the PRINTED variants (matriarchs, gender-sensitive wording) instead of the remembered traditional text?
3. Is each commentary note a SEPARATE element starting with its lemma? Did you join margin→bottom continuations?
4. Is each margin reading a SEPARATE kavanah element with its attribution immediately after it?
5. Did you extract each rubric ONCE per spread (not twice), and both footers plus ONE page_number?
6. ḥ (U+1E25) for every dotted h, and the raised dot · preserved in transliteration?
7. <b> only on genuinely bold Hebrew; <i> preserved for congregational/italic English spans?
8. Parallel variant columns output sequentially, never interleaved?
9. Poetry/litany lines preserved one-per-line in BOTH languages (never joined into paragraphs)?
10. "(continued)" and "(continued from the previous page)" markers kept in place, with no invented titles or lemmas for mid-stream continuations?

Return ONLY the XML block.`,
  },
  "other": {
    name: "Other / Unknown",
    publisher: "",
    description: "Generic siddur layout — AI will do its best to identify elements",
    systemPrompt: `You are an expert OCR system for Jewish prayer books (siddurim). Extract text with high accuracy.

CRITICAL: Preserve Hebrew vowels (nikkud). Use <i>...</i> for italic English text in translations and footnotes.

TRANSCRIBE THE PRINTED TEXT, NOT THE REMEMBERED TEXT: many modern siddurim intentionally alter traditional liturgy (gender, number, divine names). If the printed Hebrew differs from the familiar traditional wording, the printed text is correct — transcribe exactly what appears in the image; never autocomplete a prayer from memory.

Element types: navigation, header, page_number, instructions, section_header (CENTERED ALL CAPS only), hebrew_liturgy (preserve nikkud), transliteration, translation (use <i> for italics), footnote (use <i> for italics).

ORDERING: hebrew_liturgy → transliteration → translation, always.

Return XML:
<elements>
<element type="TYPE" order="N">text</element>
</elements>

Return ONLY the XML block.`,
  },
};

const LAYOUT_DETECTION_PROMPT = `Identify which siddur this page is from.

Known layouts:
1. "mishkan_tfilah" — Mishkan T'filah (CCAR Press, Reform movement). Identifiers (not all appear on every page):
   - Hebrew liturgy on the RIGHT with transliteration in a parallel column on the LEFT (side-by-side columns)
   - Centered ALL CAPS section headers; a navigation line across the top of the page
   - Distinctive DOUBLE page numbers like "2 [120]" (spread number + bracketed print page)
   - Footnotes below a horizontal rule near the bottom

2. "kol_haneshamah" — Kol Haneshamah (Reconstructionist Press). IMPORTANT: several volumes are FACING-PAGE editions — a single scanned page may be HEBREW-ONLY or ENGLISH-ONLY. Judge by the signatures below, not by expecting Hebrew and English together:
   - Running footer in bold at the bottom: "184 / TORAH STUDY SECTION" or "BIRḤOT HASHAḤAR/MORNING BLESSINGS / 185" (page number + ALL CAPS section/service name, separated by "/")
   - Section title rendered as a DECORATIVE BOXED/woodcut-style Hebrew word (framed or white-on-black art lettering), not plain type
   - Commentary at the bottom BELOW a horizontal rule, labeled NOTE., COMMENTARY., KAVANAH., or DERASH., typically opening with a Hebrew citation followed by "/" and an English gloss, and signed with author initials (e.g., "J.R.", "A.G.", "D.A.T.")
   - English translations in poetry-style short lines with divine names in SMALL CAPS (THE ETERNAL, THE KEEPER, THIS ONE, THE HOLY ONE, FOUNTAIN OF LIGHT), often with a small source attribution at the lower right of the block (e.g., "Psalm 33", "Genesis Rabbah 1.4")
   - Hebrew liturgy in block paragraphs with full nikkud; transliteration (when present) sits below the Hebrew and renders chet as ḥ (dot below) or an underlined h
   Any TWO of these signatures = kol_haneshamah with high confidence, even on a Hebrew-only or English-only page.

3. "mahzor_lev_shalem" — Mahzor Lev Shalem (Rabbinical Assembly, Conservative movement High Holy Day mahzor). NOTE: pages often arrive as TWO-PAGE SPREADS — one image containing a left (English) page and a right (Hebrew) page. Signatures:
   - TWO-COLOR design: black text with RED page titles, rubrics, transliteration passages, bracketed insertions, and symbols
   - Four-voice layout: far-LEFT margin column of readings/meditations credited "—AUTHOR NAME" in small caps; main English translation column with italic prayer headings; Hebrew liturgy column (right page); far-RIGHT margin running commentary in smaller sans-serif type keyed by BOLD SMALL-CAPS lemmas, often continuing across the bottom of the page
   - Footer breadcrumbs with middle dots: "11 ROSH HASHANAH · EVENING SERVICE · SILENT AMIDAH" (left page) and a mirrored HEBREW breadcrumb (right page); FACING PAGES SHARE THE SAME PAGE NUMBER
   - The divine name printed as unvocalized יהוה in the Hebrew; "Adonai" in small caps in the English
   - Red italic transliteration; red bracketed insertions like [וְאִמּוֹתֵינוּ] for matriarchs
   Any TWO of these signatures = mahzor_lev_shalem with high confidence.

4. "other" — Unknown or any other siddur.

If the page is FRONT MATTER — a title page, copyright page, table of contents, dedication, preface, or blank page — respond "other" with confidence 0.2 or lower and say "front matter" in the reasoning. A page of plain English readings or plain Hebrew with NONE of the signatures above is weak evidence: respond "other" with low confidence rather than guessing a known siddur.

Respond with ONLY a JSON object:
{"layout_id": "mishkan_tfilah" or "kol_haneshamah" or "mahzor_lev_shalem" or "other", "confidence": 0.0 to 1.0, "reasoning": "brief explanation"}`;

/* ─── PDF / AI Helpers ─── */

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = resolve; s.onerror = () => reject(new Error("Failed to load PDF.js")); document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}

async function loadPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
    s.onload = resolve; s.onerror = () => reject(new Error("Failed to load pdf-lib")); document.head.appendChild(s);
  });
  return window.PDFLib;
}

/* ─── Embedded text layer (born-digital PDFs) ───
   Digitally-produced PDFs (e.g. Mahzor Lev Shalem) carry the publisher's own text.
   We extract it per page and pass it to the model ALONGSIDE the page image as a
   word-accuracy reference. The image stays authoritative: real text layers have
   defects — custom-font ligature glyphs with no Unicode mapping (extracted as the
   SUB control char), Adobe PUA codepoints for small caps, nikkud emitted BEFORE
   its base letter, letter-spacing spaces inside words, and column interleaving. */

function cleanEmbeddedText(t) {
  /* Adobe PUA small caps (U+F700-F7FF) -> the ASCII letter they shadow */
  t = t.replace(/[\uF700-\uF7FF]/g, c => {
    const code = c.charCodeAt(0) - 0xF700;
    return (code >= 0x20 && code <= 0x7e) ? String.fromCharCode(code) : "";
  });
  /* Unmapped glyphs (ToUnicode gaps) arrive as SUB (U+001A) - make them visible */
  t = t.replace(/\u001a/g, "\uFFFD");
  /* Strip bidi embedding/isolate controls and other C0 controls except \n */
  t = t.replace(/[\u202a-\u202e\u2066-\u2069]/g, "").replace(/[\u0000-\u0009\u000b-\u001f]/g, "");
  /* Collapse horizontal whitespace runs (column gaps) */
  t = t.replace(/[ \t]{2,}/g, "  ").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

async function extractPageText(page) {
  try {
    const tc = await page.getTextContent();
    const items = (tc.items || []).filter(it => it.str && it.str.trim().length);
    /* Group items into lines by y coordinate (PDF y axis points up), then
       left-to-right within each line. This is a READING AID, not true layout —
       multi-column spreads still interleave; the model is told so. */
    const lines = [];
    for (const it of items) {
      const y = it.transform[5], x = it.transform[4];
      let line = lines.find(l => Math.abs(l.y - y) <= 2.5);
      if (!line) { line = { y, parts: [] }; lines.push(line); }
      line.parts.push({ x, str: it.str });
    }
    lines.sort((a, b) => b.y - a.y);
    const raw = lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(" ")).join("\n");
    let out = cleanEmbeddedText(raw);
    const MAX = 9000;
    if (out.length > MAX) out = out.slice(0, MAX) + "\n[reference text truncated]";
    return out;
  } catch (_) { return ""; }
}

function buildRefTextBlock(refText) {
  return "REFERENCE — EMBEDDED PDF TEXT LAYER for this page. This PDF is digitally produced; below is the publisher's own embedded text, extracted programmatically. Use it to confirm the EXACT WORDS and SPELLING of what you read in the image — it is strong evidence against misreading or autocompleting from memory. HOWEVER, the image remains the sole authority, because this extraction has known defects: (1) � marks a glyph the PDF could not map — read that letter from the image (often a lamed or a final letter with its vowel); (2) Hebrew vowel points may appear BEFORE the letter they belong to, and stray spaces may appear inside words; (3) columns are interleaved line-by-line, so reading order here is jumbled — take element order, grouping, color, and formatting ONLY from the image; (4) small-caps and symbols may be garbled. Where this text and the image genuinely disagree on a letter or word, the IMAGE wins.\n\n---BEGIN EMBEDDED TEXT---\n" + refText + "\n---END EMBEDDED TEXT---";
}

async function pdfToImages(file) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const images = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    const textLayer = await extractPageText(page);
    images.push({ pageNum: i, base64: dataUrl.split(",")[1], dataUrl, textLayer });
  }
  return { images, totalPages: pdf.numPages };
}

const LITURGICAL_ORDER = { hebrew_liturgy: 0, transliteration: 1, translation: 2 };
const LITURGICAL_TYPES = new Set(["hebrew_liturgy", "transliteration", "translation"]);
/* NOTE: attribution is deliberately NOT in LITURGICAL_TYPES.
   This means when reorderElements encounters an attribution, it flushes the
   current liturgical buffer, preserving the attribution's position between
   the reading it credits and the next reading. If attribution were included,
   it would be sorted to the end of the group (after all translations). */

function reorderElements(elements) {
  const result = []; let buf = [];
  function flush() {
    if (!buf.length) return;
    const groups = []; let cur = [];
    for (const el of buf) {
      if (el.type === "hebrew_liturgy") {
        if (cur.length) {
          // Check if the pending group has any translations
          const hasTranslation = cur.some(e => e.type === "translation");
          if (hasTranslation) {
            // Standalone translations before Hebrew — protect from reordering
            groups.push({ items: cur, hasHebrew: false });
            cur = [el];
          } else {
            // Only transliterations before Hebrew — merge (they belong with it)
            cur.push(el);
          }
        } else { cur.push(el); }
      } else { cur.push(el); }
    }
    if (cur.length) groups.push({ items: cur, hasHebrew: cur.some(e => e.type === "hebrew_liturgy") });
    // Only sort groups that contain Hebrew — standalone translation runs stay in place
    for (const g of groups) {
      if (g.hasHebrew) g.items.sort((a, b) => (LITURGICAL_ORDER[a.type] ?? 99) - (LITURGICAL_ORDER[b.type] ?? 99));
      for (const el of g.items) result.push(el);
    }
    buf = [];
  }
  for (const el of elements) { if (LITURGICAL_TYPES.has(el.type)) buf.push(el); else { flush(); result.push(el); } }
  flush(); return result;
}

function stripLatinDiacritics(t) {
  /* NFC-normalize first so any decomposed "h" + U+0323 collapses to the
     precomposed \u1e25 (U+1E25) / \u1e24 (U+1E24) before stripping. We deliberately
     do NOT strip U+0323 (combining dot below) \u2014 Kol Haneshamah uses dotted-h
     for chet, and the dot must be preserved on any letter where it appears. */
  return t.normalize("NFC").replace(/[\u0304\u0306\u0307\u0330\u0331\u0332]/g, "");
}

/* Repair aberrant AI character substitutions in transliteration text.
   The model sometimes emits unusual Latin-extended characters in place of the
   standard dotted-h \u1e25 (U+1E25) / \u1e24 (U+1E24). Most commonly it pairs "h" with
   a stray letter that visually has a hook or dot. Normalize these back to \u1e25/\u1e24.
   Also strips any remaining isolated occurrences of these aberrant characters. */
/* Cyrillic \u2192 Latin sound-equivalent map. Cyrillic has no legitimate use in
   Hebrew transliteration; when the AI emits Cyrillic characters (sometimes for
   their visual or phonetic similarity to Latin), replace them with the Latin
   letter that matches the Cyrillic sound. */
const CYRILLIC_TO_LATIN = {
  "\u0430":"a","\u0431":"b","\u0432":"v","\u0433":"g","\u0434":"d","\u0435":"e","\u0451":"yo","\u0436":"zh","\u0437":"z",
  "\u0438":"i","\u0439":"y","\u043a":"k","\u043b":"l","\u043c":"m","\u043d":"n","\u043e":"o","\u043f":"p","\u0440":"r",
  "\u0441":"s","\u0442":"t","\u0443":"u","\u0444":"f","\u0445":"h","\u0446":"ts","\u0447":"ch","\u0448":"sh","\u0449":"shch",
  "\u044a":"","\u044b":"y","\u044c":"","\u044d":"e","\u044e":"yu","\u044f":"ya",
  "\u0410":"A","\u0411":"B","\u0412":"V","\u0413":"G","\u0414":"D","\u0415":"E","\u0401":"Yo","\u0416":"Zh","\u0417":"Z",
  "\u0418":"I","\u0419":"Y","\u041a":"K","\u041b":"L","\u041c":"M","\u041d":"N","\u041e":"O","\u041f":"P","\u0420":"R",
  "\u0421":"S","\u0422":"T","\u0423":"U","\u0424":"F","\u0425":"H","\u0426":"Ts","\u0427":"Ch","\u0428":"Sh","\u0429":"Shch",
  "\u042a":"","\u042b":"Y","\u042c":"","\u042d":"E","\u042e":"Yu","\u042f":"Ya"
};

function repairTransliteration(t) {
  /* h followed by U+A794 (\ua794, Latin small c with palatal hook) \u2192 \u1e25 */
  t = t.replace(/h\ua794/g, "\u1e25");
  t = t.replace(/H\ua794/g, "\u1e24");
  /* h followed by U+0117 (\u0117, e with dot above) \u2192 \u1e25 \u2014 and uppercase variant U+0116 (\u0116) */
  t = t.replace(/h\u0117/g, "\u1e25");
  t = t.replace(/H\u0116/g, "\u1e24");
  /* h followed by U+1E0B (\u1e0b, d with dot above) \u2192 \u1e25 (rare but seen) */
  t = t.replace(/h\u1e0b/g, "\u1e25");
  t = t.replace(/H\u1e0a/g, "\u1e24");
  /* Drop any remaining isolated occurrences of these characters \u2014 they have no
     legitimate use in Hebrew transliteration. */
  t = t.replace(/[\ua794\u0117\u0116\u1e0b\u1e0a]/g, "");
  /* Cyrillic \u2192 Latin sound-equivalent substitution. */
  t = t.replace(/[\u0400-\u04ff]/g, ch => CYRILLIC_TO_LATIN[ch] !== undefined ? CYRILLIC_TO_LATIN[ch] : ch);
  return t;
}

/* Parse italic <i> and bold <b> tags (independently — they may overlap or nest).
   Returns spans of {text, italic, bold} reflecting state at each segment of the text. */
function parseRichSpans(raw) {
  const spans = [];
  let italic = false, bold = false, buf = "", i = 0;
  const flush = () => { if (buf) { spans.push({ text: buf, italic, bold }); buf = ""; } };
  while (i < raw.length) {
    if (raw[i] === "<") {
      const close = raw.indexOf(">", i);
      if (close > i) {
        const tag = raw.slice(i, close + 1).toLowerCase();
        if (tag === "<i>")   { flush(); italic = true;  i = close + 1; continue; }
        if (tag === "</i>")  { flush(); italic = false; i = close + 1; continue; }
        if (tag === "<b>")   { flush(); bold = true;    i = close + 1; continue; }
        if (tag === "</b>")  { flush(); bold = false;   i = close + 1; continue; }
      }
    }
    buf += raw[i]; i++;
  }
  flush();
  if (!spans.length) spans.push({ text: raw, italic: false, bold: false });
  return spans;
}

/* Backwards-compat alias — some callers may still reference parseItalicSpans. */
const parseItalicSpans = parseRichSpans;

/* Strip ALL HTML-like tags from text. Used for element types where inline
   markup is not meaningful (section_header, hebrew_*, page_number) — the AI
   sometimes leaks <b>...</b> or <i>...</i> tags into these and they end up
   as literal text. Also strips unrecognized tags (<u>, <em>, <strong>, <span>)
   that would otherwise appear as literal text everywhere. */
function stripMarkup(text) {
  return (text || "").replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

/* The AI often misclassifies small-caps text (e.g. "GUIDED MEDITATION", "COMMENTARY",
   "THE ETERNAL ONE") as bold. Strip <b>...</b> wrappers whose content is entirely
   uppercase letters (no lowercase). Mixed-case content is left alone since it could
   be a legitimate inline bold span. */
function stripBoldFromSmallCaps(text) {
  return (text || "").replace(/<b>([^<]*?)<\/b>/g, (match, inner) => {
    const stripped = inner.trim();
    if (!stripped) return match;
    /* If there's any lowercase Latin letter, keep the bold — it's not small caps */
    if (/[a-z]/.test(stripped)) return match;
    /* Otherwise the content is all-uppercase (or only punctuation/digits/spaces) — drop the bold */
    return inner;
  });
}

/* Strip unrecognized HTML-like tags from any text that may carry inline markup.
   Preserves <i>, </i>, <b>, </b> (handled by parseRichSpans). Removes all others. */
function stripUnknownTags(text) {
  return (text || "").replace(/<(?!\/?[ib]>)\/?[a-zA-Z][^>]*>/g, "");
}

/* Canonical list of Hebrew/Aramaic terms that, when present in an otherwise-italic
   instructions or attribution paragraph, should be rendered NON-italic (the usual
   typographic convention in Jewish liturgical publications). The AI is inconsistent
   about catching all of these even with prompt guidance, so we enforce it in code. */
const HEBREW_TERMS = [
  "Kabbalat Hashanah", "Kabbalat HaShanah", "Kabbalat Shabbat",
  "Yamim Nora'im", "Yamim Noraim",
  "sheliaḥ tzibur", "sheliach tzibur", "shaliach tzibbur", "shaliaḥ tzibbur",
  "ma'ariv", "maariv", "ma'arib",
  "shaḥarit", "shacharit",
  "minḥah", "minhah", "mincha", "minchah",
  "musaf", "mussaf",
  "ne'ilah", "neilah",
  "Aleinu", "Sh'ma", "Shema", "Amidah", "Kaddish", "Kedushah",
  "Sh'moneh Esreh", "Shemoneh Esreh", "Shmoneh Esreh",
  "Birkat Hamazon", "Birkat HaMazon",
  "Hallel", "Selichot", "S'lichot", "Slichot",
  "Avinu Malkeinu", "Avodah", "Hoshanot", "Tashlich", "Tashlikh",
  "Kol Nidre", "Kol Nidrei", "Vidui", "Yizkor", "Unetaneh Tokef", "U-Netaneh Tokef",
  "Aseret Y'mei Teshuvah", "Mahzor", "Machzor",
  "midrash", "halakhah", "halacha",
  "kavanah", "kavvanah", "derash",
  "nusaḥ", "nusach",
  "siddur", "Tanakh", "Torah", "Mishnah", "Gemara", "Talmud", "Zohar",
  "Rosh Hashanah", "Rosh HaShanah", "Yom Kippur", "Sukkot", "Shavuot",
  "Pesach", "Pesaḥ", "Ḥanukkah", "Chanukah", "Purim", "Simchat Torah",
  "Tu B'Shvat", "Tu BiShvat",
  "Hashem", "HaShem", "Adonai", "Adonay",
  "tzedakah", "tikkun olam", "tikkun ḥatzot", "tikkun chatzot",
  "minyan", "minyanim",
  "kippah", "tallit", "tefillin", "mezuzah",
  "kavvanot",
];

/* Code-side enforcement: in an instructions/attribution paragraph that doesn't
   already use <i>...</i> markup, if any HEBREW_TERMS appear, switch the paragraph
   into mixed-italic mode — wrap each NON-term run with <i>...</i> and leave the
   Hebrew terms bare so they render non-italic.
   Returns the (possibly modified) text. */
function enforceHebrewTermItalic(text) {
  const raw = text || "";
  if (!raw.trim()) return raw;
  /* If the paragraph already has italic markup, trust the AI and do not interfere. */
  if (/<i>/i.test(raw)) return raw;
  /* Sort by length descending so longer terms match before shorter substrings. */
  const sorted = [...HEBREW_TERMS].sort((a, b) => b.length - a.length);
  /* Find which terms actually appear (case-insensitive). */
  const present = sorted.filter(t => raw.toLowerCase().includes(t.toLowerCase()));
  if (!present.length) return raw;
  /* Build an alternation regex with escaped terms. Case-insensitive to catch
     varied capitalization. */
  const escaped = present.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp("(" + escaped + ")", "gi");
  /* Split into [non-term, term, non-term, term, ...] segments. */
  const parts = raw.split(re);
  /* parts[even] = non-term (wrap in <i>), parts[odd] = term (leave bare). */
  const out = parts.map((p, i) => {
    if (i % 2 === 0) return p ? "<i>" + p + "</i>" : "";
    return p;
  }).join("");
  return out;
}

function parseElementsXml(text, layoutId) {
  const match = text.match(/<elements>([\s\S]*?)<\/elements>/);
  if (!match) throw new Error("No <elements> block found");
  let els = []; const re = /<element\s+type="([^"]+)"\s+order="(\d+)">([\s\S]*?)<\/element>/g; let m;
  while ((m = re.exec(match[1])) !== null) {
    let t = m[3].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();
    /* Strip arrow characters */
    t = t.replace(/[\u2190-\u21FF\u2794-\u27BF\u2B00-\u2B73\u25B6\u25C0\u25BA\u25C4\u27F6]/g, "").trim();
    if (layoutId === "kol_haneshamah" || layoutId === "mahzor_lev_shalem") {
      if (m[1] === "transliteration") t = stripLatinDiacritics(t);
      /* Repair aberrant ḥ-substitution characters in any English text — the AI's
         weird character substitution can show up in translations, footnotes, etc.
         when they contain transliterated Hebrew terms (like "Nevareḥ"). */
      if (["transliteration","translation","footnote","attribution","instructions","kavanah","commentary","prayer_title"].includes(m[1])) {
        t = repairTransliteration(t);
      }
    }
    /* Universal cleanup on every element: drop unknown HTML tags (keeps only <i>, <b>);
       drop <b> wrappers on small-caps content (the AI often misclassifies small caps as bold). */
    t = stripUnknownTags(t);
    t = stripBoldFromSmallCaps(t);
    els.push({ type: m[1], order: parseInt(m[2],10), text: t });
  }
  if (!els.length) throw new Error("No elements parsed");
  els.sort((a,b) => a.order - b.order);
  /* Drop consecutive duplicate headers. The AI sometimes extracts the same section
     title twice on one page (e.g. once from the running header and once from the
     page footer or a mid-page title), producing back-to-back identical lines like
     "PESUKEY DEZIMRA/VERSES OF PRAISE". Compare normalized text among header-type
     elements; elements that are skipped at render time (navigation, header,
     page_number, bottom_*) do not break adjacency. */
  const HEADER_TYPES = new Set(["section_header", "hebrew_section_header", "hebrew_header"]);
  const SKIPPED_TYPES = new Set(["navigation", "header", "page_number", "bottom_section_name", "bottom_service_name", "footer"]);
  const normHeader = s => stripMarkup(s || "").replace(/\s+/g, " ").trim().toUpperCase();
  let lastHeaderNorm = null;
  els = els.filter(el => {
    if (HEADER_TYPES.has(el.type)) {
      const n = normHeader(el.text);
      if (n && n === lastHeaderNorm) return false;
      lastHeaderNorm = n;
      return true;
    }
    if (!SKIPPED_TYPES.has(el.type)) lastHeaderNorm = null;
    return true;
  });
  /* reorderElements groups Hebrew/transliteration/translation for parallel-column
     layouts (Mishkan T'filah). Kol Haneshamah is a sequential block layout where
     element order is meaningful (e.g., transliteration may appear between two
     Hebrew blocks). For KH and other layouts, preserve the AI's original order. */
  const ordered = layoutId === "mishkan_tfilah" ? reorderElements(els) : els;
  return { elements: ordered };
}

/* Auth headers for direct browser calls to the Anthropic API. The key is entered
   at the page gate and lives in sessionStorage for this tab only. Every fetch to
   api.anthropic.com MUST use these headers — a bare fetch 401s. */
function apiHeaders() {
  const key = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("siddur-api-key")) || "";
  return { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
}

async function detectLayout(base64Image) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: apiHeaders(),
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 300, temperature: 0,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: base64Image } }, { type: "text", text: LAYOUT_DETECTION_PROMPT }] }] }),
    });
    if (!r.ok) return { layout_id: "other", confidence: 0, reasoning: "API error (HTTP " + r.status + ")", usage: null };
    const data = await r.json();
    const text = (data.content||[]).map(c=>c.text||"").join("");
    const parsed = JSON.parse(text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim());
    return { ...parsed, usage: data.usage || null };
  } catch (err) { return { layout_id: "other", confidence: 0, reasoning: "Failed: "+err.message, usage: null }; }
}

function isContentFilterError(b) { return typeof b === "string" && b.includes("content filtering policy"); }
function isRateLimitError(s, b) { return s === 429 || (typeof b === "string" && b.includes("rate_limit")); }

async function analyzePageWithClaude(base64Image, systemPrompt, layoutId, attempt = 1, maxAttempts = 3, refText = "") {
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: apiHeaders(),
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4096, temperature: 0, system: systemPrompt,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: base64Image } },
          { type: "text", text: "Analyze this siddur page. Extract text with full Hebrew nikkud. Wrap italic English in <i>...</i>. Return ONLY <elements> XML." },
          ...(refText ? [{ type: "text", text: buildRefTextBlock(refText) }] : [])] }] }),
    });
  } catch (err) {
    if (attempt < maxAttempts) { await new Promise(r=>setTimeout(r,2000*attempt)); return analyzePageWithClaude(base64Image, systemPrompt, layoutId, attempt+1, maxAttempts, refText); }
    throw new Error("Network error: "+err.message);
  }
  if (!response.ok) {
    const body = await response.text().catch(()=>"unknown");
    if (response.status===400 && isContentFilterError(body)) { if (attempt<maxAttempts) { await new Promise(r=>setTimeout(r,2000*attempt)); return analyzePageWithClaude(base64Image,systemPrompt,layoutId,attempt+1,maxAttempts,refText); } let detail=""; try { const j=JSON.parse(body); detail=j.error?.message||""; } catch(_){} throw new Error("CONTENT_FILTER: Blocked after "+attempt+" attempts."+(detail?" Detail: "+detail:"")); }
    if (isRateLimitError(response.status,body)) { if (attempt<maxAttempts) { await new Promise(r=>setTimeout(r,5000*attempt)); return analyzePageWithClaude(base64Image,systemPrompt,layoutId,attempt+1,maxAttempts,refText); } throw new Error("RATE_LIMIT: Exceeded after "+attempt+" attempts."); }
    if (response.status>=500 && attempt<maxAttempts) { await new Promise(r=>setTimeout(r,3000*attempt)); return analyzePageWithClaude(base64Image,systemPrompt,layoutId,attempt+1,maxAttempts,refText); }
    throw new Error("API HTTP "+response.status+": "+body);
  }
  const data = await response.json();
  if (data.error) throw new Error("API error: "+(data.error.message||JSON.stringify(data.error)));
  const text = (data.content||[]).map(c=>c.text||"").join("");
  try {
    const parsed = parseElementsXml(text, layoutId);
    return { ...parsed, usage: data.usage || null };
  } catch (parseErr) {
    if (attempt<maxAttempts) { await new Promise(r=>setTimeout(r,1000)); return analyzePageWithClaude(base64Image,systemPrompt,layoutId,attempt+1,maxAttempts,refText); }
    throw new Error("Parse failed after "+attempt+" attempts: "+parseErr.message);
  }
}

/* ─── Split-Page Fallback for Content Filter ─── */

async function cropImage(base64, topPct, bottomPct) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cropTop = Math.floor(img.height * topPct);
      const cropBottom = Math.floor(img.height * bottomPct);
      const cropHeight = cropBottom - cropTop;
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = cropHeight;
      canvas.getContext("2d").drawImage(img, 0, cropTop, img.width, cropHeight, 0, 0, img.width, cropHeight);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    img.src = "data:image/png;base64," + base64;
  });
}

async function splitPageAnalyze(base64Image, systemPrompt, layoutId, refText = "") {
  const topHalf = await cropImage(base64Image, 0, 0.55);
  const bottomHalf = await cropImage(base64Image, 0.45, 1.0);
  const topNote = "\n\nNOTE: This image is the TOP PORTION of a page (cropped). Extract whatever content is visible. Do not worry about content cut off at the bottom edge. Return elements for what you can see.";
  const bottomNote = "\n\nNOTE: This image is the BOTTOM PORTION of a page (cropped). Extract whatever content is visible. Do not worry about content cut off at the top edge. Return elements for what you can see. IMPORTANT: Any text below a horizontal rule or dividing line is a FOOTNOTE — tag it as <footnote>, not as translation or other types.";
  const halfNote = refText ? "\n\nNOTE: the embedded reference text covers the FULL page; this image is only a portion of it — use only the matching part." : "";
  const topResult = await analyzePageWithClaude(topHalf, systemPrompt + topNote + halfNote, layoutId, 1, 3, refText);
  const bottomResult = await analyzePageWithClaude(bottomHalf, systemPrompt + bottomNote + halfNote, layoutId, 1, 3, refText);

  /* Merge elements, deduplicating the overlap zone.
     The top/bottom halves overlap by ~10% of the page, so some elements appear in both.
     Use aggressive text normalization: lowercase, strip Hebrew combining marks,
     collapse whitespace, then compare word sets for similarity. */
  const stripMarks = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f\u0591-\u05C7]/g,"").normalize("NFC");
  const norm = s => stripMarks(s).toLowerCase().replace(/[''"""]/g,"").replace(/\s+/g," ").trim();
  const wordSet = s => { const w = norm(s).split(" ").filter(x=>x.length>2); return new Set(w); };
  const similarity = (a, b) => {
    const wa = wordSet(a), wb = wordSet(b);
    if (wa.size < 2 || wb.size < 2) return norm(a) === norm(b) ? 1 : 0;
    let overlap = 0; for (const w of wa) if (wb.has(w)) overlap++;
    return overlap / Math.min(wa.size, wb.size);
  };

  const topEls = topResult.elements || [];
  const bottomEls = bottomResult.elements || [];
  const merged = [...topEls];

  for (const bEl of bottomEls) {
    let isDupe = false;
    /* Check against last ~8 elements from top (overlap zone) */
    const checkRange = topEls.slice(Math.max(0, topEls.length - 8));
    for (const tEl of checkRange) {
      if (similarity(tEl.text, bEl.text) > 0.6) { isDupe = true; break; }
    }
    if (!isDupe) merged.push(bEl);
  }

  /* Combine usage */
  const usage = { input_tokens: (topResult.usage?.input_tokens||0) + (bottomResult.usage?.input_tokens||0),
                  output_tokens: (topResult.usage?.output_tokens||0) + (bottomResult.usage?.output_tokens||0) };
  return { elements: merged, usage };
}

/* ─── Kol Haneshamah Post-Processing ─── */

/* Strip "NUMBER / " prefix or " / NUMBER" suffix from header text */
function cleanHeaderText(t) {
  t = (t||"").trim();
  /* Strip leading "123 <separator> NAME" */
  const leadNum = t.match(/^(\d{2,})\s*\W+\s*([A-Za-z\u0590-\u05FF].+)$/);
  if (leadNum) return leadNum[2].trim();
  /* Strip trailing "NAME <separator> 123" */
  const trailNum = t.match(/^(.+?)\s*\W+\s*(\d{2,})$/);
  if (trailNum && /[A-Za-z\u0590-\u05FF]/.test(trailNum[1])) return trailNum[1].trim();
  return t;
}

/* ─── Document-wide dotted-ḥ consistency pass ─── */
/* The AI catches the dot under the h (ḥ, U+1E25 / Ḥ, U+1E24) on some occurrences of a
   word and misses it on others. Fix by consistency: collect every word the document
   renders WITH a dotted ḥ, then re-dot the occurrences of the same word that came
   back with a plain h. Runs across ALL pages so a word dotted on page 3 repairs its
   plain twin on page 90. */
const DOTTED_H_TYPES = new Set(["transliteration", "translation", "footnote", "instructions", "attribution", "kavanah", "commentary", "prayer_title"]);
/* Real English words that could collide with a dotted transliteration (e.g. English
   "hen" vs ḥen "grace"). Outside transliteration elements, leave these alone. */
const DOTTED_H_STOPLIST = new Set(["hen", "hag", "hall", "hush", "hash", "hoser"]);
const DOTTED_H_WORD_RE = /[\p{L}\p{M}'\u2019-]+/gu;

function enforceDottedHConsistency(pages) {
  /* Pass 1: build plain-key → dotted-form dictionary from every ḥ word seen. */
  const dict = new Map(); /* key (lowercase, plain h) → dotted lowercase form, or null if two dotted forms conflict */
  for (const pg of pages) {
    if (pg.skipped) continue;
    for (const el of pg.elements || []) {
      if (!DOTTED_H_TYPES.has(el.type) || !el.text) continue;
      for (let w of el.text.match(DOTTED_H_WORD_RE) || []) {
        w = w.normalize("NFC");
        if (!/[\u1E25\u1E24]/.test(w)) continue;
        const lower = w.toLowerCase();
        const key = lower.replace(/\u1E25/g, "h");
        const prev = dict.get(key);
        if (prev === undefined) dict.set(key, lower);
        else if (prev !== null && prev !== lower) dict.set(key, null);
      }
    }
  }
  if (!dict.size) return pages;
  /* Pass 2: re-dot plain-h occurrences of known dotted words, preserving case. */
  for (const pg of pages) {
    if (pg.skipped) continue;
    for (const el of pg.elements || []) {
      if (!DOTTED_H_TYPES.has(el.type) || !el.text) continue;
      el.text = el.text.replace(DOTTED_H_WORD_RE, raw => {
        const w = raw.normalize("NFC");
        if (/[\u1E25\u1E24]/.test(w) || !/[hH]/.test(w)) return raw;
        const key = w.toLowerCase();
        const dotted = dict.get(key);
        if (!dotted) return raw;
        if (el.type !== "transliteration" && DOTTED_H_STOPLIST.has(key)) return raw;
        let out = "";
        for (let i = 0; i < w.length; i++) {
          if (dotted[i] === "\u1E25" && (w[i] === "h" || w[i] === "H")) out += (w[i] === "H" ? "\u1E24" : "\u1E25");
          else out += w[i];
        }
        return out;
      });
    }
  }
  return pages;
}

function postProcessKolHaneshamah(pages) {
  /* Single set for ALL header text — case-insensitive, stripped of punctuation for matching */
  const seenHeaders = new Set();
  const normalizeHeader = (s) => cleanHeaderText(s).toUpperCase().replace(/['’]/g, "'").replace(/\s+/g, " ");

  for (const p of pages) {
    if (p.skipped) continue;
    let els = p.elements || [];

    /* Compound footer/header regexes. Handle regular slash (/), fraction slash (⁄),
       division slash (∕), fullwidth slash (／) */
    const slashPat = '[/\u2044\u2215\uFF0F]';
    const nameThenNum = new RegExp('^(.+?)\\s*' + slashPat + '\\s*(\\d+)\\s*$');
    const numThenName = new RegExp('^\\s*(\\d+)\\s*' + slashPat + '\\s*(.+?)\\s*$');
    /* Element types that might carry a compound "NAME / NUMBER" or "NUMBER / NAME" footer.
       Scan ALL of these defensively — the AI sometimes mislabels the footer as any of them. */
    const compoundEligibleTypes = new Set([
      "section_header", "page_number", "header",
      "bottom_section_name", "bottom_service_name"
    ]);

    /* Track whether we drop any footer-related element on this page. If we do,
       we'll add a spacer at the end so the visual gap the footer occupied in the
       source isn't lost. */
    let droppedFooter = false;

    /* Step 1: Defensive compound-footer scan. Extract name + number from any element
       whose text matches the compound pattern, then drop the element entirely.
       Take the LAST occurrence's values (the footer is at the bottom of the page). */
    let extractedName = null;
    let extractedNumber = null;
    els = els.filter(el => {
      if (!compoundEligibleTypes.has(el.type)) return true;
      const t = (el.text || "").trim();
      if (!t) return true;
      let m = t.match(nameThenNum);
      if (m) {
        extractedName = m[1].trim();
        extractedNumber = m[2].trim();
        droppedFooter = true;
        return false; /* drop this compound element */
      }
      m = t.match(numThenName);
      if (m) {
        extractedNumber = m[1].trim();
        extractedName = m[2].trim();
        droppedFooter = true;
        return false;
      }
      return true;
    });

    /* Step 2: For remaining bottom_section_name / bottom_service_name elements (without
       compound pattern), use their cleaned text as a header-name candidate, then drop. */
    const headerNameTypes = new Set(["bottom_section_name", "bottom_service_name"]);
    els = els.filter(el => {
      if (!headerNameTypes.has(el.type)) return true;
      const cleaned = cleanHeaderText(el.text || "").trim();
      if (cleaned && !extractedName) extractedName = cleaned;
      droppedFooter = true;
      return false;
    });

    /* Step 3: Determine the page number. Priority: compound-extracted number > first
       clean numeric page_number element > prior value. */
    if (extractedNumber) {
      p.pageNumber = extractedNumber;
    } else {
      for (const el of els) {
        if (el.type === "page_number") {
          const t = (el.text + "").trim();
          if (/^\d+$/.test(t)) { p.pageNumber = t; break; }
        }
      }
    }

    /* Step 4: Remove ALL page_number elements from the body — the page number renders
       via p.pageNumber at the bottom of the page in buildDocx. */
    els = els.filter(el => el.type !== "page_number");

    /* Step 5: Clean any remaining section_headers (strip stray number/separator patterns). */
    for (let i = 0; i < els.length; i++) {
      if (els[i].type === "section_header") els[i].text = cleanHeaderText(els[i].text);
    }

    /* Step 5.5: Drop "footer-style" section_headers from the body. A footer-style header
       is a section_header element that has NO post-content content after it (i.e., the AI
       placed it at the bottom of the page where a running header would appear in the
       printed source). Use its text as a header-name candidate if we don't already have
       one. Mid-page section_headers (those followed by readings/translations/etc.) are
       kept in place — they're legitimate sub-section markers. */
    const postContentTypes = new Set([
      "hebrew_liturgy", "transliteration", "translation", "attribution",
      "hebrew_header", "hebrew_section_header", "instructions", "footnote"
    ]);
    els = els.filter((el, i, arr) => {
      if (el.type !== "section_header") return true;
      let hasContentAfter = false;
      for (let j = i + 1; j < arr.length; j++) {
        if (postContentTypes.has(arr[j].type)) { hasContentAfter = true; break; }
      }
      if (hasContentAfter) return true; /* mid-page, keep */
      /* footer-style: drop, but capture as header candidate if we don't have one */
      if (!extractedName) extractedName = el.text;
      droppedFooter = true;
      return false;
    });

    /* Step 6: If we have a header name (from compound match, bottom_*_name, or footer-style
       section_header), insert it at the TOP of the page as a section_header. Dedup in Step 7. */
    if (extractedName) {
      els.unshift({ type: "section_header", text: extractedName, order: -1 });
    }

    /* Step 7: Dedup ALL section_headers on this page against the global seenHeaders.
       First occurrence (in document order across all pages) is kept; subsequent
       duplicates — same-page or cross-page — are dropped. normalizeHeader compares
       case-insensitively, so "Rosh Hashanah Eve" and "ROSH HASHANAH EVE" dedup as
       the same key (first one wins). */
    for (let i = 0; i < els.length; i++) {
      if (els[i].type !== "section_header") continue;
      const nk = normalizeHeader(els[i].text);
      if (seenHeaders.has(nk)) {
        els.splice(i, 1); i--;
      } else {
        seenHeaders.add(nk);
      }
    }

    /* Step 8: Remove trailing dividers — any `divider` element that has no content
       element after it on this page. Mid-page dividers (between readings) are kept;
       they render as extra spacing in buildDocx. */
    const contentTypes = new Set([
      "hebrew_liturgy", "transliteration", "translation", "attribution",
      "hebrew_header", "hebrew_section_header", "section_header", "instructions", "footnote"
    ]);
    let lastContentIdx = -1;
    for (let i = els.length - 1; i >= 0; i--) {
      if (contentTypes.has(els[i].type)) { lastContentIdx = i; break; }
    }
    if (lastContentIdx < 0) {
      els = els.filter(el => el.type !== "divider");
    } else {
      els = els.filter((el, i) => !(el.type === "divider" && i > lastContentIdx));
    }

    /* Step 9: If we dropped any footer-related element, append a divider spacer at
       the end. This preserves the visual gap the footer had in the source. We add
       this AFTER Step 8 (trailing-divider removal) so the spacer survives. */
    if (droppedFooter) {
      els.push({ type: "divider", text: "·", order: 9998 });
    }

    /* Step 10: Code-side Hebrew-term italic enforcement on instructions and attribution
       elements. If the AI failed to mark transliterated Hebrew terms (Kabbalat Hashanah,
       Yamim Nora'im, etc.) as non-italic, do it ourselves. */
    for (const el of els) {
      if (el.type === "instructions" || el.type === "attribution") {
        el.text = enforceHebrewTermItalic(el.text);
      }
    }

    /* Step 11: Drop any element with empty / whitespace-only text. Keep dividers
       (their text is just a placeholder marker — the spacing happens at render time). */
    els = els.filter(el => el.type === "divider" || ((el.text || "").trim().length > 0));

    p.elements = els;
  }
  return pages;
}

/* ─── DOCX Builder ─── */
async function loadDocxLib() {
  if (window.docx) return window.docx;
  for (const url of ["https://unpkg.com/docx@8.2.2/build/index.umd.js","https://cdn.jsdelivr.net/npm/docx@8.2.2/build/index.umd.js","https://cdnjs.cloudflare.com/ajax/libs/docx/8.2.2/docx.min.js"]) {
    try { await new Promise((ok,no)=>{const s=document.createElement("script");s.src=url;s.onload=ok;s.onerror=()=>no();document.head.appendChild(s);}); if (window.docx) return window.docx; } catch(_){}
  }
  throw new Error("Failed to load docx.js");
}

function startsWithAllCaps(t) { return /^([A-Z]{2,})(\s|,|;|:|\.|\!)/.test(t); }

/* Normalize leading all-caps words: ensure exactly the first 3 words are uppercase, rest sentence-case */
function normalizeLeadingCaps(text) {
  if (!startsWithAllCaps(text)) return text;
  const words = text.split(/(\s+)/); /* split preserving whitespace */
  let wordCount = 0, cutoff = 0;
  for (let i = 0; i < words.length; i++) {
    if (/\S/.test(words[i])) { wordCount++; if (wordCount === 3) { cutoff = i + 1; break; } }
    else cutoff = i + 1;
  }
  if (cutoff === 0) cutoff = words.length;
  /* Uppercase the first 3 words */
  const head = words.slice(0, cutoff).map(w => /\S/.test(w) ? w.toUpperCase() : w).join("");
  /* Sentence-case the rest: lowercase words that are ALL CAPS, leave mixed-case alone */
  const tail = words.slice(cutoff).map(w => {
    if (/\S/.test(w) && /^[A-Z]{2,}[,;:.\-!?]?$/.test(w)) return w.charAt(0) + w.slice(1).toLowerCase();
    return w;
  }).join("");
  return head + tail;
}

function makeTextRuns(text, font, size, extra={}, opts={}) {
  const { TextRun } = window.docx;
  const defaultItalic = !!opts.defaultItalic;
  const hasItalicTags = /<i>/.test(text);
  /* Italic semantics:
     - defaultItalic=false (translation, footnote): italic ONLY where <i>-marked.
     - defaultItalic=true (instructions, attribution): italic by default. <i> tags
       flip to mixed mode where italic appears ONLY where marked.
     Bold is always orthogonal: bold ONLY where <b>-marked. */
  return parseRichSpans(text).map(s => {
    const italic = !defaultItalic ? !!s.italic
                                   : (hasItalicTags ? !!s.italic : true);
    return new TextRun({ text: s.text, font, size, ...extra, italics: italic, bold: !!s.bold });
  });
}

function buildDocx(allPages, footnotes, fontSize, layoutId) {
  const { Document, Paragraph, TextRun, AlignmentType, PageBreak, BorderStyle } = window.docx;
  const T="Tahoma", ms=fontSize*2, is=Math.round((fontSize-1)*2), fs=Math.round((fontSize-2)*2), hs=Math.round((fontSize+2)*2), p12=240;
  const useCapsNorm = (layoutId === "mishkan_tfilah"); /* Only normalize ALL CAPS for MT layout */
  const inlineFootnotes = (layoutId === "kol_haneshamah"); /* KN keeps footnotes on the page; all other layouts collect them to a Footnotes section at the end of the document */
  const endFootnotes = [];
  const ch = [];

  for (let pi=0; pi<allPages.length; pi++) {
    const pg=allPages[pi];
    if (pg.skipped) { ch.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:400,after:200},children:[new TextRun({text:"[Page "+pg.sourcePageIndex+" skipped: "+(pg.skipReason||"error")+"]",font:T,size:is,italics:true,color:"996633"})]})); if(pi<allPages.length-1) ch.push(new Paragraph({children:[new PageBreak()]})); continue; }
    let ei=0, prevType="";
    for (const el of pg.elements||[]) {
      if (["navigation","header","page_number","bottom_section_name","bottom_service_name","footer"].includes(el.type)) { ei++; continue; }

      /* Extra spacing before a new liturgical block that follows a reading/attribution */
      if ((el.type==="hebrew_liturgy"||el.type==="hebrew_header") && (prevType==="translation"||prevType==="attribution")) {
        ch.push(new Paragraph({spacing:{before:120,after:120},children:[new TextRun({text:"",font:T,size:Math.round(ms*0.4)})]}));
      }

      /* A translation after an attribution = a new reading. Add clear visual break. */
      if (el.type==="translation" && prevType==="attribution") {
        ch.push(new Paragraph({spacing:{before:200,after:200},children:[new TextRun({text:"",font:T,size:Math.round(ms*0.4)})]}));
      }

      if (el.type==="section_header") {
        /* If directly preceded by a hebrew_section_header, tighten the gap so the two read as one paired heading */
        const sb = (prevType==="hebrew_section_header") ? 60 : 480;
        ch.push(new Paragraph({style:"SectionHeader",spacing:{before:sb,after:200},children:[new TextRun({text:stripMarkup(el.text),font:T,size:ms,bold:true})]}));
      }
      else if (el.type==="hebrew_section_header") ch.push(new Paragraph({style:"HebrewSectionHeader",alignment:AlignmentType.CENTER,spacing:{before:480,after:60},children:[new TextRun({text:stripMarkup(el.text),font:T,size:ms,bold:true,rightToLeft:true})]}));
      else if (el.type==="hebrew_header") ch.push(new Paragraph({style:"HebrewHeader",alignment:AlignmentType.RIGHT,spacing:{before:360,after:200},children:[new TextRun({text:stripMarkup(el.text),font:T,size:ms,bold:true,rightToLeft:true})]}));
      else if (el.type==="hebrew_liturgy") ch.push(new Paragraph({style:"HebrewLiturgy",alignment:AlignmentType.RIGHT,children:[new TextRun({text:stripMarkup(el.text),font:T,size:ms,rightToLeft:true})]}));
      else if (el.type==="transliteration") { const nt=useCapsNorm?normalizeLeadingCaps(stripMarkup(el.text)):stripMarkup(el.text); ch.push(new Paragraph({style:"Transliteration",spacing:{after:240},children:[new TextRun({text:nt,font:T,size:ms})]})); }
      else if (el.type==="translation") {
        for (const [ti,raw] of el.text.split(/\n\s*\n/).entries()) {
          /* Check for indented lines (>> prefix) */
          const lines = raw.split('\n');
          const hasIndent = lines.some(l => l.trim().startsWith('>>'));
          if (hasIndent) {
            /* Poetry/indented mode: each line is a separate paragraph */
            for (const line of lines) {
              let lt = line.trim(); if (!lt) continue;
              const isIndented = lt.startsWith('>>');
              if (isIndented) lt = lt.slice(2).trim();
              if (useCapsNorm) lt = normalizeLeadingCaps(lt);
              const indentOpts = isIndented ? {indent:{left:720}} : {};
              ch.push(new Paragraph({style:"Translation",spacing:{before:0,after:60},...indentOpts,children:makeTextRuns(lt,T,ms)}));
            }
          } else {
            /* Normal mode: collapse to single paragraph */
            let pt=raw.replace(/\n/g," ").trim(); if(!pt) continue;
            if (useCapsNorm) pt=normalizeLeadingCaps(pt);
            const nr=startsWithAllCaps(pt), fp=(ei===0&&ti===0);
            const sb = (nr&&!fp)?p12*2+240:(ti>0)?200:p12;
            ch.push(new Paragraph({style:"Translation",spacing:{before:sb,after:120},children:makeTextRuns(pt,T,ms)}));
          }
        }
      } else if (el.type==="prayer_title") {
        /* Mahzor Lev Shalem: heading within the English column (italic prayer
           headings and small-caps subheads). Provisional rendering until MLS
           output guidelines exist: left-aligned bold. */
        ch.push(new Paragraph({spacing:{before:360,after:120},children:[new TextRun({text:stripMarkup(el.text),font:T,size:ms,bold:true})]}));
      } else if (el.type==="kavanah") {
        /* Mahzor Lev Shalem: left-margin meditational reading/poem. Provisional
           rendering: slightly smaller type, first line (title) bold if present. */
        const paras=(el.text||"").split(/\n\s*\n/);
        for (const [ki,kp] of paras.entries()) {
          const lines=kp.split("\n").map(l=>l.trim()).filter(Boolean);
          for (const [li,line] of lines.entries()) {
            const isTitle=(ki===0&&li===0&&lines.length>1);
            ch.push(new Paragraph({spacing:{before:(ki===0&&li===0)?240:40,after:40},children:makeTextRuns(line,T,is,isTitle?{bold:true}:{})}))
          }
        }
      } else if (el.type==="toc") {
        /* Mahzor Lev Shalem: section-opener mini table of contents — one line per entry. */
        for (const line of (el.text||"").split("\n")) {
          const lt=line.trim(); if(!lt) continue;
          ch.push(new Paragraph({spacing:{before:60,after:60},children:makeTextRuns(lt,T,ms)}));
        }
      } else if (el.type==="attribution") {
        /* Attribution: right-aligned italic by default. <i> tags flip to mixed mode
           (italic only where marked). <b> tags add bold where marked. */
        ch.push(new Paragraph({style:"Attribution",alignment:AlignmentType.RIGHT,spacing:{before:120,after:360},children:makeTextRuns(el.text,T,is,{},{defaultItalic:true})}));
      } else if (el.type==="instructions") {
        /* Instructions: left-aligned italic by default. <i> tags flip to mixed mode
           (italic only where marked). <b> tags add bold where marked. */
        ch.push(new Paragraph({style:"Instructions",spacing:{before:p12,after:p12},children:makeTextRuns(el.text,T,is,{},{defaultItalic:true})}));
      } else if (el.type==="footnote" || el.type==="commentary") {
        /* Footnote placement depends on layout:
           - Kol Haneshamah (KN): rendered IN-PLACE at the element's original position so
             each note stays on its own page. Small font, italic-tag aware via makeTextRuns.
             The source has a horizontal rule above the footnote block separating it from
             body content — represent that with extra spacing before the FIRST footnote in a run.
           - All other layouts (e.g. Mishkan T'filah): footnotes are NOT shown in-place;
             they are collected and emitted together in a Footnotes section at the END of
             the document (built after the page loop below).
           Split on double-newlines for multi-paragraph footnotes. */
        if (inlineFootnotes && prevType !== "footnote") {
          ch.push(new Paragraph({spacing:{before:360,after:120},children:[new TextRun({text:"",font:T,size:Math.round(ms*0.4)})]}));
        }
        for (const fp of (el.text||"").split(/\n\s*\n/)) {
          const t = fp.replace(/\n/g," ").trim();
          if (!t) continue;
          if (inlineFootnotes) {
            ch.push(new Paragraph({spacing:{before:120,after:120},children:makeTextRuns(t,T,fs)}));
          } else {
            endFootnotes.push({pageNumber:pg.pageNumber||String(pi+1),text:t});
          }
        }
      } else if (el.type==="divider") {
        /* Divider: a decorative ornament between two readings. Render as extra blank
           paragraph spacing — no text. Trailing dividers (those just before the page
           footer) were already removed in postProcessKolHaneshamah. */
        ch.push(new Paragraph({spacing:{before:240,after:240},children:[new TextRun({text:"",font:T,size:ms})]}));
      }
      prevType=el.type;
      ei++;
    }
    if (pg.pageNumber) ch.push(new Paragraph({style:"PageNumber",children:[new TextRun({text:stripMarkup(pg.pageNumber),font:T,size:ms})]}));
    if (pi<allPages.length-1) ch.push(new Paragraph({children:[new PageBreak()]}));
  }

  /* Footnotes section at the END of the document (non-KN layouts only). Footnotes are
     grouped under the page number they came from so readers can locate them. */
  if (!inlineFootnotes && endFootnotes.length) {
    ch.push(new Paragraph({children:[new PageBreak()]}));
    ch.push(new Paragraph({style:"SectionHeader",spacing:{before:240,after:240},children:[new TextRun({text:(layoutId==="mahzor_lev_shalem")?"Commentary":"Footnotes",font:T,size:ms,bold:true})]}));
    let lastPage=null;
    for (const fn of endFootnotes) {
      if (fn.pageNumber!==lastPage) {
        ch.push(new Paragraph({spacing:{before:200,after:60},children:[new TextRun({text:"Page "+stripMarkup(fn.pageNumber),font:T,size:fs,bold:true,color:"996633"})]}));
        lastPage=fn.pageNumber;
      }
      ch.push(new Paragraph({spacing:{before:60,after:60},children:makeTextRuns(fn.text,T,fs)}));
    }
  }

  return new Document({
    styles:{paragraphStyles:[
      {id:"PageNumber",name:"Page Number",basedOn:"Normal",run:{font:T,size:ms},paragraph:{alignment:AlignmentType.CENTER,spacing:{before:400,after:200}}},
      {id:"SectionHeader",name:"Section Header",basedOn:"Normal",run:{font:T,size:ms,bold:true},paragraph:{alignment:AlignmentType.CENTER,spacing:{before:480,after:200}}},
      {id:"HebrewSectionHeader",name:"Hebrew Section Header",basedOn:"Normal",run:{font:T,size:ms,bold:true,rightToLeft:true},paragraph:{alignment:AlignmentType.CENTER,spacing:{before:480,after:60}}},
      {id:"HebrewHeader",name:"Hebrew Header",basedOn:"Normal",run:{font:T,size:ms,bold:true,rightToLeft:true},paragraph:{alignment:AlignmentType.RIGHT,spacing:{before:360,after:200}}},
      {id:"Instructions",name:"Instructions",basedOn:"Normal",run:{font:T,size:is,italics:true},paragraph:{alignment:AlignmentType.LEFT,spacing:{before:p12,after:p12}}},
      {id:"HebrewLiturgy",name:"Hebrew Liturgy",basedOn:"Normal",run:{font:T,size:ms,rightToLeft:true},paragraph:{alignment:AlignmentType.RIGHT,spacing:{after:120}}},
      {id:"Transliteration",name:"Transliteration",basedOn:"Normal",run:{font:T,size:ms},paragraph:{alignment:AlignmentType.LEFT,spacing:{after:120}}},
      {id:"Translation",name:"Translation",basedOn:"Normal",run:{font:T,size:ms},paragraph:{alignment:AlignmentType.LEFT,spacing:{before:p12,after:120}}},
      {id:"Attribution",name:"Attribution",basedOn:"Normal",run:{font:T,size:is,italics:true},paragraph:{alignment:AlignmentType.RIGHT,spacing:{before:120,after:360}}},
    ]},
    sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440}}},children:ch}],
  });
}

/* ─── UI Components ─── */
function FileUploadZone({ onFile, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  return (
    <div onDragOver={e=>{e.preventDefault();if(!disabled)setDragOver(true)}} onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();setDragOver(false);if(disabled)return;const f=e.dataTransfer.files[0];if(f&&f.type==="application/pdf")onFile(f)}}
      onClick={()=>!disabled&&inputRef.current?.click()}
      style={{border:"2px dashed "+(dragOver?"#c8a44e":"#3a3528"),borderRadius:16,padding:"48px 32px",textAlign:"center",cursor:disabled?"not-allowed":"pointer",background:dragOver?"rgba(200,164,78,0.08)":"rgba(58,53,40,0.04)",transition:"all 0.3s ease",opacity:disabled?0.5:1}}>
      <input ref={inputRef} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)onFile(f)}} />
      <div style={{fontSize:48,marginBottom:12}}>📜</div>
      <div style={{fontSize:18,fontWeight:600,color:"#2a2518",marginBottom:8}}>Drop your Siddur PDF here</div>
      <div style={{fontSize:14,color:"#7a7060"}}>or click to browse</div>
    </div>
  );
}

function LayoutSelector({selectedLayout,onSelect,detectedLayout,detectionConfidence,detectionReasoning}) {
  return (
    <div style={{background:"rgba(200,164,78,0.08)",borderRadius:12,padding:"16px 20px",margin:"16px 0"}}>
      <div style={{fontSize:14,fontWeight:700,color:"#2a2518",marginBottom:10}}>Siddur Layout</div>
      {detectedLayout && <div style={{fontSize:13,color:"#5a5040",marginBottom:12,padding:"8px 12px",background:"rgba(200,164,78,0.1)",borderRadius:8,border:"1px solid rgba(200,164,78,0.2)"}}>
        <span style={{fontWeight:600}}>Auto-detected: </span><span style={{color:"#a07830",fontWeight:600}}>{LAYOUTS[detectedLayout]?.name||detectedLayout}</span>
        <span style={{color:"#8a8070",marginLeft:8}}>({Math.round(detectionConfidence*100)}%)</span>
        {detectionReasoning && <div style={{marginTop:4,fontSize:12,color:"#8a8070",fontStyle:"italic"}}>{detectionReasoning}</div>}
      </div>}
      <select value={selectedLayout} onChange={e=>onSelect(e.target.value)}
        style={{width:"100%",padding:"10px 12px",fontSize:15,borderRadius:8,border:"1px solid #c8b898",background:"#fff",color:"#2a2518",fontFamily:"'Georgia',serif",cursor:"pointer",appearance:"auto"}}>
        {Object.entries(LAYOUTS).map(([id,l])=><option key={id} value={id}>{l.name}{l.publisher?" ("+l.publisher+")":""}</option>)}
      </select>
      <div style={{fontSize:12,color:"#8a8070",marginTop:6}}>{LAYOUTS[selectedLayout]?.description}</div>
    </div>
  );
}

function FontSizeControl({fontSize,onChange}) {
  return (
    <div style={{background:"rgba(58,53,40,0.04)",borderRadius:12,padding:"16px 20px",margin:"16px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div><div style={{fontSize:14,fontWeight:700,color:"#2a2518"}}>Output Font Size</div><div style={{fontSize:12,color:"#8a8070",marginTop:2}}>Main text size in Word document</div></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>onChange(Math.max(10,fontSize-1))} style={{width:32,height:32,borderRadius:6,border:"1px solid #c8b898",background:"#fff",cursor:"pointer",fontSize:16,color:"#5a5040",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <span style={{fontSize:18,fontWeight:600,color:"#2a2518",minWidth:36,textAlign:"center"}}>{fontSize}</span>
          <button onClick={()=>onChange(Math.min(48,fontSize+1))} style={{width:32,height:32,borderRadius:6,border:"1px solid #c8b898",background:"#fff",cursor:"pointer",fontSize:16,color:"#5a5040",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          <span style={{fontSize:13,color:"#8a8070"}}>pt</span>
        </div>
      </div>
      <div style={{marginTop:10}}>
        <input type="range" min={10} max={48} value={fontSize} onChange={e=>onChange(parseInt(e.target.value,10))} style={{width:"100%",accentColor:"#a07830"}} />
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#a09080",marginTop:2}}><span>10pt</span><span>22pt (default)</span><span>48pt</span></div>
      </div>
    </div>
  );
}

function ProcessingNotes({notes,onChange}) {
  return (
    <div style={{background:"rgba(58,53,40,0.04)",borderRadius:12,padding:"16px 20px",margin:"16px 0"}}>
      <div style={{fontSize:14,fontWeight:700,color:"#2a2518",marginBottom:4}}>Processing Notes</div>
      <div style={{fontSize:12,color:"#8a8070",marginBottom:10}}>Optional: Add notes or special instructions to guide the AI analysis.</div>
      <textarea value={notes} onChange={e=>onChange(e.target.value)} placeholder="Any special notes for processing this PDF..."
        style={{width:"100%",minHeight:80,padding:"10px 12px",fontSize:14,borderRadius:8,border:"1px solid #c8b898",background:"#fff",color:"#2a2518",fontFamily:"'Georgia',serif",resize:"vertical",lineHeight:1.5}} />
    </div>
  );
}

function TokenEstimate({ pageImages, selectedLayout, actualUsage }) {
  if (!pageImages || pageImages.length === 0) return null;
  const numPages = pageImages.length;
  const hasActual = actualUsage && actualUsage.inputTokens > 0;

  const fmtT = n => n >= 1000 ? (n/1000).toFixed(1)+"K" : String(n);
  const fmtC = n => "$"+n.toFixed(4);

  // Pricing: Claude Sonnet 4 = $3/MTok input, $15/MTok output
  const INPUT_RATE = 3, OUTPUT_RATE = 15;

  if (hasActual) {
    const ic = (actualUsage.inputTokens/1e6)*INPUT_RATE;
    const oc = (actualUsage.outputTokens/1e6)*OUTPUT_RATE;
    return (
      <div style={{background:"rgba(200,164,78,0.08)",borderRadius:12,padding:"16px 20px",margin:"16px 0"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#2a2518",marginBottom:8}}>Actual Token Usage</div>
        <div style={{fontSize:13,color:"#5a5040",lineHeight:1.8}}>
          <div style={{display:"flex",justifyContent:"space-between"}}><span>Input tokens</span><span style={{fontWeight:600}}>{fmtT(actualUsage.inputTokens)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span>Output tokens</span><span style={{fontWeight:600}}>{fmtT(actualUsage.outputTokens)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4,paddingTop:6,borderTop:"1px solid rgba(58,53,40,0.1)"}}>
            <span style={{fontWeight:600}}>Total cost</span>
            <span style={{fontWeight:700,color:"#a07830"}}>{fmtC(ic+oc)}</span>
          </div>
        </div>
        <div style={{fontSize:11,color:"#a09080",marginTop:8}}>Based on $3/MTok input, $15/MTok output (Claude Sonnet 4). Does not include retried requests.</div>
      </div>
    );
  }

  // Estimate
  const sysT = selectedLayout==="mishkan_tfilah"?2400:selectedLayout==="kol_haneshamah"?2200:selectedLayout==="mahzor_lev_shalem"?3200:1500;
  /* Embedded text layer (born-digital PDFs) rides along as a reference block */
  const refChars = pageImages.reduce((s,p)=>s+((p.textLayer&&p.textLayer.length)||0),0);
  const refPages = pageImages.filter(p=>p.textLayer&&p.textLayer.length>200).length;
  const perPage = sysT+2500+50;
  const totalIn = 2900+(perPage*numPages)+Math.round(refChars/4)+(refPages*260);
  const loOut = 100+(500*numPages), hiOut = 100+(2000*numPages);
  const inCost = (totalIn/1e6)*INPUT_RATE;
  const loCost = inCost+(loOut/1e6)*OUTPUT_RATE;
  const hiCost = inCost+(hiOut/1e6)*OUTPUT_RATE;

  return (
    <div style={{background:"rgba(58,53,40,0.04)",borderRadius:12,padding:"16px 20px",margin:"16px 0"}}>
      <div style={{fontSize:14,fontWeight:700,color:"#2a2518",marginBottom:8}}>Estimated Token Usage</div>
      <div style={{fontSize:13,color:"#5a5040",lineHeight:1.8}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>{numPages} page{numPages!==1?"s":""} + layout detection</span><span style={{color:"#8a8070"}}>Claude Sonnet 4.5</span></div>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>Input tokens (est.)</span><span style={{fontWeight:600}}>{fmtT(totalIn)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>Output tokens (est.)</span><span style={{fontWeight:600}}>{fmtT(loOut)}–{fmtT(hiOut)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4,paddingTop:6,borderTop:"1px solid rgba(58,53,40,0.1)"}}>
          <span style={{fontWeight:600}}>Estimated cost</span>
          <span style={{fontWeight:700,color:"#a07830"}}>{fmtC(loCost)} – {fmtC(hiCost)}</span>
        </div>
      </div>
      {refPages>0 && <div style={{marginTop:10,padding:"8px 12px",background:"rgba(120,160,120,0.12)",borderRadius:8,fontSize:12,color:"#4a6040",lineHeight:1.5}}>
        ✓ Embedded text layer found on {refPages} of {numPages} page{numPages!==1?"s":""} — the publisher's own text rides along with each page image as a word-accuracy reference (the image stays authoritative for layout, color, and nikkud).
      </div>}
      <div style={{fontSize:11,color:"#a09080",marginTop:8}}>Based on $3/MTok input, $15/MTok output. Actual usage may vary. Does not include retries.</div>
    </div>
  );
}

function ProgressBar({current,total,status}) {
  const pct=total>0?(current/total)*100:0;
  return (
    <div style={{margin:"24px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:14,color:"#5a5040"}}><span>{status}</span><span>{current}/{total} pages</span></div>
      <div style={{height:8,borderRadius:4,background:"#e8e0d0",overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg,#c8a44e,#a07830)",borderRadius:4,transition:"width 0.4s ease"}} /></div>
    </div>
  );
}

function ResultsSummary({allPages,layoutName,skippedPages}) {
  const c={}; for (const p of allPages) { if(p.skipped) continue; for (const e of p.elements||[]) c[e.type]=(c[e.type]||0)+1; }
  const L={hebrew_liturgy:"Hebrew Liturgy",hebrew_header:"Hebrew Headers",hebrew_section_header:"Hebrew Section Headers",transliteration:"Transliteration",translation:"Translation",attribution:"Attributions",section_header:"Section Headers",instructions:"Instructions",page_number:"Page Numbers",footnote:"Footnotes",divider:"Dividers",navigation:"Navigation (skipped)",header:"Headers (skipped)",bottom_section_name:"Section Labels",bottom_service_name:"Service Labels",prayer_title:"Prayer Titles",kavanah:"Kavanot (margin readings)",commentary:"Commentary Notes",footer:"Footers (skipped)",toc:"TOC Entries"};
  return (
    <div style={{background:"rgba(200,164,78,0.08)",borderRadius:12,padding:"16px 20px",margin:"16px 0"}}>
      <div style={{fontSize:14,fontWeight:700,color:"#2a2518",marginBottom:4}}>Elements Identified</div>
      {layoutName && <div style={{fontSize:12,color:"#8a8070",marginBottom:8}}>Layout: {layoutName}</div>}
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px 16px"}}>{Object.entries(c).map(([t,n])=><span key={t} style={{fontSize:13,color:"#5a5040"}}>{L[t]||t}: <strong>{n}</strong></span>)}</div>
      {skippedPages.length>0 && <div style={{marginTop:12,padding:"10px 14px",background:"#fef7ed",border:"1px solid #f5d0a0",borderRadius:8,fontSize:13}}>
        <div style={{color:"#7a5020",fontWeight:600,marginBottom:4}}>⚠ {skippedPages.length} page{skippedPages.length>1?"s":""} skipped</div>
        {skippedPages.map(s=><div key={s.sourcePageIndex} style={{color:"#8a6030",marginBottom:4,lineHeight:1.4}}>Page {s.sourcePageIndex}: {s.skipReason||"unknown error"}</div>)}
      </div>}
    </div>
  );
}

/* ─── Main App ─── */
export default function SiddurOCRApp() {
  const [file,setFile]=useState(null), [status,setStatus]=useState("idle"), [pageImages,setPageImages]=useState([]);
  const [progress,setProgress]=useState({current:0,total:0}), [statusText,setStatusText]=useState("");
  const [allPages,setAllPages]=useState([]), [footnotes,setFootnotes]=useState([]), [docBlob,setDocBlob]=useState(null);
  const [error,setError]=useState(null), [skippedPages,setSkippedPages]=useState([]);
  const [selectedLayout,setSelectedLayout]=useState("mishkan_tfilah");
  const [detectedLayout,setDetectedLayout]=useState(null), [detectionConfidence,setDetectionConfidence]=useState(0), [detectionReasoning,setDetectionReasoning]=useState("");
  const [fontSize,setFontSize]=useState(22), [processingNotes,setProcessingNotes]=useState("");
  const [actualUsage,setActualUsage]=useState({inputTokens:0,outputTokens:0});
  const [autoStartCount,setAutoStartCount]=useState(-1);
  const [timerCancelled,setTimerCancelled]=useState(false);
  const timerRef=useRef(null);

  /* Auto-start countdown: begins when status becomes "ready" */
  useEffect(()=>{
    if (status==="ready" && !timerCancelled) {
      setAutoStartCount(30);
      timerRef.current=setInterval(()=>{
        setAutoStartCount(prev=>{
          if (prev<=1) { clearInterval(timerRef.current); return 0; }
          return prev-1;
        });
      },1000);
      return ()=>clearInterval(timerRef.current);
    } else {
      setAutoStartCount(-1);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  },[status,timerCancelled]);

  const handleFile = useCallback(async (pdfFile) => {
    setFile(pdfFile); setError(null); setDocBlob(null); setAllPages([]); setFootnotes([]);
    setPageImages([]); setSkippedPages([]); setDetectedLayout(null); setDetectionConfidence(0); setDetectionReasoning("");
    setActualUsage({inputTokens:0,outputTokens:0});
    try {
      setStatus("detecting"); setStatusText("Rendering PDF and detecting layout\u2026");
      const {images,totalPages} = await pdfToImages(pdfFile);
      setPageImages(images); setProgress({current:0,total:totalPages});
      setStatusText("Identifying siddur layout\u2026");
      /* Pick candidate pages for layout detection. The opening pages of a scanned
         siddur are often title/copyright/TOC pages, so start from the MIDDLE of the
         document. Facing-page editions (e.g. some Kol Haneshamah volumes) alternate
         Hebrew-only and English-only pages, so sample an ADJACENT PAIR at the middle
         to see both sides of a spread, then the 1/4 and 3/4 points, then page 1. */
      const N = images.length;
      const candidates = [...new Set(
        [Math.floor(N/2), Math.floor(N/2)+1, Math.floor(N/4), Math.floor((3*N)/4), 0, 1]
          .map(i => Math.max(0, Math.min(i, N-1)))
      )];
      const maxDetectPages = Math.min(5, candidates.length);
      /* Accept a known layout immediately only at high confidence; otherwise keep
         scanning and fall back to the best guess seen. This stops one ambiguous page
         (e.g. an all-English reading) from ending detection with a wrong answer. */
      let det = null;
      let bestKnown = null;
      let bestOther = { layout_id: "other", confidence: -1, reasoning: "No pages available", usage: null };
      for (let a = 0; a < maxDetectPages; a++) {
        const p = candidates[a];
        setStatusText(`Identifying siddur layout (checking page ${p + 1}${a > 0 ? `, attempt ${a + 1} of ${maxDetectPages}` : ""})\u2026`);
        const attempt = await detectLayout(images[p].base64);
        if (attempt.usage) setActualUsage(prev=>({inputTokens:prev.inputTokens+(attempt.usage.input_tokens||0),outputTokens:prev.outputTokens+(attempt.usage.output_tokens||0)}));
        const isKnown = attempt.layout_id && attempt.layout_id !== "other" && LAYOUTS[attempt.layout_id];
        if (isKnown) {
          attempt.reasoning = (attempt.reasoning || "") + ` (detected from page ${p + 1})`;
          if ((attempt.confidence || 0) >= 0.7) { det = attempt; break; }
          if (!bestKnown || (attempt.confidence || 0) > (bestKnown.confidence || 0)) bestKnown = attempt;
        } else if ((attempt.confidence || 0) > bestOther.confidence) {
          bestOther = attempt;
        }
      }
      if (!det) det = bestKnown || bestOther;
      if ((det.confidence || 0) < 0) det.confidence = 0;
      const detId = det.layout_id && LAYOUTS[det.layout_id] ? det.layout_id : "other";
      setDetectedLayout(detId); setDetectionConfidence(det.confidence||0); setDetectionReasoning(det.reasoning||""); setSelectedLayout(detId);
      setStatus("ready"); setStatusText("Ready to process");
    } catch(err) { setError(err.message); setStatus("error"); }
  },[]);

  const beginProcessing = useCallback(async () => {
    if (!file || !pageImages.length) return;
    setError(null); setDocBlob(null); setAllPages([]); setFootnotes([]); setSkippedPages([]);
    // Keep detection usage, reset page usage
    setActualUsage(prev=>({inputTokens:prev.inputTokens,outputTokens:prev.outputTokens}));
    const layout = LAYOUTS[selectedLayout]||LAYOUTS["other"];
    let sysPrompt = layout.systemPrompt;
    if (processingNotes.trim()) sysPrompt += "\n\nADDITIONAL NOTES FROM THE USER:\n"+processingNotes.trim();

    try {
      setStatus("analyzing");
      const total=pageImages.length, pages=[], allFn=[], skipped=[];
      for (let i=0; i<pageImages.length; i++) {
        setStatusText("Analyzing page "+(i+1)+" of "+total+"\u2026");
        setProgress({current:i,total});
        try {
          let result;
          try {
            result = await analyzePageWithClaude(pageImages[i].base64, sysPrompt, selectedLayout, 1, 3, pageImages[i].textLayer || "");
          } catch(firstErr) {
            if (firstErr.message.startsWith("CONTENT_FILTER:")) {
              /* Retry with instructions to skip sensitive content */
              setStatusText("Page "+(i+1)+": content filter hit, retrying with safe mode\u2026");
              const safePrompt = sysPrompt + "\n\nCONTENT SAFETY NOTE: A previous attempt to process this page was blocked by content filters. Please extract all text EXCEPT any content that might be considered sensitive or inappropriate. For any text you must omit, insert a placeholder: [content omitted due to filtering]. Extract everything else normally with full accuracy.";
              try {
                result = await analyzePageWithClaude(pageImages[i].base64, safePrompt, selectedLayout, 1, 1, pageImages[i].textLayer || "");
              } catch(safeErr) {
                /* Safe mode also failed — try split-page mode */
                setStatusText("Page "+(i+1)+": safe mode failed, trying split-page mode\u2026");
                try {
                  result = await splitPageAnalyze(pageImages[i].base64, sysPrompt, selectedLayout, pageImages[i].textLayer || "");
                } catch(_) { throw firstErr; /* all three modes failed, throw original error */ }
              }
            } else {
              throw firstErr;
            }
          }
          const els=result.elements||[];
          const pnEl=els.find(e=>e.type==="page_number");
          const pn=pnEl?pnEl.text:String(i+1);
          /* Footnotes are rendered inline per-page from pg.elements in buildDocx;
             no separate collection needed. */
          pages.push({pageNumber:pn,elements:els,sourcePageIndex:i+1});
          // Accumulate actual usage
          if (result.usage) setActualUsage(prev=>({inputTokens:prev.inputTokens+(result.usage.input_tokens||0),outputTokens:prev.outputTokens+(result.usage.output_tokens||0)}));
        } catch(pageErr) {
          let sr="processing error";
          if (pageErr.message.startsWith("CONTENT_FILTER:")) sr=pageErr.message;
          else if (pageErr.message.startsWith("RATE_LIMIT:")) sr="rate limit";
          else sr=pageErr.message.slice(0,120);
          const sp={sourcePageIndex:i+1,skipped:true,skipReason:sr,pageNumber:String(i+1),elements:[]};
          pages.push(sp); skipped.push(sp);
          setStatusText("Page "+(i+1)+" skipped ("+sr+"). Continuing\u2026");
          await new Promise(r=>setTimeout(r,1000));
        }
      }
      let proc=pages;
      if (selectedLayout==="kol_haneshamah") proc=postProcessKolHaneshamah(pages);
      proc=enforceDottedHConsistency(proc);
      setProgress({current:total,total}); setAllPages(proc); setFootnotes(allFn); setSkippedPages(skipped);
      setStatus("building"); setStatusText("Generating Word document\u2026");
      await loadDocxLib();
      const Pk=window.docx.Packer||window.docx.default?.Packer;
      setDocBlob(await Pk.toBlob(buildDocx(proc,allFn,fontSize,selectedLayout)));
      setStatus("done"); setStatusText("Complete!"+(skipped.length?" ("+skipped.length+" skipped)":""));
    } catch(err) { setError(err.message); setStatus("error"); }
  },[file,pageImages,selectedLayout,fontSize,processingNotes]);

  const downloadDocx = useCallback(()=>{
    if (!docBlob) return;
    const u=URL.createObjectURL(docBlob),a=document.createElement("a");
    a.href=u; a.download=(file?file.name.replace(/\.pdf$/i,""):"siddur")+"_processed.docx";
    a.style.display="none"; document.body.appendChild(a); a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(u)},1000);
  },[docBlob,file]);

  const exportSkippedPDF = useCallback(async ()=>{
    if (!file || !skippedPages.length) return;
    try {
      const PDFLib = await loadPdfLib();
      const srcBytes = await file.arrayBuffer();
      const srcPdf = await PDFLib.PDFDocument.load(srcBytes);
      const newPdf = await PDFLib.PDFDocument.create();
      const pageIndices = skippedPages.map(s => s.sourcePageIndex - 1);
      const copiedPages = await newPdf.copyPages(srcPdf, pageIndices);
      for (const pg of copiedPages) newPdf.addPage(pg);
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], {type:"application/pdf"});
      const u = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = u; a.download = (file?file.name.replace(/\.pdf$/i,""):"siddur") + "_skipped.pdf";
      a.style.display = "none"; document.body.appendChild(a); a.click();
      setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(u)},1000);
    } catch(e) { console.error("Failed to export skipped pages:",e); }
  },[file,skippedPages]);

  /* Auto-trigger: when countdown hits 0 and status is still ready, start processing */
  useEffect(()=>{
    if (autoStartCount===0 && status==="ready" && !timerCancelled) {
      /* Small delay to ensure state is settled */
      const t=setTimeout(()=>{ if (status==="ready") beginProcessing(); },200);
      return ()=>clearTimeout(t);
    }
  },[autoStartCount,status,timerCancelled,beginProcessing]);

  const cancelTimer=()=>{ setTimerCancelled(true); setAutoStartCount(-1); if(timerRef.current) clearInterval(timerRef.current); };

  const reset=()=>{
    setFile(null);setStatus("idle");setPageImages([]);setProgress({current:0,total:0});setStatusText("");
    setAllPages([]);setFootnotes([]);setDocBlob(null);setError(null);setSkippedPages([]);
    setDetectedLayout(null);setDetectionConfidence(0);setDetectionReasoning("");
    setSelectedLayout("mishkan_tfilah");setFontSize(22);setProcessingNotes("");setActualUsage({inputTokens:0,outputTokens:0});
    setTimerCancelled(false);setAutoStartCount(-1);
  };

  const isProc=["analyzing","building","detecting"].includes(status);

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#f5f0e6 0%,#ebe4d4 50%,#e0d8c4 100%)",fontFamily:"'Georgia','Palatino Linotype',serif",padding:"0 16px"}}>
      <div style={{maxWidth:640,margin:"0 auto",paddingTop:48,paddingBottom:64}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{display:"inline-block",fontSize:13,letterSpacing:3,textTransform:"uppercase",color:"#a07830",marginBottom:4,fontFamily:"Tahoma,Geneva,sans-serif"}}>Siddur Processor</div>
          <div style={{fontSize:11,color:"#a09080",marginBottom:12,fontFamily:"Tahoma,Geneva,sans-serif"}}>{VERSION_STAMP}</div>
          <h1 style={{fontSize:32,fontWeight:400,color:"#2a2518",margin:0,lineHeight:1.3}}>Prayer Book to Word</h1>
          <p style={{color:"#7a7060",fontSize:15,marginTop:8,lineHeight:1.6}}>Upload a siddur PDF. AI identifies the layout, extracts Hebrew liturgy, transliteration, translation, instructions, footnotes, and page numbers — then exports a formatted Word document.</p>
        </div>

        <FileUploadZone onFile={handleFile} disabled={isProc} />

        {file && <div style={{marginTop:12,fontSize:13,color:"#5a5040",display:"flex",alignItems:"center",gap:8}}>
          <span>📄 {file.name}</span><span style={{color:"#a09080"}}>({(file.size/1024/1024).toFixed(1)} MB)</span>
          {(status==="done"||status==="ready")&&<button onClick={reset} style={{marginLeft:"auto",background:"none",border:"1px solid #c8b898",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:12,color:"#7a7060"}}>Start over</button>}
        </div>}

        {pageImages.length>0 && <div style={{margin:"16px 0"}}>
          <div style={{fontSize:13,color:"#7a7060",marginBottom:8,fontWeight:600}}>Pages ({pageImages.length})</div>
          <div style={{display:"flex",gap:8,overflowX:"auto",padding:"4px 0"}}>{pageImages.map((p,i)=><img key={i} src={p.dataUrl} alt={"Page "+p.pageNum} style={{height:100,borderRadius:6,border:"1px solid #d8d0c0",flexShrink:0}} />)}</div>
        </div>}

        {status==="detecting" && <div style={{margin:"24px 0",textAlign:"center"}}>
          <div style={{fontSize:14,color:"#5a5040",marginBottom:8}}>{statusText}</div>
          <div style={{display:"inline-block",width:24,height:24,border:"3px solid #e8e0d0",borderTopColor:"#a07830",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>}

        {(status==="ready"||status==="done")&&<LayoutSelector selectedLayout={selectedLayout} onSelect={setSelectedLayout} detectedLayout={detectedLayout} detectionConfidence={detectionConfidence} detectionReasoning={detectionReasoning} />}
        {(status==="ready"||status==="done")&&<FontSizeControl fontSize={fontSize} onChange={setFontSize} />}
        {(status==="ready"||status==="done")&&<ProcessingNotes notes={processingNotes} onChange={setProcessingNotes} />}

        <TokenEstimate pageImages={pageImages} selectedLayout={selectedLayout} actualUsage={status==="done"?actualUsage:null} />

        {status==="ready" && <div style={{marginTop:8}}>
          <button onClick={()=>{cancelTimer();beginProcessing();}}
            style={{width:"100%",padding:"16px 24px",fontSize:17,fontWeight:600,color:"#fff",background:"linear-gradient(135deg,#5a7040,#7a9858)",border:"none",borderRadius:12,cursor:"pointer",fontFamily:"'Georgia',serif",letterSpacing:0.5,boxShadow:"0 4px 16px rgba(90,112,64,0.3)",transition:"transform 0.15s ease,box-shadow 0.15s ease"}}
            onMouseEnter={e=>{e.target.style.transform="translateY(-1px)";e.target.style.boxShadow="0 6px 20px rgba(90,112,64,0.4)"}}
            onMouseLeave={e=>{e.target.style.transform="translateY(0)";e.target.style.boxShadow="0 4px 16px rgba(90,112,64,0.3)"}}>
            {autoStartCount>0 ? "▶ Begin Processing (auto-starting in "+autoStartCount+"s)" : "▶ Begin Processing"}
          </button>
          {autoStartCount>0 && !timerCancelled && <button onClick={cancelTimer}
            style={{width:"100%",padding:"10px 24px",fontSize:14,color:"#7a7060",background:"none",border:"1px solid #c8b898",borderRadius:10,cursor:"pointer",marginTop:8,fontFamily:"'Georgia',serif",transition:"background 0.15s ease"}}
            onMouseEnter={e=>{e.target.style.background="rgba(200,164,78,0.08)"}}
            onMouseLeave={e=>{e.target.style.background="none"}}>
            Don't auto-start — I'll click when ready
          </button>}
        </div>}

        {["analyzing","building"].includes(status)&&<ProgressBar current={progress.current} total={progress.total} status={statusText} />}

        {error && <div style={{margin:"20px 0",padding:"16px 20px",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,fontSize:14}}>
          <div style={{color:"#991b1b",fontWeight:600,marginBottom:6}}>Error</div>
          <div style={{color:"#7f1d1d",lineHeight:1.5,wordBreak:"break-word"}}>{error}</div>
          <button onClick={reset} style={{marginTop:12,background:"#991b1b",color:"#fff",border:"none",borderRadius:6,padding:"8px 20px",cursor:"pointer",fontSize:13}}>Try Again</button>
        </div>}

        {status==="done"&&allPages.length>0&&<>
          <ResultsSummary allPages={allPages} layoutName={LAYOUTS[selectedLayout]?.name} skippedPages={skippedPages} />
          <button onClick={downloadDocx} style={{width:"100%",padding:"16px 24px",fontSize:17,fontWeight:600,color:"#fff",background:"linear-gradient(135deg,#a07830,#c8a44e)",border:"none",borderRadius:12,cursor:"pointer",marginTop:8,fontFamily:"'Georgia',serif",letterSpacing:0.5,boxShadow:"0 4px 16px rgba(160,120,48,0.3)"}}>⬇ Download Word Document</button>
          {skippedPages.length>0 && <button onClick={exportSkippedPDF} style={{width:"100%",padding:"12px 24px",fontSize:14,fontWeight:600,color:"#7a5020",background:"#fef7ed",border:"1px solid #f5d0a0",borderRadius:10,cursor:"pointer",marginTop:8,fontFamily:"'Georgia',serif"}}>⬇ Export {skippedPages.length} Skipped Page{skippedPages.length>1?"s":""} as PDF</button>}
        </>}

        {status==="idle" && <div style={{marginTop:40,color:"#8a8070",fontSize:13,lineHeight:1.8}}>
          <div style={{fontWeight:700,color:"#5a5040",marginBottom:8}}>How it works</div>
          <div><strong style={{color:"#a07830"}}>1.</strong> Upload a siddur PDF — pages are rendered as high-resolution images.</div>
          <div><strong style={{color:"#a07830"}}>2.</strong> AI auto-detects the siddur layout by sampling pages from the middle of the document (you can override).</div>
          <div><strong style={{color:"#a07830"}}>3.</strong> Adjust font size, add notes, then hit <strong>Begin Processing</strong>.</div>
          <div><strong style={{color:"#a07830"}}>4.</strong> Each page is analyzed: Hebrew with nikkud, transliteration, translation, and more.</div>
          <div><strong style={{color:"#a07830"}}>5.</strong> A Word document is generated with named paragraph styles; footnotes stay on the page for Kol Haneshamah and are collected at the end of the document for other layouts.</div>
        </div>}
      </div>
    </div>
  );
}
