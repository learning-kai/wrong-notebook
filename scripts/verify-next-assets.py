#!/usr/bin/env python3
"""Verify that a Next.js page's referenced JS/CSS/fonts are served.

Usage: python3 scripts/verify-next-assets.py --base-url http://127.0.0.1:3100
No credentials are read or persisted. Fails on missing/mismatched resource types.
"""
import argparse
from html.parser import HTMLParser
from urllib.request import build_opener, ProxyHandler, Request
from urllib.error import HTTPError, URLError


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ('src', 'href') and value and value.startswith('/_next/static/'):
                self.paths.add(value)


def verify(base_url, pages):
    opener = build_opener(ProxyHandler({}))
    failures, checked = [], set()
    for page in pages:
        with opener.open(base_url.rstrip('/') + page, timeout=20) as response:
            content = response.read().decode('utf-8')
        refs = References()
        refs.feed(content)
        if not refs.paths:
            failures.append((page, 'no static asset references'))
        for path in sorted(refs.paths - checked):
            checked.add(path)
            try:
                with opener.open(Request(base_url.rstrip('/') + path), timeout=20) as asset:
                    status, kind = asset.status, asset.headers.get('Content-Type', '')
                    if status != 200 or 'text/html' in kind:
                        failures.append((path, f'{status} {kind}'))
            except (HTTPError, URLError) as exc:
                failures.append((path, str(exc)))
    return checked, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--page', action='append')
    args = parser.parse_args()
    checked, failures = verify(args.base_url, args.page or ['/login', '/register'])
    print(f'Checked {len(checked)} distinct page assets; missing/invalid={len(failures)}')
    for path, problem in failures:
        print(path, problem)
    raise SystemExit(1 if failures else 0)


if __name__ == '__main__':
    main()
