#!/usr/bin/env python3
"""Offline fixture tests for the precompiled context, not a Next build."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('memory_runtime', Path(__file__).with_name('prepare-next-runtime.py'))
assert spec is not None and spec.loader is not None
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeContextTests(unittest.TestCase):
    def test_exact_traced_dependencies_are_copied_without_static_nesting(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as temporary:
            source = Path(temporary) / 'source'
            paths = {
                '.next/standalone/server.js': '// fixture server',
                '.next/standalone/.next/BUILD_ID': 'fixture-id',
                '.next/standalone/.next/routes-manifest.json': '{}',
                '.next/standalone/.next/app-path-routes-manifest.json': '{}',
                '.next/standalone/node_modules/next/package.json': '{"version":"fixture-build-runtime"}',
                '.next/standalone/node_modules/fixture-traced-only/index.js': '// fixture dependency',
                '.next/static/chunks/fixture.js': '// fixture chunk',
                'node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node': 'fixture engine; not executable',
                'prisma/migrations/fixture/migration.sql': '-- fixture migration',
                'prisma/schema.prisma': '// fixture schema',
                'package.json': '{"name":"fixture-only"}',
                'public/study-sw.js': '// fixture SW',
                'deployment/memory-entrypoint.sh': '#!/bin/sh\nexit 0',
                'deployment/Dockerfile.precompiled': '# fixture Dockerfile',
            }
            for relative, content in paths.items():
                path = source / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding='utf-8')
            context = Path(temporary) / 'output'
            runtime.prepare(source, context)
            self.assertEqual((context / 'standalone/node_modules/next/package.json').read_text(), paths['.next/standalone/node_modules/next/package.json'])
            self.assertTrue((context / 'standalone/node_modules/fixture-traced-only/index.js').is_file())
            self.assertTrue((context / 'static/chunks/fixture.js').is_file())
            self.assertFalse((context / 'static/static').exists())
            self.assertTrue((context / 'prisma/migrations/fixture/migration.sql').is_file())
            with self.assertRaisesRegex(ValueError, 'new directory'):
                runtime.prepare(source, context)


if __name__ == '__main__':
    unittest.main()
