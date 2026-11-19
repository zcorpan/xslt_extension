#!/usr/bin/env python3
"""Writes the source code package for AMO: this repo plus the xslt_polyfill
submodule and its libxml2/libxslt submodules, at the commits they are pinned to
(`git archive` skips submodules). See SYNCING.md.

Usage: python3 scripts/source-zip.py OUTPUT.zip
Needs: git submodule update --init --recursive
"""
import os
import subprocess
import sys
import tarfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDE = ('web-ext-artifacts/',)


def modules():
    out = subprocess.run(['git', 'submodule', 'status', '--recursive'], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    paths = []
    for line in out.splitlines():
        if line.startswith('-'):
            sys.exit(f'Submodule not initialized: {line[1:].split()[1]} '
                     '(run: git submodule update --init --recursive)')
        paths.append(line[1:].split()[1])
    return [''] + paths


def main(output):
    seen = set()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
        for path in modules():
            proc = subprocess.Popen(['git', 'archive', '--format=tar', 'HEAD'],
                                    cwd=os.path.join(ROOT, path), stdout=subprocess.PIPE)
            with tarfile.open(fileobj=proc.stdout, mode='r|') as tar:
                for member in tar:
                    name = os.path.join(path, member.name)
                    if not member.isfile() or name in seen or name.startswith(EXCLUDE):
                        continue
                    seen.add(name)
                    z.writestr(name, tar.extractfile(member).read())
            if proc.wait():
                sys.exit(f'git archive failed in {path or "."}')
    print(f'Wrote {output} ({len(seen)} files)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
