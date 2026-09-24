import { availableChapters } from '../src/lib/available-chapters.mjs';
import { figurePaths } from '../src/lib/figure-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
/**
 * Read a source-tree text file with its line endings normalised to LF.
 *
 * The repository stores LF, but a Windows checkout with core.autocrlf=true
 * materialises CRLF. These tests compare source text against generated output
 * byte-for-byte, so without this they pass on CI and fail on Windows for a
 * reason that has nothing to do with the book. Comparing the *document* must
 * not depend on the checkout's line endings.
 */
const readSource = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const source = readSource(new URL('../../book/chapter1.md', import.meta.url));
const editionData = JSON.parse(
  readFileSync(new URL('../src/lib/editions.json', import.meta.url), 'utf8'),
);
const editions = Object.entries(editionData).map(([lang, edition]) => ({
  lang,
  ...edition,
}));
const pages = editions.flatMap((edition) =>
  [
    edition.home,
    ...availableChapters.map((number) =>
      edition.chapter.replace('chapter1', `chapter${number}`),
    ),
  ].map((route) => ({
    route,
    html: readFileSync(join(dist, route, 'index.html'), 'utf8'),
  })),
);
const chapter = pages[1].html;
const article = chapter.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
assert.ok(article, 'The complete chapter must be rendered in an article.');
const count = (html, tag) =>
  [...html.matchAll(new RegExp(`<${tag}\\b`, 'g'))].length;
const ids = (html) =>
  new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const displayMathCount = (markdown) => {
  let count = 0,
    open = false;
  for (const line of markdown.split('\n')) {
    const value = line.replace(/^>\s?/, '').trim();
    if (!open && value.startsWith('$$')) {
      if (value.length > 4 && value.endsWith('$$')) count++;
      else open = true;
    } else if (open && value.endsWith('$$')) {
      count++;
      open = false;
    }
  }
  return count;
};

test('Chapter 1 retains its sections, code, tables, figures, and footnotes', () => {
  assert.equal(count(chapter, 'h1'), 1);
  for (const level of [2, 3, 4]) {
    const headings = [...source.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm'))]
      .length;
    // The renderer adds one h2 for the footnotes section.
    assert.equal(count(article, `h${level}`), headings + (level === 2 ? 1 : 0));
  }
  assert.equal(count(article, 'pre'), 4);
  assert.equal(count(article, 'table'), 5);
  assert.equal(count(article, 'figure'), 7);
  assert.equal(count(article, 'figcaption'), 7);
  const footnotes = [...source.matchAll(/^\s*(?:>\s*)?\[\^([^\]]+)\]:/gm)].map(
    (match) => match[1],
  );
  // Eight in the Chinese manuscript (the English edition this test used to read
  // had nine).
  assert.equal(footnotes.length, 8);
  for (const note of footnotes)
    assert.ok(
      ids(article).has(`user-content-fn-${note}`),
      `Missing footnote ${note}`,
    );
  // The Chinese manuscript's headings for the sections this test used to look
  // up in English ("Thought Questions" / "Contextual adaptation").
  assert.match(article, /思考题/);
  assert.match(article, /上下文适应/);
});

test('All generated pages resolve local assets, links, and fragments', () => {
  for (const page of pages) {
    const pageIds = [...page.html.matchAll(/\bid="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(
      new Set(pageIds).size,
      pageIds.length,
      `Duplicate IDs on ${page.route}`,
    );
    // Restrict attribute matching to actual tags: code examples can contain
    // literal href/src strings whose opening angle brackets are escaped.
    const tags = page.html.match(/<[A-Za-z][^>]*>/g)?.join('\n') ?? '';
    for (const [, ref] of tags.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const url = new URL(ref, `https://preview.example${page.route}`);
      if (url.origin !== 'https://preview.example') continue;
      const path = join(
        dist,
        decodeURIComponent(url.pathname),
        url.pathname.endsWith('/') ? 'index.html' : '',
      );
      assert.ok(
        existsSync(path),
        `Missing local asset or route: ${ref} on ${page.route}`,
      );
      if (url.hash && path.endsWith('.html')) {
        assert.ok(
          ids(readFileSync(path, 'utf8')).has(
            decodeURIComponent(url.hash.slice(1)),
          ),
          `Missing fragment: ${ref}`,
        );
      }
    }
  }
});

function assertFigureContent(copied, original, image) {
  assert.deepEqual(copied, original, `Original figure changed: ${image}`);
}

test('Chapter figures retain their source content, with Figure 1-1 labels reflowed', () => {
  const images = [...source.matchAll(/!\[[^\]]*\]\((images\/[^)]+)\)/g)].map(
    (match) => match[1],
  );
  for (const image of images) {
    const original = readFileSync(
      new URL(`../../book/${image}`, import.meta.url),
    );
    const copied = readFileSync(join(dist, 'book', image));
    assertFigureContent(copied, original, image);
  }
});

