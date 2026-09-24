# Build the EPUB edition

The repository builds an EPUB 3 edition from the same Markdown sources used by the PDF. (It used to build 15 language editions; the community translations were removed, so only the Chinese original is produced now.)

Install [Pandoc](https://pandoc.org/), Poppler (`pdftoppm`), and optionally [EPUBCheck](https://www.w3.org/publishing/epubcheck/). The builder uses the PDF's first page as the EPUB cover. When EPUBCheck is available, the builder validates the generated book.

Build from the repository root:

```bash
./build_epub.sh          # or: ./build_epub.sh zh-CN
```

The PDF must be built first — the cover comes from its first page:

```bash
cd book && bash build_pdf.sh
```

The builder writes `深入理解-AI-Agent-李博杰-v2.0.epub` next to the PDF in `book/`. Generated EPUB files are ignored by Git.
