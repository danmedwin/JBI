#!/usr/bin/env python3
"""
Siddur Page Numberer v11

Adds accurate page numbers to Siddur Processor Word documents.
Uses LibreOffice to determine actual page breaks.

Requirements:
    pip3 install python-docx pypdf lxml
    LibreOffice (https://www.libreoffice.org)

Usage:
    python3 siddur_page_numberer.py my_siddur_processed.docx
"""

import argparse, os, re, subprocess, sys, tempfile
from pathlib import Path
from lxml import etree
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml.ns import qn
from copy import deepcopy


def find_libreoffice():
    # Check for soffice.py wrapper first (Claude sandbox)
    if os.path.exists('/mnt/skills/public/docx/scripts/office/soffice.py'):
        return '/mnt/skills/public/docx/scripts/office/soffice.py'
    for p in [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/local/bin/libreoffice", "/usr/local/bin/soffice",
        "/usr/bin/libreoffice", "/usr/bin/soffice",
        "libreoffice", "soffice",
    ]:
        try:
            if subprocess.run([p, "--version"], capture_output=True, timeout=10).returncode == 0:
                return p
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
    return None


def render_to_pdf_pages(docx_path, lo_bin):
    # Try the soffice.py wrapper first (Claude sandbox environment)
    soffice_wrapper = '/mnt/skills/public/docx/scripts/office/soffice.py'
    pdf_path = None
    basename = Path(docx_path).stem

    if os.path.exists(soffice_wrapper):
        subprocess.run(
            ['python3', soffice_wrapper, '--headless', '--convert-to', 'pdf', str(docx_path)],
            capture_output=True, text=True, timeout=300
        )
        for candidate in [
            f'/{basename}.pdf',
            str(Path(docx_path).with_suffix('.pdf')),
            f'{basename}.pdf',
        ]:
            if os.path.exists(candidate):
                pdf_path = candidate
                break

    if pdf_path is None:
        # Fall back to direct LibreOffice
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(
                [lo_bin or "soffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, str(docx_path)],
                capture_output=True, text=True, timeout=300, check=True
            )
            pdfs = list(Path(tmp).glob("*.pdf"))
            if pdfs:
                pdf_path = str(pdfs[0])

    if not pdf_path or not os.path.exists(pdf_path):
        raise RuntimeError("LibreOffice PDF conversion failed.")

    # Use pdftotext (much faster than pypdf for large documents)
    try:
        res = subprocess.run(['pdftotext', '-layout', pdf_path, '-'], capture_output=True, text=True, timeout=120)
        pages = res.stdout.split('\f')
        if pages and not pages[-1].strip():
            pages = pages[:-1]
        result = [(i + 1, text) for i, text in enumerate(pages)]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # Fallback to pypdf
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        result = [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]
    
    try:
        os.remove(pdf_path)
    except OSError:
        pass
    return result


def find_page_markers(doc):
    markers = []
    for i, para in enumerate(doc.paragraphs):
        style = para.style.name if para.style else ""
        if "Page Number" in style and para.text.strip():
            markers.append({"index": i, "text": para.text.strip()})
    return markers


def _strip_bidi(s):
    """Remove Unicode bidirectional control characters that pdftotext inserts."""
    return re.sub(r'[\u200e\u200f\u200b\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\ufeff]', '', s)


def find_marker_on_page(page_texts, marker_text, search_from_idx=0):
    """Search for marker_text in page_texts starting from search_from_idx.
    Returns (word_page_number, index_in_page_texts) or (None, None)."""
    # Pass 1: exact line match, searching forward only
    for idx in range(search_from_idx, len(page_texts)):
        wp, text = page_texts[idx]
        for line in text.split("\n"):
            cleaned = _strip_bidi(line).strip()
            if cleaned == marker_text:
                return wp, idx
    # Pass 2: word-boundary regex match on cleaned text, searching forward only
    # Skip matches preceded by "Page " (skipped-page messages in rendered PDF)
    pattern = r"(?:^|\s)" + re.escape(marker_text) + r"(?=\s|$)"
    for idx in range(search_from_idx, len(page_texts)):
        wp, text = page_texts[idx]
        cleaned = _strip_bidi(text)
        m = re.search(pattern, cleaned, re.MULTILINE)
        if m:
            # Check that this isn't inside a "Page X [Y]" or "[Page X skipped" context
            start = max(0, m.start() - 6)
            prefix = cleaned[start:m.start()+1].lower()
            if "page " in prefix:
                continue
            return wp, idx
    return None, None


def build_page_ranges(markers, page_texts):
    MAX_SPAN = 8  # No single source page should span more than this many Word pages
    results = []
    prev_wp = 0
    search_from_idx = 0
    for mi, m in enumerate(markers):
        wp, found_idx = find_marker_on_page(page_texts, m["text"], search_from_idx)
        if wp is None:
            wp = prev_wp + 1
            print(f"  WARNING: '{m['text']}' not found, guessing page {wp}")
        else:
            # Sanity check: if span would be too large, the match is probably wrong
            span = wp - prev_wp
            if span > MAX_SPAN and prev_wp > 0:
                print(f"  WARNING: '{m['text']}' found on page {wp} but span={span} exceeds max, guessing page {prev_wp+1}")
                wp = prev_wp + 1
                # Don't advance search_from_idx so next marker can still find its page
            else:
                search_from_idx = found_idx + 1
        pages = list(range(prev_wp + 1, wp + 1))
        results.append({
            "source": m["text"],
            "marker_index": m["index"],
            "word_pages": pages,
        })
        prev_wp = wp
    return results


def compute_labels(ranges):
    letters = "abcdefghijklmnopqrstuvwxyz"
    for r in ranges:
        if len(r["word_pages"]) <= 1:
            r["labels"] = [(r["word_pages"][0] if r["word_pages"] else 0, r["source"])]
        else:
            r["labels"] = []
            for i, wp in enumerate(r["word_pages"]):
                letter = letters[i] if i < len(letters) else str(i + 1)
                m = re.match(r"^(\d+)\s*\[(\d+)\]$", r["source"])
                if m:
                    r["labels"].append((wp, f"{m.group(1)}{letter} [{m.group(2)}{letter}]"))
                else:
                    r["labels"].append((wp, f"{r['source']}{letter}"))
    return ranges


def build_paragraph_page_map(doc, page_texts):
    collapsed = [(wp, text.replace("\n", " ").replace("  ", " ")) for wp, text in page_texts]
    para_to_page = {}
    min_page = 1
    for i, para in enumerate(doc.paragraphs):
        pt = para.text.strip()
        if len(pt) < 5:
            continue
        sig = pt[:15]
        for wp, ctext in collapsed:
            if wp < min_page:
                continue
            if sig in ctext:
                para_to_page[i] = wp
                min_page = wp
                break
    return para_to_page, sorted(para_to_page.items())


def get_style(para):
    return para.style.name if para.style else ""


def is_new_reading(para):
    t = para.text.strip()
    return bool(re.match(r'^[A-Z]{2,}[\s,;:\.!]', t))


def is_attribution(para):
    """Is this paragraph an author attribution line?
    E.g., 'Sidney Greenberg (Adapted)', 'Chaim Stern', 'Psalms 42:2-6'"""
    t = para.text.strip()
    if not t or len(t) > 100:
        return False
    # Short line with a name pattern: capitalized words, possibly with (Adapted), (Modified), etc.
    if re.match(r'^[A-Z][a-z]', t) and len(t) < 80:
        return True
    # Source citations like "Psalms 42:2-6", "Isaiah 6:3", "Talmud Berahot 34b"
    if re.match(r'^(Psalms?|Isaiah|Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Proverbs|'
                r'Job|Ecclesiastes|Song of Songs|Lamentations|Daniel|Ezra|Nehemiah|'
                r'Chronicles|Samuel|Kings|Judges|Ruth|Esther|Amos|Hosea|Micah|'
                r'Jeremiah|Ezekiel|Habakkuk|Zechariah|Malachi|Talmud|Mishnah|Midrash|Zohar)', t):
        return True
    return False


def is_section_header(para):
    s = get_style(para)
    return "Section Header" in s or "Heading" in s


def should_start_new_page(para):
    """Should this paragraph start a new page? (i.e., break BEFORE it)"""
    if is_section_header(para):
        return True
    if is_new_reading(para):
        return True
    return False


def find_best_insert_point(wp, mapped_list, para_to_page, doc):
    """
    Find the best paragraph to insert a page number AFTER.

    Rules (in priority order):
    1. Section headers ALWAYS go to the next page — break before them
       regardless of position on the page.
    2. New readings (ALL CAPS start) in the bottom half go to next page.
    3. Hebrew→Transliteration boundary in the bottom half is acceptable.
    4. Default: second-to-last paragraph.
    5. If only 1 paragraph: split it.
    6. After choosing, check if only 1 paragraph would remain after the break.
       If that paragraph is long (>200 chars), split it instead of leaving it alone.
    """
    page_paras = [pi for pi, wp2 in mapped_list if wp2 == wp]

    if len(page_paras) == 0:
        return None, False

    if len(page_paras) == 1:
        return page_paras[0], True

    # Pass 1: Scan ALL paragraphs for section headers (always push to next page)
    for i in range(len(page_paras) - 1, 0, -1):
        para = doc.paragraphs[page_paras[i]]
        if is_section_header(para):
            candidate = page_paras[i - 1]
            # Don't strand another header — keep scanning back
            while i > 1 and is_section_header(doc.paragraphs[candidate]):
                i -= 1
                candidate = page_paras[i - 1]
            if not is_section_header(doc.paragraphs[candidate]):
                return candidate, False

    # Pass 2: Scan bottom half for new readings, style transitions
    midpoint = max(len(page_paras) // 2, 1)

    for i in range(len(page_paras) - 1, midpoint - 1, -1):
        para = doc.paragraphs[page_paras[i]]
        prev_para = doc.paragraphs[page_paras[i - 1]]
        para_style = get_style(para)
        prev_style = get_style(prev_para)

        if is_new_reading(para):
            # Scan backward past consecutive new readings
            j = i
            while j > 1 and should_start_new_page(doc.paragraphs[page_paras[j - 1]]):
                j -= 1
            # But don't go above midpoint
            if j >= midpoint:
                return page_paras[j - 1], False
            else:
                return page_paras[i - 1], False

        # Hebrew → Transliteration boundary: try to keep transliteration with Hebrew
        # by splitting the transliteration at a period rather than pushing it all away
        if "Transliteration" in para_style and "Hebrew" in prev_style:
            # Check if this transliteration has periods we can split at
            if '.' in para.text:
                return page_paras[i], "split_translit"
            # No periods — fall back to breaking before transliteration
            return page_paras[i - 1], False

        # Any Hebrew after non-Hebrew
        if "Hebrew" in para_style and "Hebrew" not in prev_style:
            return page_paras[i - 1], False

    # Default: second-to-last
    best = page_paras[-2]

    # Don't break right before an attribution line — keep it with the reading above
    best_pos = page_paras.index(best) if best in page_paras else -1
    if best_pos >= 0 and best_pos + 1 < len(page_paras):
        next_para = doc.paragraphs[page_paras[best_pos + 1]]
        if is_attribution(next_para) and best_pos > 0:
            best = page_paras[best_pos - 1]

    # Check: would only 1 long paragraph remain after the break?
    remaining_after = page_paras[page_paras.index(best) + 1:] if best in page_paras else []
    if len(remaining_after) == 1:
        remaining_para = doc.paragraphs[remaining_after[0]]
        remaining_style = get_style(remaining_para)
        # If it's a long translation or transliteration, offer to split it
        if len(remaining_para.text) > 200 and ("Translation" in remaining_style or "Transliteration" in remaining_style):
            return remaining_after[0], True

    return best, False


def split_paragraph_at_last_period(doc, para_index):
    """Split a paragraph at the LAST sentence boundary, keeping as much as
    possible on the current page (with the preceding Hebrew).
    Returns para_index on success, None on failure."""
    para = doc.paragraphs[para_index]
    text = para.text
    # Find all period-based sentence boundaries
    sentence_ends = []
    for m in re.finditer(r'[.]\s+', text):
        sentence_ends.append(m.start() + 1)
    if not sentence_ends:
        return None

    # Pick the LAST period to keep maximum text on the current page
    best = sentence_ends[-1]
    first_half = text[:best].rstrip()
    second_half = text[best:].lstrip()
    if not first_half or not second_half:
        return None

    para_element = para._element
    for run in para.runs:
        run.text = ""
    if para.runs:
        para.runs[0].text = first_half
    else:
        para.add_run(first_half)

    new_p = deepcopy(para_element)
    for r_elem in new_p.findall(qn('w:r')):
        new_p.remove(r_elem)
    r = etree.SubElement(new_p, qn('w:r'))
    orig_runs = para_element.findall(qn('w:r'))
    if orig_runs:
        orig_rPr = orig_runs[0].find(qn('w:rPr'))
        if orig_rPr is not None:
            r.insert(0, deepcopy(orig_rPr))
    t = etree.SubElement(r, qn('w:t'))
    t.text = second_half
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    para_element.addnext(new_p)
    return para_index


def split_paragraph_at_midpoint(doc, para_index):
    para = doc.paragraphs[para_index]
    text = para.text
    sentence_ends = []
    for m in re.finditer(r'[.!?]\s+(?=[A-Z"\'])', text):
        sentence_ends.append(m.start() + 1)
    if not sentence_ends:
        for m in re.finditer(r'[.!?]\s+', text):
            sentence_ends.append(m.start() + 1)
    if not sentence_ends:
        for m in re.finditer(r'[,;]\s+', text):
            sentence_ends.append(m.start() + 1)
    if not sentence_ends:
        mid = len(text) // 2
        sp = text.rfind(' ', 0, mid + 20)
        if sp > 10:
            sentence_ends = [sp]
    if not sentence_ends:
        return None

    mid = len(text) // 2
    best = min(sentence_ends, key=lambda pos: abs(pos - mid))
    first_half = text[:best].rstrip()
    second_half = text[best:].lstrip()
    if not first_half or not second_half:
        return None

    para_element = para._element
    for run in para.runs:
        run.text = ""
    if para.runs:
        para.runs[0].text = first_half
    else:
        para.add_run(first_half)

    new_p = deepcopy(para_element)
    for r_elem in new_p.findall(qn('w:r')):
        new_p.remove(r_elem)
    r = etree.SubElement(new_p, qn('w:r'))
    orig_runs = para_element.findall(qn('w:r'))
    if orig_runs:
        orig_rPr = orig_runs[0].find(qn('w:rPr'))
        if orig_rPr is not None:
            r.insert(0, deepcopy(orig_rPr))
    t = etree.SubElement(r, qn('w:t'))
    t.text = second_half
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    para_element.addnext(new_p)
    return para_index


def make_page_num_xml(label, style_id="PageNumber"):
    p = etree.Element(qn('w:p'))
    pPr = etree.SubElement(p, qn('w:pPr'))
    # pStyle must come first in pPr per OOXML schema
    pStyle = etree.SubElement(pPr, qn('w:pStyle'))
    pStyle.set(qn('w:val'), style_id)
    spacing = etree.SubElement(pPr, qn('w:spacing'))
    spacing.set(qn('w:before'), '400')
    spacing.set(qn('w:after'), '0')
    jc = etree.SubElement(pPr, qn('w:jc'))
    jc.set(qn('w:val'), 'center')

    r = etree.SubElement(p, qn('w:r'))
    rPr = etree.SubElement(r, qn('w:rPr'))
    rFonts = etree.SubElement(rPr, qn('w:rFonts'))
    rFonts.set(qn('w:ascii'), 'Tahoma')
    rFonts.set(qn('w:hAnsi'), 'Tahoma')
    sz = etree.SubElement(rPr, qn('w:sz'))
    sz.set(qn('w:val'), '44')
    color = etree.SubElement(rPr, qn('w:color'))
    color.set(qn('w:val'), '000000')
    t = etree.SubElement(r, qn('w:t'))
    t.text = label
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

    r2 = etree.SubElement(p, qn('w:r'))
    br = etree.SubElement(r2, qn('w:br'))
    br.set(qn('w:type'), 'page')
    return p


def process(input_path, output_path, lo_bin):
    print("Step 1: Analyzing document...")
    doc = Document(str(input_path))
    markers = find_page_markers(doc)
    print(f"  {len(markers)} source page marker(s).\n")

    # Detect the page number style ID from existing markers
    pn_style_id = "PageNumber"
    if markers:
        para = doc.paragraphs[markers[0]["index"]]
        if para.style and para.style.style_id:
            pn_style_id = para.style.style_id
    print(f"  Page number style: {pn_style_id}")

    print("Step 2: Rendering with LibreOffice...")
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        doc.save(tmp.name); tmp_path = tmp.name
    try:
        page_texts = render_to_pdf_pages(tmp_path, lo_bin)
    finally:
        os.unlink(tmp_path)
    total_pages = len(page_texts)
    print(f"  {total_pages} Word page(s).\n")

    print("Step 3: Mapping source pages to Word pages...")
    ranges = build_page_ranges(markers, page_texts)
    overflow = [r for r in ranges if len(r["word_pages"]) > 1]
    print(f"  {len(ranges) - len(overflow)} single-page, {len(overflow)} overflow.\n")

    print("Step 4: Computing labels...")
    ranges = compute_labels(ranges)
    for r in ranges:
        if len(r["labels"]) > 1:
            print(f"    {r['source']} → {', '.join(l for _, l in r['labels'])}")
    print()

    print("Step 5: Updating and repositioning markers...")
    updated = 0
    repositioned = 0

    if overflow:
        # Build paragraph-page map now since we need it for repositioning
        para_to_page, mapped_list = build_paragraph_page_map(doc, page_texts)

    for r in ranges:
        last_label = r["labels"][-1][1]
        marker_para = doc.paragraphs[r["marker_index"]]

        # Update text if label changed
        if last_label != r["source"]:
            for run in marker_para.runs:
                run.text = ""
            if marker_para.runs:
                marker_para.runs[0].text = last_label
            else:
                run = marker_para.add_run(last_label)
                run.font.name = "Tahoma"
                run.font.size = Pt(22)
                run.font.color.rgb = RGBColor(0x00, 0x00, 0x00)
            updated += 1

        # For overflow sources, check if the marker should be repositioned
        # on its page (move it before headers/new readings)
        if len(r["labels"]) > 1:
            marker_wp = r["labels"][-1][0]  # Word page the marker is on
            page_paras = [pi for pi, wp2 in mapped_list if wp2 == marker_wp]

            if len(page_paras) >= 2:
                # Find best position on this page using same logic
                best_idx, _ = find_best_insert_point(marker_wp, mapped_list, para_to_page, doc)

                if best_idx is not None and best_idx < r["marker_index"]:
                        # Determine: should we insert before or after best_idx?
                        # If best_idx itself is a new reading or header, go before it
                        best_para = doc.paragraphs[best_idx]
                        insert_before_best = should_start_new_page(best_para)

                        marker_element = marker_para._element
                        parent = marker_element.getparent()
                        parent.remove(marker_element)

                        # Add page break to marker if needed
                        has_break = False
                        for run_el in marker_element.findall(qn('w:r')):
                            for br in run_el.findall(qn('w:br')):
                                if br.get(qn('w:type')) == 'page':
                                    has_break = True
                        if not has_break:
                            r2 = etree.SubElement(marker_element, qn('w:r'))
                            br = etree.SubElement(r2, qn('w:br'))
                            br.set(qn('w:type'), 'page')

                        ref = doc.paragraphs[best_idx]._element
                        if insert_before_best:
                            ref.addprevious(marker_element)
                        else:
                            ref.addnext(marker_element)
                        repositioned += 1

                        next_content = ""
                        scan_start = best_idx + (0 if insert_before_best else 1)
                        for j in range(scan_start, min(scan_start + 3, len(doc.paragraphs))):
                            t = doc.paragraphs[j].text.strip()
                            if t and "Page Number" not in get_style(doc.paragraphs[j]):
                                next_content = t[:40]
                                break
                        pos = "before" if insert_before_best else "after"
                        print(f"    Moved '{last_label}' {pos} [{best_idx}] '{next_content}...'")

    print(f"  Updated {updated} marker(s), repositioned {repositioned}.\n")

    if overflow:
        print("Step 6: Finding insertion points...")
        # para_to_page and mapped_list already built in Step 5

        actions = []
        for r in ranges:
            if len(r["labels"]) <= 1:
                continue
            for wp, label in r["labels"][:-1]:
                insert_idx, needs_split = find_best_insert_point(wp, mapped_list, para_to_page, doc)
                if insert_idx is None:
                    print(f"    WARNING: No point for '{label}' (page {wp})")
                    continue

                next_content = ""
                for j in range(insert_idx + 1, min(insert_idx + 3, len(doc.paragraphs))):
                    t = doc.paragraphs[j].text.strip()
                    if t:
                        s = get_style(doc.paragraphs[j])
                        next_content = f"[{s}] {t[:35]}"
                        break

                if needs_split == "split_translit":
                    actions.append(("split_translit", insert_idx, label))
                    print(f"    Split translit [{insert_idx}] for '{label}' (keep max with Hebrew)")
                elif needs_split:
                    actions.append(("split", insert_idx, label))
                    print(f"    Split [{insert_idx}] for '{label}' (before '{next_content}...')")
                else:
                    print(f"    '{label}' after [{insert_idx}] (before '{next_content}...')")
                    actions.append(("insert", insert_idx, label))

        actions.sort(key=lambda x: x[1], reverse=True)

        inserted = 0
        splits = 0
        for action in actions:
            atype, para_idx, label = action
            if atype == "split_translit":
                result = split_paragraph_at_last_period(doc, para_idx)
                if result is not None:
                    splits += 1
                    # Insert page number AFTER the first half (which stays with Hebrew)
                    ref = doc.paragraphs[para_idx]._element
                    new_p = make_page_num_xml(label, pn_style_id)
                    ref.addnext(new_p)
                    inserted += 1
                else:
                    # Couldn't split at period — fall back to inserting before transliteration
                    ref = doc.paragraphs[para_idx]._element
                    new_p = make_page_num_xml(label, pn_style_id)
                    ref.addprevious(new_p)
                    inserted += 1
            elif atype == "split":
                result = split_paragraph_at_midpoint(doc, para_idx)
                if result is not None:
                    splits += 1
                ref = doc.paragraphs[para_idx]._element
                new_p = make_page_num_xml(label, pn_style_id)
                ref.addnext(new_p)
                inserted += 1
            else:
                ref = doc.paragraphs[para_idx]._element
                new_p = make_page_num_xml(label, pn_style_id)
                ref.addnext(new_p)
                inserted += 1

        print(f"\n  Inserted {inserted}, split {splits}.")
    else:
        print("Step 6: No overflow.")

    doc.save(output_path)
    print(f"\nSaved: {output_path}")
    return total_pages, ranges


def main():
    parser = argparse.ArgumentParser(description="Add page numbers to Siddur Processor output.")
    parser.add_argument("docx", help="Path to .docx from Siddur Processor")
    parser.add_argument("--output", default=None, help="Output path (default: _numbered suffix)")
    args = parser.parse_args()

    path = Path(args.docx)
    if not path.exists():
        print(f"ERROR: {path} not found.", file=sys.stderr); sys.exit(1)

    output = args.output or str(path.with_suffix("")).replace("_processed", "") + "_numbered.docx"
    lo = find_libreoffice()
    if not lo:
        print("ERROR: LibreOffice not found.", file=sys.stderr); sys.exit(1)

    print(f"LibreOffice: {lo}\n")
    print(f"Siddur Page Numberer")
    print(f"{'=' * 50}")
    print(f"Input:  {path.name}")
    print(f"Output: {Path(output).name}\n")

    total, ranges = process(str(path), output, lo)
    ovf = sum(1 for r in ranges if len(r["labels"]) > 1)

    print(f"\n{'=' * 50}")
    print(f"DONE!")
    print(f"  Word pages: {total}")
    if ovf:
        print(f"  Overflow:   {ovf} source page(s) got letter suffixes")
    print(f"  Output:     {output}")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
