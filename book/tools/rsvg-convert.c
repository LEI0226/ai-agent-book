/* rsvg-convert 的 Windows 替身：用本机 Chrome/Edge 无头模式把 SVG 转成 PDF。
 *
 * 为什么需要它：pandoc 在 Windows 上只按 .exe 扩展名查找 rsvg-convert（不遵守
 * PATHEXT），而 librsvg 在 Windows 上没有官方预编译包。本程序实现 pandoc 实际
 * 会用到的那部分命令行接口：
 *
 *     rsvg-convert -f pdf -o <out.pdf> <in.svg>
 *
 * 做法：读出 SVG 根元素的 width/height（缺失则回退 viewBox），套一层
 * @page{size:WxH;margin:0} 的 HTML，交给 Chrome 打印成同尺寸 PDF。全程矢量。
 *
 * 编译（无需 Windows SDK）：  zig cc -O2 -o bin/rsvg-convert.exe rsvg-convert.c
 */

#define _CRT_SECURE_NO_WARNINGS
#include <ctype.h>
#include <fcntl.h>
#include <io.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <windows.h>

#define MAX_ARGS 64

static int file_exists_w(const wchar_t *p) {
    DWORD a = GetFileAttributesW(p);
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

/* 依次找 Chrome / Edge，都找不到再扫 PATH */
static int find_browser(wchar_t *out, size_t outsz) {
    static const wchar_t *cands[] = {
        L"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        L"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        L"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        L"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    };
    for (size_t i = 0; i < sizeof cands / sizeof cands[0]; i++) {
        if (file_exists_w(cands[i])) {
            wcsncpy(out, cands[i], outsz - 1);
            out[outsz - 1] = 0;
            return 1;
        }
    }
    static const wchar_t *names[] = {L"chrome.exe", L"msedge.exe"};
    for (size_t n = 0; n < sizeof names / sizeof names[0]; n++) {
        wchar_t buf[32768];
        DWORD len = GetEnvironmentVariableW(L"PATH", buf, 32768);
        if (len == 0 || len >= 32768) continue;
        wchar_t *ctx = NULL;
        for (wchar_t *d = wcstok(buf, L";", &ctx); d; d = wcstok(NULL, L";", &ctx)) {
            wchar_t cand[MAX_PATH * 2];
            _snwprintf(cand, MAX_PATH * 2, L"%ls\\%ls", d, names[n]);
            if (file_exists_w(cand)) {
                wcsncpy(out, cand, outsz - 1);
                out[outsz - 1] = 0;
                return 1;
            }
        }
    }
    return 0;
}

/* 在 <svg ...> 开标签里按名字取属性值，避免匹配到 stroke-width 之类 */
static int get_attr(const char *tag, const char *name, char *val, size_t vsz) {
    size_t nlen = strlen(name);
    const char *p = tag;
    while (*p) {
        while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
        if (!*p) break;
        if (strncmp(p, name, nlen) == 0 && p[nlen] == '=') {
            p += nlen + 1;
            char q = *p;
            if (q != '"' && q != '\'') break;
            p++;
            const char *e = strchr(p, q);
            if (!e) break;
            size_t len = (size_t)(e - p);
            if (len >= vsz) len = vsz - 1;
            memcpy(val, p, len);
            val[len] = 0;
            return 1;
        }
        /* 跳到下一个空格，即下一个属性 */
        while (*p && *p != ' ' && *p != '\t' && *p != '\r' && *p != '\n') p++;
    }
    return 0;
}

/* 从 "900" / "900px" / "900.5" 里取数字 */
static int num_of(const char *s, double *out) {
    char buf[64];
    size_t n = 0;
    while (*s && n < sizeof buf - 1 &&
           (isdigit((unsigned char)*s) || *s == '.' || *s == '+' || *s == '-')) {
        buf[n++] = *s++;
    }
    buf[n] = 0;
    if (n == 0) return 0;
    double v = atof(buf);
    if (v <= 0) return 0;
    *out = v;
    return 1;
}

/* 取 SVG 画布尺寸：优先 width/height，回退 viewBox 的第 3、4 个数 */
static void parse_size(const char *svg, double *w, double *h) {
    *w = 900;
    *h = 450;
    const char *s = strstr(svg, "<svg");
    if (!s) return;
    const char *e = strchr(s, '>');
    if (!e) return;

    size_t taglen = (size_t)(e - s);
    char *tag = (char *)malloc(taglen + 1);
    if (!tag) return;
    memcpy(tag, s, taglen);
    tag[taglen] = 0;

    char v[128];
    double pw = 0, ph = 0;
    int hasw = get_attr(tag, "width", v, sizeof v) && num_of(v, &pw);
    int hash = get_attr(tag, "height", v, sizeof v) && num_of(v, &ph);
    if (hasw && hash) {
        *w = pw;
        *h = ph;
    } else if (get_attr(tag, "viewBox", v, sizeof v)) {
        double nums[4];
        int n = 0;
        char *ctx = NULL;
        for (char *t = strtok_s(v, " ,\t", &ctx); t && n < 4; t = strtok_s(NULL, " ,\t", &ctx)) {
            nums[n++] = atof(t);
        }
        if (n == 4 && nums[2] > 0 && nums[3] > 0) {
            *w = nums[2];
            *h = nums[3];
        }
    }
    free(tag);
}

static int run_browser(const wchar_t *browser, const wchar_t *profile,
                       const wchar_t *pdf, const wchar_t *url) {
    static wchar_t cmd[32768];
    _snwprintf(cmd, 32768,
               L"\"%ls\" --headless --disable-gpu --no-sandbox --no-first-run "
               L"--disable-extensions --no-pdf-header-footer "
               L"--user-data-dir=\"%ls\" --print-to-pdf=\"%ls\" \"%ls\"",
               browser, profile, pdf, url);

    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    memset(&si, 0, sizeof si);
    si.cb = sizeof si;
    memset(&pi, 0, sizeof pi);

    if (!CreateProcessW(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
        fwprintf(stderr, L"rsvg-convert(shim): 启动浏览器失败 (err %lu)\n", GetLastError());
        return 0;
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD code = 1;
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    if (code != 0) {
        fwprintf(stderr, L"rsvg-convert(shim): 浏览器退出码 %lu\n", code);
        return 0;
    }
    return 1;
}

int wmain(int argc, wchar_t **argv) {
    const wchar_t *input = NULL;
    const wchar_t *out = NULL;

    /* 带值的选项，跳过它们的值，免得把值当成输入文件名 */
    static const wchar_t *takes_value[] = {
        L"-f", L"--format", L"-o", L"--output", L"-w", L"--width", L"-h", L"--height",
        L"-d", L"--dpi-x", L"-p", L"--dpi-y", L"-a", L"--background-color",
        L"--page-width", L"--page-height",
    };

    for (int i = 1; i < argc; i++) {
        const wchar_t *a = argv[i];
        if (wcscmp(a, L"-o") == 0 || wcscmp(a, L"--output") == 0) {
            if (i + 1 < argc) out = argv[++i];
            continue;
        }
        int skip = 0;
        for (size_t k = 0; k < sizeof takes_value / sizeof takes_value[0]; k++) {
            if (wcscmp(a, takes_value[k]) == 0) {
                skip = 1;
                break;
            }
        }
        if (skip) {
            i++;
            continue;
        }
        if (a[0] == L'-' && a[1] != 0) continue;
        input = a;
    }

    if (!input) {
        fwprintf(stderr, L"rsvg-convert(shim): 缺少输入文件\n");
        return 1;
    }
    int to_stdout = (out && wcscmp(out, L"-") == 0);

    /* 读 SVG 源（UTF-8） */
    FILE *fp = _wfopen(input, L"rb");
    if (!fp) {
        fwprintf(stderr, L"rsvg-convert(shim): 打不开 %ls\n", input);
        return 1;
    }
    fseek(fp, 0, SEEK_END);
    long sz = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    if (sz <= 0 || sz > 32 * 1024 * 1024) {
        fclose(fp);
        fwprintf(stderr, L"rsvg-convert(shim): %ls 大小异常\n", input);
        return 1;
    }
    char *svg = (char *)malloc((size_t)sz + 1);
    if (!svg) {
        fclose(fp);
        return 1;
    }
    size_t got = fread(svg, 1, (size_t)sz, fp);
    svg[got] = 0;
    fclose(fp);

    double w, h;
    parse_size(svg, &w, &h);

    /* 临时目录：<TEMP>\rsvg-shim-<pid> */
    wchar_t tmp[MAX_PATH], profile[MAX_PATH], htmlpath[MAX_PATH], pdfpath[MAX_PATH];
    if (GetTempPathW(MAX_PATH, tmp) == 0) return 1;
    _snwprintf(profile, MAX_PATH, L"%lsrsvg-shim-%lu", tmp, GetCurrentProcessId());
    CreateDirectoryW(profile, NULL); /* profile 目录 */
    _snwprintf(htmlpath, MAX_PATH, L"%ls\\page.html", profile);

    FILE *hf = _wfopen(htmlpath, L"wb");
    if (!hf) {
        fwprintf(stderr, L"rsvg-convert(shim): 写临时 HTML 失败\n");
        return 1;
    }
    fprintf(hf,
            "<!doctype html><html><head><meta charset=\"utf-8\"><style>"
            "@page{size:%.4gpx %.4gpx;margin:0}"
            "html,body{margin:0;padding:0}"
            "svg{display:block;width:%.4gpx;height:%.4gpx}"
            "</style></head><body>",
            w, h, w, h);
    fwrite(svg, 1, got, hf);
    fputs("</body></html>", hf);
    fclose(hf);
    free(svg);

    /* 输出路径 */
    if (to_stdout) {
        _snwprintf(pdfpath, MAX_PATH, L"%ls\\out.pdf", profile);
    } else if (out && (out[0] == L'\\' || (iswalpha(out[0]) && out[1] == L':'))) {
        wcsncpy(pdfpath, out, MAX_PATH - 1);
        pdfpath[MAX_PATH - 1] = 0;
    } else {
        /* 相对路径要拼上当前目录，否则 Chrome 会写到它自己的工作目录 */
        wchar_t cwd[MAX_PATH];
        DWORD n = GetCurrentDirectoryW(MAX_PATH, cwd);
        if (n == 0 || n >= MAX_PATH) {
            fwprintf(stderr, L"rsvg-convert(shim): 取当前目录失败\n");
            return 1;
        }
        _snwprintf(pdfpath, MAX_PATH, L"%ls\\%ls", cwd, out ? out : L"out.pdf");
    }

    wchar_t browser[MAX_PATH * 2];
    if (!find_browser(browser, MAX_PATH * 2)) {
        fwprintf(stderr, L"rsvg-convert(shim): 找不到 Chrome 或 Edge\n");
        return 1;
    }

    /* Chrome 用 file:/// URL；反斜杠转正斜杠 */
    wchar_t url[MAX_PATH + 32];
    _snwprintf(url, MAX_PATH + 32, L"file:///%ls", htmlpath);
    for (wchar_t *p = url; *p; p++)
        if (*p == L'\\') *p = L'/';

    int ok = run_browser(browser, profile, pdfpath, url) && file_exists_w(pdfpath);
    if (ok && to_stdout) {
        FILE *pf = _wfopen(pdfpath, L"rb");
        if (pf) {
            char buf[65536];
            size_t r;
            _setmode(_fileno(stdout), _O_BINARY);
            while ((r = fread(buf, 1, sizeof buf, pf)) > 0) fwrite(buf, 1, r, stdout);
            fclose(pf);
        } else {
            ok = 0;
        }
    }

    /* 清理临时目录（profile 目录会残留，先删里面的产物再删目录） */
    if (!to_stdout) DeleteFileW(htmlpath);
    {
        wchar_t pat[MAX_PATH];
        _snwprintf(pat, MAX_PATH, L"%ls\\*", profile);
        WIN32_FIND_DATAW fd;
        HANDLE fh = FindFirstFileW(pat, &fd);
        if (fh != INVALID_HANDLE_VALUE) {
            do {
                wchar_t sub[MAX_PATH];
                _snwprintf(sub, MAX_PATH, L"%ls\\%ls", profile, fd.cFileName);
                if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
                    RemoveDirectoryW(sub);
                else
                    DeleteFileW(sub);
            } while (FindNextFileW(fh, &fd));
            FindClose(fh);
        }
        RemoveDirectoryW(profile);
    }

    if (!ok) {
        fwprintf(stderr, L"rsvg-convert(shim): 生成 PDF 失败\n");
        return 1;
    }
    return 0;
}
