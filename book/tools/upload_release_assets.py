#!/usr/bin/env python3
"""Upload book build artifacts to a GitHub release.

Asset names must be ASCII. GitHub's upload endpoint takes the name as a
percent-encoded query parameter and silently discards the non-ASCII parts of
it, so a CJK filename like ``深入理解-…-v2.0.pdf`` lands as ``-…-v2.0.pdf``
(or ``default.pdf`` if nothing ASCII is left). Pass an explicit ASCII name for
any file whose own name is not ASCII.

The token is read from the GITHUB_TOKEN environment variable and never printed.

Usage:
    GITHUB_TOKEN=<token> python upload_release_assets.py <owner/repo> <release-id> <file>...

Each <file> is either a path (the asset keeps the file's own name) or
``path=Asset-Name.ext`` to name the asset explicitly.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.github.com"
UPLOADS = "https://uploads.github.com"


def request(method: str, url: str, token: str, data: bytes | None = None,
            content_type: str | None = None) -> tuple[int, dict | list | None]:
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read()
            return response.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            return error.code, json.loads(body)
        except json.JSONDecodeError:
            return error.code, {"raw": body.decode("utf-8", "replace")[:400]}


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("Error: GITHUB_TOKEN is not set.", file=sys.stderr)
        return 1

    repo, release_id, *files = sys.argv[1], sys.argv[2], *sys.argv[3:]

    # Drop existing assets so a re-run replaces rather than duplicates them.
    status, release = request("GET", f"{API}/repos/{repo}/releases/{release_id}", token)
    if status != 200 or not isinstance(release, dict):
        print(f"Error: cannot read release {release_id}: HTTP {status} {release}", file=sys.stderr)
        return 1
    for asset in release.get("assets", []):
        status, _ = request("DELETE", f"{API}/repos/{repo}/releases/assets/{asset['id']}", token)
        print(f"  removed old asset: {asset['name']} (HTTP {status})")

    failed = 0
    for spec in files:
        path_str, _, asset_name = spec.partition("=")
        path = Path(path_str)
        if not path.is_file():
            print(f"  MISSING {path}", file=sys.stderr)
            failed += 1
            continue
        name = asset_name or path.name
        # GitHub drops non-ASCII from the name parameter, so refuse rather than
        # publish a mangled name.
        if not name.isascii():
            print(
                f"  FAILED {path.name}: asset name {name!r} is not ASCII. "
                f"Pass an explicit name as '{path_str}=Asset-Name.ext'.",
                file=sys.stderr,
            )
            failed += 1
            continue
        url = f"{UPLOADS}/repos/{repo}/releases/{release_id}/assets?name={urllib.parse.quote(name)}"
        data = path.read_bytes()
        status, result = request("POST", url, token, data, "application/octet-stream")
        if status == 201 and isinstance(result, dict):
            print(f"  uploaded {result['name']}  ({result['size'] / 1048576:.2f} MB)")
            print(f"    {result['browser_download_url']}")
        else:
            detail = result.get("message") if isinstance(result, dict) else result
            print(f"  FAILED {path.name}: HTTP {status} {detail}", file=sys.stderr)
            failed += 1

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
