#!/usr/bin/env python3
"""Prepare a fresh, secret-free context for a precompiled Next.js runtime.

Copy .next/static CONTENTS directly to static/chunks and static/media.
Never merge build manifests from two builds. The output directory must not exist.
"""
import argparse
import shutil
from pathlib import Path


def prepare(source, context):
    source, context = Path(source).resolve(), Path(context).resolve()
    if context.exists():
        raise ValueError('Output must be a new directory; do not merge builds')
    standalone = source / '.next/standalone'
    static = source / '.next/static'
    client = source / 'node_modules/.prisma/client'
    required = [
        standalone / 'server.js',
        standalone / '.next/BUILD_ID',
        standalone / '.next/routes-manifest.json',
        standalone / '.next/app-path-routes-manifest.json',
        client / 'libquery_engine-linux-musl-openssl-3.0.x.so.node',
        source / 'package.json',
    ]
    for path in required:
        if not path.is_file():
            raise ValueError(f'Required build artifact missing: {path}')
    if not (static / 'chunks').is_dir():
        raise ValueError('Missing static/chunks in compiled build')
    context.mkdir(parents=True)
    (context / 'standalone').mkdir()
    shutil.copy2(standalone / 'server.js', context / 'standalone/server.js')
    shutil.copytree(standalone / '.next', context / 'standalone/.next')
    # Bundle the exact traced dependencies; never inherit an older Next/React
    # runtime from the pinned base when the lockfile/build version has changed.
    shutil.copytree(standalone / 'node_modules', context / 'standalone/node_modules')
    shutil.copytree(static, context / 'static')
    shutil.copytree(client, context / 'prisma-client/client', ignore=shutil.ignore_patterns('*windows*', '*darwin*'))
    shutil.copytree(source / 'prisma/migrations', context / 'prisma/migrations')
    shutil.copy2(source / 'prisma/schema.prisma', context / 'prisma/schema.prisma')
    shutil.copytree(source / 'public', context / 'public')
    shutil.copy2(source / 'deployment/memory-entrypoint.sh', context / 'docker-entrypoint.sh')
    shutil.copy2(source / 'package.json', context / 'package.json')
    shutil.copy2(source / 'deployment/Dockerfile.precompiled', context / 'Dockerfile')
    assert (context / 'static/chunks').is_dir()
    assert not (context / 'static/static').exists()
    assert (context / 'standalone/.next/app-path-routes-manifest.json').is_file()
    return context


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='.')
    parser.add_argument('--context', required=True)
    args = parser.parse_args()
    output = prepare(args.source, args.context)
    print(f'Runtime context ready: {output}')


if __name__ == '__main__':
    main()
