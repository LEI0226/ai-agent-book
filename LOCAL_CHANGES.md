# 本地改动说明

> 本文件记录**本 fork 相对上游 `bojieli/ai-agent-book` 的本地改动**，不属于上游内容。
> 对应标记：分支 `zh-only`，标签 `local-zh-only-v1`。
> 生成日期：2026-09-24 · 基线提交 `22fd9c5`

---

## 一句话概括

**移除全部非中文语言支持，并让三条构建链（PDF / EPUB / MkDocs 站点 / Astro 阅读器）在本机 Windows 上真正跑通。** 共删除 2,342 个文件、修改 62 个、新增 2 个目录。

---

## 一、移除多语言支持

### 1.1 删除的正文译本（14 个目录，约 2,133 个文件）

`book-ar` `book-en` `book-es` `book-he` `book-hu` `book-id` `book-ja` `book-ko`
`book-ptbr` `book-ru` `book-ta` `book-tr` `book-vi` `book-zhtw`

含繁體中文（台灣）在内，只保留中文原版 `book/`。

### 1.2 删除的文档层多语言文件

| 位置 | 内容 |
| --- | --- |
| 仓库根 | `README.{en,es,he,ja,ko,ptbr,ta,tr,vi,zhtw}.md`（10）、`index.{he,ko,ptbr}.md`（3） |
| 各章 | `chapter*/README.<lang>.md`（12 语言 × 10 章 = 120） |
| `docs/` | 12 个语言目录（ar/en/es/hu/id/ja/ko/ru/ta/tr/vi/zh-TW）、7 个 `LEARNING.<lang>.md` 旧路径指针、`STATIC_SITE_I18N.md` |

保留：`docs/zh-CN/`、`docs/LEARNING.md`、`docs/EXPERIMENT_STATUS.md`、`docs/EXPERIMENT_CONVENTIONS.md`。

### 1.3 删除的 i18n 基础设施

| 文件 | 原作用 |
| --- | --- |
| `scripts/site_i18n.py` | 合并多语言词典、生成浏览器端翻译目录 |
| `scripts/check_i18n_consistency.py` | 检查各语言版本是否齐全（CI） |
| `scripts/split_search_index.py` | 把 55 MB 搜索索引按版本拆片 |
| `extras/search-index-router.js` | 客户端把搜索请求路由到本语言分片 |
| `extras/lang-switcher.js` / `.css` | 顶部语言下拉 |
| `extras/auto-translate.js` / `.css` | 21 种语言的机器翻译 |
| `extras/site-nav-i18n.json` | 导航树翻译表 |
| `overrides/main.html` | 唯一用途是在 bundle.js 前插入搜索索引路由脚本 |
| `.github/workflows/i18n-check.yml` | 多语言一致性 CI |
| `tests/test_site_i18n.py`、`tests/test_i18n_figure_placement.py`、`tests/js/auto-translate.test.js`、`scripts/machine-language.test.mjs`、`tests/test_split_search_index.py` | 对应测试 |
| `tests/test_ch3_english_figures.py` | 整份测的就是英文版配图 |

`split_search_index.py` + `search-index-router.js` 是「14 个版本 → 搜索索引过大」的专属优化，单语言后纯属冗余，一并移除，回到 Material 默认的单索引行为。

---

## 二、为让构建在本机 Windows 上跑通

### 2.1 字体（`book/preamble.tex`）

原有样式按 macOS 字体编写，Windows 上全部缺失。改为 `\IfFontExistsTF` 兜底链，**macOS / CI 行为完全不变**：

| 用途 | macOS / CI | Windows（新增分支） |
| --- | --- | --- |
| 正文中文 | Songti SC | SimSun（宋体） |
| 无衬线中文 | Heiti SC | SimHei（黑体） |
| 等宽 | Menlo | DejaVu Sans Mono |
| 符号兜底 ★✓✗ⓐ₀ | Arial Unicode MS | **Segoe UI Symbol** |

**踩过的坑（重要）**：

- Windows 11 自带的 `Noto Sans SC` / `Noto Serif SC` 是**可变字体**，xdvipdfmx 处理不了，会在写 PDF 阶段直接 `xdvipdfmx:fatal: Invalid font: -1 (0)` 而 **TeX 侧一行报错都没有**。最初就是按这个方向选的字体，排查很久。**中文字体必须选静态的。**
- 符号兜底没有一个字体能全覆盖：DejaVu Sans 缺 `ⓐ`(U+24D0)，Noto Sans SC 缺 `✗`(U+2717) 和 `₀`(U+2080)。Segoe UI Symbol 是唯一同时覆盖这一组的系统字体。

### 2.2 SVG → PDF 转换（`book/tools/`）

pandoc 转 LaTeX 时需要 `rsvg-convert` 把 132 张 SVG 转 PDF，而 librsvg 在 Windows 上没有官方预编译包（github.com 与 conda 源在本机均不可达）。

`book/tools/rsvg-convert.c` 是它的替身：用本机 Chrome/Edge 无头模式渲染，输出同尺寸矢量 PDF。用 `zig cc` 编译，**不需要 Visual Studio SDK**。

另外两个坑：