test('Each edition renders its original content, figures, and note scope', () => {
  for (const edition of editions) {
    const homepage = pages.find((page) => page.route === edition.home).html;
    const reader = pages.find((page) => page.route === edition.chapter).html;
    const source = readFileSync(
      new URL(
        `../../${edition.directory}/chapter1${edition.suffix}.md`,
        import.meta.url,
      ),
      'utf8',
    );
    const article = reader.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
    assert.ok(article);
    assert.equal(count(reader, 'h1'), 1);
    const title = source
      .match(/^#\s+(.+)$/m)[1]
      .replaceAll('&', '&amp;')
      .replaceAll("'", '&#39;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    assert.ok(reader.includes(title), `Missing title for ${edition.lang}`);
    for (const level of [2, 3, 4]) {
      const headings = [
        ...source.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm')),
      ].length;
      assert.equal(
        count(article, `h${level}`),
        headings + (level === 2 ? 1 : 0),
      );
    }
    assert.equal(count(article, 'figure'), 7);
    assert.equal(count(article, 'table'), 5);
    assert.equal(count(article, 'pre'), 4);
    assert.ok(
      reader.includes(
        `data-chapter-key="ai-agents-in-depth:${edition.lang}:chapter1"`,
      ),
    );
    assert.ok(reader.includes(`href="${edition.home}#contents"`));
    assert.ok(
      reader.includes(`/${edition.directory}/chapter2${edition.suffix}/`),
    );
    for (const [html, kind] of [
      [homepage, 'home'],
      [reader, 'chapter'],
    ]) {
      assert.ok(html.includes(`lang="${edition.lang}" dir="${edition.dir}"`));
      if (kind === 'chapter')
        assert.ok(
          html.includes(`AI-Agents-in-Depth-${edition.pdf}.pdf`),
          `Missing PDF for ${edition.lang}`,
        );
      if (edition.lang !== 'en') {
        assert.ok(!html.includes('>My highlights<'));
        assert.ok(!html.includes('>Text size<'));
        assert.ok(!html.includes('>Start reading'));
      }
    }
    for (const [, image] of source.matchAll(
      /!\[[^\]]*\]\((images\/[^)]+)\)/g,
    )) {
      assert.ok(
        article.includes(
          `src="${figurePaths(edition.directory, image).light}"`,
        ),
      );
      assertFigureContent(
        readFileSync(join(dist, edition.directory, image)),
        readFileSync(
          new URL(`../../${edition.directory}/${image}`, import.meta.url),
        ),
        image,
      );
    }
  }
});

test('Chinese footnotes keep separate citation URLs and translated navigation', () => {
  for (const edition of editions.filter(({ lang }) => lang.startsWith('zh-'))) {
    const html = pages.find((page) => page.route === edition.chapter).html;
    assert.ok(!html.includes('>Footnotes<'));
    assert.ok(!html.includes('aria-label="Back to reference'));
    assert.ok(html.includes(edition.lang === 'zh-CN' ? '>注释<' : '>註釋<'));
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      assert.ok(
        !decodeURI(href).match(/、https?:\/\/|。$/),
        `Merged or punctuated citation: ${href}`,
      );
    }
    for (const url of [
      'https://manus.im/blog/manus-sandbox',
      'https://manus.im/blog/manus-google-drive-connector',
      'https://manus.im/blog/manus-my-computer-desktop',
      'https://github.com/openclaw/openclaw',
      'https://docs.openclaw.ai/tools',
      'https://adk.dev/workflows/',
    ])
      assert.ok(html.includes(`href="${url}"`));
  }
});

