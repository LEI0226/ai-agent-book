# Windows 本地编译辅助工具

[`build_pdf.sh`](../build_pdf.sh) 原本是为 macOS + CI 写的，在 Windows 上有两个坑。这个目录放补丁。

## 坑 1：`rsvg-convert` 缺失

[`../images/`](../images/) 里的 132 张配图是 SVG，pandoc 在转 LaTeX 时会自动把 SVG 转成 PDF，这个转换它**只认 `rsvg-convert`**（librsvg 提供）。而 librsvg 在 Windows 上没有官方预编译包，自己编译要拖一整套 GTK 依赖。

`rsvg-convert.c` 是它的替身：用本机 Chrome / Edge 的无头模式渲染，输出同样尺寸的矢量 PDF。

### 为什么必须是 `.exe`

pandoc 在 Windows 上按扩展名查找可执行文件时**不遵守 `PATHEXT`**，`.bat` / `.cmd` 一律找不到（实测 pandoc 3.8）。所以只能用真 `.exe`。

### 编译

不需要 Visual Studio，`zig cc` 自带 libc 和 Windows 导入库：

```bash
zig cc -O2 -municode -o bin/rsvg-convert.exe rsvg-convert.c
```

> 用 MSVC（`rustc` / `cl`）编译需要装 Windows SDK 才有 `kernel32.lib`；本机只装了 VS 2022 的 C++ 工具链、没装 SDK，所以走 zig。

### 使用

把 `bin/` 加进 `PATH` 再跑构建：

```bash
export PATH="$PWD/tools/bin:$PATH"   # 从 book/ 目录
bash build_pdf.sh
```

### ⚠️ 路径不要含中文

Git Bash 把含非 ASCII 字符的路径转成 Windows `PATH` 时会**整个错乱**。例如仓库放在 `F:\学习资料搜集下载\ai-agent-book` 时：

```
F:\学习资料搜集下载\...   →    D:\Program Files\Git\ѧϰ�����Ѽ�����\...
```

结果就是 pandoc 压根看不到 `rsvg-convert.exe`，报 `check that rsvg-convert is in path`。

两个办法：

1. **把 `bin/` 放到纯 ASCII 路径**（推荐）—— 例如 `C:\Users\<你>\bin\`，加进 PATH：
   ```bash
   cp bin/rsvg-convert.exe /c/Users/$USER/bin/
   export PATH="/c/Users/$USER/bin:$PATH"
   ```
2. **给仓库建一个 ASCII 软链**，从那里构建：
   ```cmd
   mklink /J F:\aibook "F:\学习资料搜集下载\ai-agent-book"
   ```
   之后一律在 `F:\aibook` 下操作。

## 坑 2：字体

[`../preamble.tex`](../preamble.tex) 原本写死 macOS 字体（Songti SC / Heiti SC / Menlo）。Windows 上要换掉，一处在等宽字体，一处在正文中文字体。改法是加 `\IfFontExistsTF` 兜底链，macOS / CI 行为不受影响。

### ⚠️ 绝对不要用 Windows 自带的 Noto SC 字体

Windows 11 自带的 `Noto Sans SC` / `Noto Serif SC`（`NotoSansSC-VF.ttf` / `NotoSerifSC-VF.ttf`）是**可变字体（Variable Font）**。XeTeX 能把它们排出来（TeX 侧一行报错都没有），但 **xdvipdfmx 在写 PDF 阶段会直接崩溃**：

```
xdvipdfmx:fatal: Invalid font: -1 (0)
No output PDF file written.
```

现象极具迷惑性：日志没有 `!` 错误，TeX 只是排版到第 1–2 页就停住，构建脚本返回退出码 43。排查了很久才锁定是可变字体。**结论：中文字体必须挑静态的。**

（另注意 `Noto Sans SC` 与 CI 上 brew 装的 `Noto Sans CJK SC` 是两个不同的字体族：前者 Google Fonts 版，后者 Source Han 版。）

### 符号兜底字体

正文里大量使用 ★ ✓ ✗ ₀–₉ ⓐ–ⓔ ♠♣♥♦ ≈ 和希腊字母，靠 `\newunicodechar` 指向一个兜底字体。**没有一个字体能全覆盖**：

| 字体 | ⓐ U+24D0 | ✗ U+2717 | ₀ U+2080 |
| --- | :--: | :--: | :--: |
| Arial Unicode MS（macOS） | ✓ | ✓ | ✓ |
| DejaVu Sans | **✗** | ✓ | ✓ |
| Noto Sans SC | ✓ | **✗** | **✗** |
| SimSun / SimHei / 微软雅黑 | ✗ | ✗ | ✗ |
| **Segoe UI Symbol**（Windows） | ✓ | ✓ | ✓ |

所以 Windows 分支兜底到 **Segoe UI Symbol**（系统自带，且完整覆盖这一组符号）。

### Windows 上的实际落点

| 用途 | macOS / CI | Windows |
| --- | --- | --- |
| 正文中文 | Songti SC | SimSun（宋体） |
| 标题/无衬线中文 | Heiti SC | SimHei（黑体） |
| 等宽 | Menlo | DejaVu Sans Mono |
| 符号兜底 | Arial Unicode MS | Segoe UI Symbol |

SimSun 是经典宋体，跟原设计的 Songti SC 是一路风格，比 Noto 更贴近原貌。

## 坑 3（未踩到，但要知道）

`../gen_cover.py` 会调图像生成模型产出 `images/cover-image.png`，该文件被 `../.gitignore` 排除。**没有它也能构建**——`cover.tex` 是纯 TikZ 矢量封面，不依赖这张图。