- pandoc 在 Windows 上**只按 `.exe` 扩展名查找**可执行文件，`.bat`/`.cmd` 一律找不到（不遵守 `PATHEXT`）。
- Git Bash 把含中文的路径转成 Windows `PATH` 时会整个错乱（`F:\学习资料搜集下载\…` → `D:\Program Files\Git\ѧϰ…`），pandoc 因此看不见转换器。解法是把 exe 放到纯 ASCII 路径。

### 2.3 修复的既有 bug（CI 只跑 macOS，所以从未暴露）

1. **`flatten_epub_toc.py`** — `os.replace` 在 `with zipfile.ZipFile(path)` **内部**执行。Windows 不允许替换仍被打开的文件，报 `WinError 5`；Unix 允许。已改为先读完所有条目再替换。
2. **`build_epub.sh`** — `pdftoppm -jpeg` 在 TeX Live 自带的 poppler 上**静默不产出任何文件**（该构建未编 libjpeg）。改用 `-png`。
3. **`build_epub.sh` / `scripts/build_site.sh`** — 写死 `python3`，而 Windows 上官方安装器与 conda **都只提供 `python.exe`**。改为 `python3` → `python` 依次探测，并跳过 Microsoft Store 的空壳。

---

## 三、web-astro 改造为中文单语言站

### 3.1 数据层

- `src/lib/editions.json` — 15 条收敛为 1 条（`zh-CN`）。保留该结构是因为路由与首页 hook 仍读它。
- `src/lib/locales/` — 删除 14 个词典，只留 `zh-CN.json`。
- 删除 `src/lib/machine-translation.json`、`src/lib/machine-language.ts`、`src/scripts/machine-translation.ts`。
- 删除 `src/pages/[locale]/index.astro`（不再有其他语言首页）。
- 删除 `public/figures/chapter2-en/`（9 张英文专用替代图）及 `prepare-assets.mjs` 中对应分支。

### 3.2 代码层

- `Header.astro` — 移除语言切换下拉与机器翻译菜单
- `Reader.astro` — 移除跨语言小节锚点映射（服务端 `<script id="section-language-links">` + 客户端重写跳转链接的逻辑）
- `Layout.astro` — 移除机器翻译初始化
- `i18n.ts`、`Home.astro`、`book-markdown.mjs` — 移除 `'en'` 分支，默认 `Locale` 收敛为 `zh-CN`
- `reading-position.ts`、`highlights.ts` — 移除 `machineLanguage()` 守卫
- `scripts/prepare-assets.mjs` — 移除恒假的 RTL / 英文替代分支

### 3.3 测试与文档

- 25 个测试文件改写：删除测已删功能的、把取图从各译本改指中文版、按中文配图重定期望值
- `README.md`（22 KB）— 14 处多语言表述全部更新

---

## 四、其他

- **`chapter10/book-translation`** — 默认输入源原指向已删的 `book-en/chapter1.md`、`chapter2.md`，已改为自带的 `sample_book/`（该目录本就是为此准备的英文小样例书）。
- **`book/.gitignore`** — 排除 `tools/bin/`。
- **新增 `reading-progress/`** — 个人阅读进度记录（进度看板 + 项目结构全景），不属于上游内容。

---

## 五、构建验证结果

| 产物 | 结果 |
| --- | --- |
| **PDF** | `book/深入理解-AI-Agent-李博杰-v2.0.pdf` — 310 页 A4，0 缺字，132 张配图保持矢量 |
| **EPUB** | 退出码 0，3.47 MB，136 项，完整性 OK |
| **MkDocs 站点** | 退出码 0，42.85 秒，13 张章节卡片，无多语言残留 |
| **Astro 阅读器** | `astro check` 0 errors；构建 12 页；**测试 158/158**；部署校验通过（12 页 / 1803 个本地 URL） |
| **仓库级 pytest** | 703 passed |

> 剩余 8 个 pytest 失败与 **1 个 `test_homepage_index.py` 编码问题**均为既有的 Windows 环境问题（`texlua` 执行失败 ×5、路径穿越判定差异 ×2、GBK 编码读取 `mkdocs.yml` ×1），与本次改动无关，在 macOS / CI 上不会出现。

---

## 六、已知未处理项

1. **换行符**：仓库 blob 存 LF，但本机 `core.autocrlf=true` 使检出为 CRLF，导致比对源文件与产物的测试失败。已在 web-astro 测试中用 `readSource()` 归一化绕开。**根本修法是添加 `.gitattributes`（`* text=auto eol=lf`）**，但会让 6,482 个文件的检出换行符变化，未擅自执行。
2. **`cursor-chats/`** — 作者与 Cursor 的历史对话导出（269 个文件），未处理。
3. **上游同步** — 删除译本后与上游 `bojieli/ai-agent-book` 彻底分叉。

---

## 七、如何回到原版

```bash
git checkout main          # 回到基线提交 22fd9c5，全部改动消失
git checkout zh-only       # 回到本版本
git diff main zh-only --stat   # 查看本版本相对原版改了什么
```

所有删除与修改均受 git 跟踪，未提交的中间状态也可用 `git checkout -- .` 还原。