test('The UI catalog is complete and delivered to the browser', () => {
  assert.equal(editions.length, 1);
  assert.equal(pages.length, editions.length * (availableChapters.length + 1));
  for (const edition of editions) {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../src/lib/locales/${edition.lang}.json`, import.meta.url),
        'utf8',
      ),
    );
    assert.ok(
      Object.values(messages).every(
        (value) => typeof value === 'string' && value.trim(),
      ),
      edition.lang,
    );
    for (const route of [edition.home, edition.chapter]) {
      const html = pages.find((page) => page.route === route).html;
      const embedded = JSON.parse(
        html.match(
          /<script id="book-ui-messages" type="application\/json">([\s\S]*?)<\/script>/,
        )?.[1] ?? 'null',
      );
      assert.deepEqual(embedded, messages, route);
    }
  }
});

test('Chapter 1 keeps its external reference links intact', () => {
  // This used to also check that Arabic citation punctuation never got absorbed
  // into a URL; the Arabic edition is gone.
  const html = pages.find((page) => page.route === editions[0].chapter).html;
  for (const href of [
    'https://www.drjoshcsimmons.com/writing/we-are-entering-the-graph-engineering-phase',
    'https://x.com/steipete/status/2078277297791189132',
    'https://docs.langchain.com/oss/python/langgraph/overview',
    'https://learn.microsoft.com/en-us/agent-framework/workflows/',
  ]) {
    assert.ok(html.includes(`href="${href}"`));
  }
});

test('Chinese homepage is the default and the only language served', () => {
  assert.ok(
    readFileSync(join(dist, 'index.html'), 'utf8').includes('lang="zh-CN"'),
  );
  // No other edition directory is emitted.
  for (const lang of ['en', 'zh-TW', 'ar', 'ja']) {
    assert.ok(
      !existsSync(join(dist, lang)),
      `${lang} should not be built any more`,
    );
  }
  // The machine-translation tier was removed along with the other editions.
  for (const { html } of pages) {
    assert.equal([...html.matchAll(/data-machine-language=/g)].length, 0);
    assert.ok(!html.includes('未经审核 / Not vetted'));
  }
});

test('Chapter 2 preserves all editions, figures, outlines, and chapter isolation', () => {
  for (const edition of editions) {
    const route = edition.chapter.replace('chapter1', 'chapter2');
    const html = readFileSync(join(dist, route, 'index.html'), 'utf8');
    const markdown = readFileSync(
      new URL(
        `../../${edition.directory}/chapter2${edition.suffix}.md`,
        import.meta.url,
      ),
      'utf8',
    );
    const content = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)[1];
    assert.equal(count(content, 'img'), 17, edition.lang);
    assert.equal(count(content, 'h3'), 32, edition.lang);
    assert.ok(
      html.includes(
        `data-chapter-key="ai-agents-in-depth:${edition.lang}:chapter2"`,
      ),
    );
    assert.ok(html.includes(`href="${edition.chapter}"`));
    assert.ok(html.includes(`/chapter3${edition.suffix}/`));
    assert.ok(!content.includes('{height='));
    assert.ok(!content.includes('katex-error'));
    assert.ok(content.includes('class="katex"'), edition.lang);
    for (const [, image] of markdown.matchAll(
      /!\[[^\]]*\]\((images\/[^)]+)\)/g,
    )) {
      assert.ok(
        content.includes(
          `src="${figurePaths(edition.directory, image).light}"`,
        ),
      );
      assertFigureContent(
        readFileSync(join(dist, edition.directory, image)),
        readFileSync(
          new URL(`../../${edition.directory}/${image}`, import.meta.url),
        ),
        image,
      );
    }
  }
});

test('Chapter 2 keeps its teaching code blocks and readable comments', () => {
  // The second half of this test checked the nine hand-written English Chapter 2
  // figure replacements under public/figures/chapter2-en/; those were removed
  // along with the English edition.
  const html = readFileSync(join(dist, 'book/chapter2/index.html'), 'utf8');
  assert.equal([...html.matchAll(/data-language="jsonc"/g)].length, 6);
  assert.equal(
    [...html.matchAll(/data-language="agent-pseudocode"/g)].length,
    4,
  );
  assert.equal(
    [...html.matchAll(/data-language="agent-instructions"/g)].length,
    2,
  );
  assert.ok(
    html.includes('color:#9DA7B3'),
    'Explanatory comments use readable contrast',
  );
});

test('Every chapter figure has two styled variants and an untouched original', () => {
  for (const edition of editions)
    for (const number of availableChapters) {
      const markdown = readFileSync(
        new URL(
          `../../${edition.directory}/chapter${number}${edition.suffix}.md`,
          import.meta.url,
        ),
        'utf8',
      );
      const html = readFileSync(
        join(
          dist,
          edition.chapter.replace('chapter1', `chapter${number}`),
          'index.html',
        ),
        'utf8',
      );
      for (const [, image] of markdown.matchAll(
        /!\[[^\]]*\]\((images\/[^)]+)\)/g,
      )) {
        const paths = figurePaths(edition.directory, image);
        assert.ok(
          html.includes(`href="${paths.original}"`),
          `No source link: ${paths.original}`,
        );
        for (const theme of ['light', 'dark']) {
          assert.ok(existsSync(join(dist, paths[theme])));
          assert.ok(html.includes(`data-figure-${theme}="${paths[theme]}"`));
          if (
            /^images\/fig(?:4-[1-4]|5-(?:[1-9]|10|11)|6-(?:[1-9]|1[0-4])|7-(?:[1-9]|10))\.svg$/.test(
              image,
            )
          ) {
            const original = readFileSync(
              new URL(`../../${edition.directory}/${image}`, import.meta.url),
              'utf8',
            );
            const variant = readFileSync(join(dist, paths[theme]), 'utf8');
            assert.ok(count(variant, 'foreignObject') > 2);
            for (const [, label] of original.matchAll(
              /<text\b[^>]*?(?:\/>|>([\s\S]*?)<\/text>)/g,
            ))
              assert.ok(
                variant.replace(/\s+/g, ' ').includes(
                  (label ?? '')
                    .replace(/<tspan\b[^>]*>/g, '')
                    .replace(/<\/tspan>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim(),
                ),
                `Missing diagram label in ${edition.lang}: ${image}: ${label}`,
              );
            assert.equal(
              readFileSync(join(dist, paths.original), 'utf8'),
              original,
            );
          }
        }
      }
    }
});

for (const chapterNumber of [3, 4, 5, 6, 7, 8, 9, 10])
  test(`Chapter ${chapterNumber} preserves code, figures, headings, and reader navigation in all editions`, async () => {
    const { fromMarkdown } = await import('mdast-util-from-markdown');
    const decode = (s) =>
      s
        .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
          String.fromCodePoint(parseInt(n, 16)),
        )
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(
          /&(lt|gt|quot|apos|amp);/g,
          (_, n) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[n],
        );
    for (const edition of editions) {
      const route = edition.chapter.replace(
        'chapter1',
        `chapter${chapterNumber}`,
      );
      const html = readFileSync(join(dist, route, 'index.html'), 'utf8');
      const markdown = readSource(
        new URL(
          `../../${edition.directory}/chapter${chapterNumber}${edition.suffix}.md`,
          import.meta.url,
        ),
      );
      const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)[1];
      const code = [],
        inlineCode = [],
        headings = [],
        images = [];
      function visit(node) {
        if (node.type === 'code') code.push(node.value);
        if (node.type === 'inlineCode') inlineCode.push(node.value);
        if (node.type === 'image') images.push(node.url);
        if (node.type === 'heading' && node.depth === 3) headings.push(node);
        node.children?.forEach(visit);
      }
      visit(fromMarkdown(markdown));
      const rendered = [
        ...article.matchAll(
          /<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g,
        ),
      ].map((m) => decode(m[1].replace(/<[^>]*>/g, '')).replace(/\n$/, ''));
      assert.deepEqual(rendered, code, `Code altered in ${edition.lang}`);
      if (chapterNumber === 4) {
        const renderedInline = [
          ...article.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g),
        ].map((match) => decode(match[1]));
        assert.deepEqual(
          renderedInline.sort(),
          inlineCode.sort(),
          `Inline code altered in ${edition.lang}`,
        );
        assert.equal(count(article, 'table'), 2, edition.lang);
        for (const level of [2, 4]) {
          const expected = [
            ...markdown.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm')),
          ].length;
          assert.equal(
            count(article, `h${level}`),
            expected + (level === 2 ? 1 : 0),
            edition.lang,
          );
        }
        for (const [, id] of markdown.matchAll(/^\[\^([^\]]+)\]:/gm))
          assert.ok(
            ids(article).has(`user-content-fn-${id}`),
            `Missing footnote ${id}`,
          );
      }
      if (chapterNumber === 5) {
        assert.equal(
          (article.match(/data-language="book-example"/g) || []).length,
          1,
          edition.lang,
        );
        assert.equal(
          (article.match(/data-language="python"/g) || []).length,
          1,
          edition.lang,
        );
        assert.equal(count(article, 'table'), 1, edition.lang);
        for (const [, id] of markdown.matchAll(/^\[\^([^\]]+)\]:/gm))
          assert.ok(
            ids(article).has(`user-content-fn-${id}`),
            `Missing footnote ${id}`,
          );
      }
      if (chapterNumber === 6) {
        assert.equal(
          (article.match(/data-language="book-interaction"/g) || []).length,
          8,
          edition.lang,
        );
        assert.equal(
          (article.match(/data-language="json"/g) || []).length,
          1,
          edition.lang,
        );
        assert.equal(count(article, 'table'), 5, edition.lang);
        for (const level of [2, 4]) {
          const expected = [
            ...markdown.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm')),
          ].length;
          assert.equal(
            count(article, `h${level}`),
            expected + (level === 2 ? 1 : 0),
            edition.lang,
          );
        }
        for (const [, id] of markdown.matchAll(/^\[\^([^\]]+)\]:/gm))
          assert.ok(
            ids(article).has(`user-content-fn-${id}`),
            `Missing footnote ${id}`,
          );
      }
      if (chapterNumber === 7) {
        assert.equal(
          (article.match(/data-language="book-evaluation"/g) || []).length,
          2,
          edition.lang,
        );
        assert.equal(
          (article.match(/data-language="jsonc"/g) || []).length,
          1,
          edition.lang,
        );
        assert.equal(
          (article.match(/data-language="yaml"/g) || []).length,
          1,
          edition.lang,
        );
        assert.equal(
          (article.match(/data-language="python"/g) || []).length,
          1,
          edition.lang,
        );
        assert.equal(count(article, 'table'), 6, edition.lang);
        for (const level of [2, 4]) {
          const expected = [
            ...markdown.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm')),
          ].length;
          assert.equal(
            count(article, `h${level}`),
            expected + (level === 2 ? 1 : 0),
            edition.lang,
          );
        }
        for (const [, id] of markdown.matchAll(/^\[\^([^\]]+)\]:/gm))
          assert.ok(
            ids(article).has(`user-content-fn-${id}`),
            `Missing footnote ${id}`,
          );
      }
      if (chapterNumber === 8) {
        assert.equal(
          (article.match(/data-language="python"/g) || []).length,
          5,
          edition.lang,
        );
        assert.equal(count(article, 'table'), 6, edition.lang);
        for (const level of [2, 4]) {
          const expected = [
            ...markdown.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm')),
          ].length;
          assert.equal(
            count(article, `h${level}`),
            expected + (level === 2 ? 1 : 0),
            edition.lang,
          );
        }
        for (const [, id] of markdown.matchAll(/^\[\^([^\]]+)\]:/gm))
          assert.ok(
            ids(article).has(`user-content-fn-${id}`),
            `Missing footnote ${id}`,
          );
      }
      if (chapterNumber === 9) {
        assert.equal(code.length, 0, edition.lang);
        assert.equal(images.length, 5, edition.lang);
        assert.equal(count(article, 'table'), 3, edition.lang);
        for (const level of [2, 4]) {
          const expected = [
            ...markdown.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm')),
          ].length;
          assert.equal(
            count(article, `h${level}`),
            expected + (level === 2 ? 1 : 0),
            edition.lang,
          );
        }
        const notes = [...markdown.matchAll(/^\[\^([^\]]+)\]:/gm)];
        assert.equal(notes.length, 26, edition.lang);
        for (const [, id] of notes)
          assert.ok(
            ids(article).has(`user-content-fn-${id}`),
            `Missing footnote ${id} in ${edition.lang}`,
          );
        for (const image of images) {
          const paths = figurePaths(edition.directory, image);
          assert.deepEqual(
            readFileSync(join(dist, paths.original)),
            readFileSync(
              new URL(`../../${edition.directory}/${image}`, import.meta.url),
            ),
          );
          for (const theme of ['light', 'dark']) {
            assert.ok(existsSync(join(dist, paths[theme])));
            assert.ok(html.includes(`data-figure-${theme}="${paths[theme]}"`));
          }
        }
      }
      if (chapterNumber === 10) {
        assert.equal(code.length, 5, edition.lang);
        assert.equal(images.length, 11, edition.lang);
        assert.equal(count(article, 'table'), 4, edition.lang);
        assert.equal(count(article, 'figure'), 11, edition.lang);
        assert.equal(count(article, 'figcaption'), 11, edition.lang);
        for (const level of [2, 4]) {
          const expected = [
            ...markdown.matchAll(new RegExp(`^#{${level}}\\s+`, 'gm')),
          ].length;
          assert.equal(
            count(article, `h${level}`),
            expected + (level === 2 ? 1 : 0),
            edition.lang,
          );
        }
        for (const [, id] of markdown.matchAll(/^\[\^([^\]]+)\]:/gm)) {
          assert.ok(
            ids(article).has(`user-content-fn-${id}`),
            `Missing Chapter 10 footnote ${id} in ${edition.lang}`,
          );
        }
        for (const [language, expected] of [
          ['book-interaction', 1],
          ['python', 3],
          ['javascript', 1],
        ]) {
          assert.equal(
            (
              article.match(new RegExp(`data-language="${language}"`, 'g')) ||
              []
            ).length,
            expected,
            edition.lang,
          );
        }
        for (const image of images) {
          const paths = figurePaths(edition.directory, image);
          assert.deepEqual(
            readFileSync(join(dist, paths.original)),
            readFileSync(
              new URL(`../../${edition.directory}/${image}`, import.meta.url),
            ),
          );
          for (const theme of ['light', 'dark']) {
            assert.ok(existsSync(join(dist, paths[theme])));
            assert.ok(html.includes(`data-figure-${theme}="${paths[theme]}"`));
          }
        }
      }
      if (edition.lang === 'en' && chapterNumber === 3) {
        assert.equal(
          (article.match(/data-language="book-example"/g) || []).length,
          3,
        );
        assert.equal(
          (article.match(/data-language="book-tree"/g) || []).length,
          1,
        );
        assert.equal(
          (article.match(/data-language="python"/g) || []).length,
          5,
        );
        assert.ok(article.includes('Python-style pseudocode'));
      }
      assert.equal(count(article, 'img'), images.length, edition.lang);
      assert.equal(count(article, 'h3'), headings.length, edition.lang);
      assert.ok(!article.includes('katex-error'), edition.lang);
      if (chapterNumber === 3)
        assert.ok(article.includes('class="katex"'), edition.lang);
      assert.equal(
        (article.match(/class="katex-display"/g) || []).length,
        displayMathCount(markdown),
        edition.lang,
      );
      assert.ok(
        html.includes(
          `data-chapter-key="ai-agents-in-depth:${edition.lang}:chapter${chapterNumber}"`,
        ),
      );
      assert.ok(
        html.includes(
          `href="${edition.chapter.replace('chapter1', `chapter${chapterNumber - 1}`)}"`,
        ),
      );
      const pager = html.match(
        /<nav\b[^>]*class="chapter-pager"[^>]*>([\s\S]*?)<\/nav>/,
      )?.[1];
      assert.ok(pager, `Missing chapter navigation in ${edition.lang}`);
      if (chapterNumber === 10) {
        assert.ok(
          pager.includes(`href="${edition.home}#contents"`),
          edition.lang,
        );
        assert.ok(!html.includes('chapter11'), edition.lang);
      } else {
        assert.ok(
          pager.includes(
            `href="${availableChapters.includes(chapterNumber + 1) ? '' : 'https://bojieli.github.io/ai-agent-book'}/${edition.directory}/chapter${chapterNumber + 1}${edition.suffix}/"`,
          ),
        );
      }
    }
  });

test('Chapter 5 architecture banner fits its web canvas in every edition', () => {
  for (const edition of editions) {
    const paths = figurePaths(edition.directory, 'images/fig5-1.svg');
    for (const theme of ['light', 'dark']) {
      const svg = readFileSync(join(dist, paths[theme]), 'utf8');
      const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
      const banner = [
        ...svg.matchAll(
          /<foreignObject x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/foreignObject>/g,
        ),
      ].find((match) => match[5].includes('data-source-label="40"'));
      assert.ok(banner, `${edition.lang} architecture banner`);
      assert.ok(Number(banner[1]) + Number(banner[3]) < Number(width));
      assert.ok(Number(banner[2]) + Number(banner[4]) + 16 < Number(height));
    }
  }
});
