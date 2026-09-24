#!/usr/bin/env bash
# Build the EPUB 3 edition from the Markdown sources.
# Usage: ./build_epub.sh [zh-CN|all]
#
# This used to build 15 language editions. The community translations were
# removed, so only the Chinese original is produced now; `all` is kept as an
# alias so existing callers keep working.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SELECTION="${1:-all}"

for command in pandoc pdftoppm; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Error: $command is required." >&2
        exit 1
    fi
done

# Resolve a Python 3 interpreter. `python3` is the usual name on Unix, but on
# Windows neither the official installer nor conda creates it — there it is
# plain `python`. The version probe also skips the Microsoft Store stubs, which
# `command -v` finds but which cannot actually run.
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 &&
       "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)' >/dev/null 2>&1; then
        PYTHON="$candidate"
        break
    fi
done
if [ -z "$PYTHON" ]; then
    echo "Error: Python 3 is required (looked for python3 and python)." >&2
    exit 1
fi

case "$SELECTION" in
    all|zh-CN) ;;
    *)
        echo "Usage: $0 [zh-CN|all]" >&2
        exit 2
        ;;
esac

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ai-agent-book-epub.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

build_edition() {
    local language="$1"
    local directory title author pdf output title_label toc_label chapter
    local -a chapters

    case "$language" in
        zh-CN)
            directory="book"
            title="深入理解 AI Agent：设计原理与工程实践"
            author="李博杰"
            pdf="深入理解-AI-Agent-李博杰-v2.0.pdf"
            output="深入理解-AI-Agent-李博杰-v2.0.epub"
            title_label="扉页"
            toc_label="目录"
            chapters=(introduction.md chapter{1..10}.md afterword.md)
            ;;
        *)
            echo "Error: unsupported edition '$language'." >&2
            exit 2
            ;;
    esac

    local edition_dir="$ROOT/$directory"
    for chapter in "${chapters[@]}" "$pdf"; do
        if [ ! -f "$edition_dir/$chapter" ]; then
            echo "Error: $directory/$chapter not found." >&2
            echo "       (the $pdf is produced by book/build_pdf.sh)" >&2
            exit 1
        fi
    done

    # The EPUB cover is the first page of the matching PDF.
    # PNG rather than JPEG: some poppler builds (e.g. the one shipped in
    # TeX Live for Windows) are compiled without libjpeg and `-jpeg` silently
    # produces no file at all.
    local cover="$TMP_DIR/cover-$language.png"
    pdftoppm -f 1 -singlefile -png -r 160 \
        "$edition_dir/$pdf" "${cover%.png}"

    echo "Building $language EPUB..."
    (
        cd "$edition_dir"
        pandoc "${chapters[@]}" \
            -o "$output" \
            --from markdown+lists_without_preceding_blankline \
            --to epub3 \
            --standalone \
            --toc \
            --toc-depth=3 \
            --number-sections \
            --mathml \
            --split-level=1 \
            --highlight-style=kate \
            --lua-filter="$ROOT/epub_external_links.lua" \
            --css="$ROOT/epub.css" \
            --epub-cover-image="$cover" \
            --metadata title="$title" \
            --metadata author="$author" \
            --metadata lang="$language" \
            --metadata dir="ltr" \
            --metadata identifier="https://github.com/bojieli/ai-agent-book#$language"
    )

    "$PYTHON" "$ROOT/flatten_epub_toc.py" \
        "$edition_dir/$output" "$title_label" "$toc_label"

    if command -v epubcheck >/dev/null 2>&1; then
        epubcheck "$edition_dir/$output"
    else
        echo "Built $directory/$output (install epubcheck to validate it)."
    fi
}

build_edition zh-CN
