#!/usr/bin/env python3
"""Exercise a built Linux memory image only against a disposable database.

Requires a Linux CI runner with Docker, npm dependencies and Playwright Chromium.
Does not read production credentials, publish, or deploy. Fixture auth uses a
random per-run secret held in child process environments, never a project file.
"""
import argparse
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
from urllib.request import urlopen


def run(command, env=None):
    subprocess.run(command, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    with tempfile.TemporaryDirectory(prefix='memory-image-test-', dir=os.environ.get('RUNNER_TEMP') or os.environ.get('TMPDIR')) as directory:
        data = Path(directory) / 'data'
        config = Path(directory) / 'config'
        data.mkdir(mode=0o777)
        config.mkdir(mode=0o777)
        # Container uid 1001 and the host test runner both need this temporary
        # fixture. No permissions on the owner's deployment are changed.
        data.chmod(0o777)
        config.chmod(0o777)
        database = data / 'test.db'
        env = dict(os.environ,
                   NEXTAUTH_SECRET=secrets.token_hex(32),
                   NEXTAUTH_URL='http://127.0.0.1:3100',
                   MEMORY_E2E_BASE_URL='http://127.0.0.1:3100',
                   MEMORY_E2E_DATABASE_URL=f'file:{database}')
        container = 'memory-fixture-' + secrets.token_hex(6)
        try:
            run(['docker', 'run', '-d', '--name', container, '--network', 'host',
                 '--memory', '768m', '--memory-swap', '1g', '--pids-limit', '256',
                 '--security-opt', 'no-new-privileges:true',
                 '--env', 'NEXTAUTH_SECRET', '--env', 'NEXTAUTH_URL',
                 '--env', 'DATABASE_URL=file:/app/data/test.db',
                 '--env', 'HOSTNAME=127.0.0.1', '--env', 'PORT=3100',
                 '--volume', f'{data}:/app/data', '--volume', f'{config}:/app/config', args.image], env)
            for _ in range(90):
                try:
                    with urlopen('http://127.0.0.1:3100/login', timeout=2) as response:
                        if response.status == 200:
                            break
                except (OSError, TimeoutError):
                    time.sleep(1)
            else:
                raise RuntimeError('Test image did not become healthy in 90 seconds')
            if not database.is_file():
                raise RuntimeError('Image did not migrate the mounted fixture database')
            database.chmod(0o666)
            run(['docker', 'exec', container, 'node', '-e',
                 "for(const p of ['next','react','react-dom','@prisma/client'])console.log(p,require(p+'/package.json').version)"])
            run(['python3', 'scripts/verify-next-assets.py', '--base-url', 'http://127.0.0.1:3100'])
            run(['node', 'node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.memory.config.ts'], env)
        except Exception:
            subprocess.run(['docker', 'logs', '--tail', '120', container], check=False)
            raise
        finally:
            subprocess.run(['docker', 'rm', '-f', container], check=False)
            # Root-owned/container files are confined to this fixture directory.
            subprocess.run(['sudo', 'chown', '-R', f'{os.getuid()}:{os.getgid()}', directory], check=False)


if __name__ == '__main__':
    main()
