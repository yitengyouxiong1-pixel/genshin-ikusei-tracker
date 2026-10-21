#!/usr/bin/env python3
"""Build release files for 原神 育成トラッカー.

  python3 tools/build.py "notes shown in the update notice"

Outputs into dist/release-<version>/:
  core-<version>.bundle.gz        the updatable app (gzip of {"path": base64})
  update.json                     what installed apps read to find the update
  GenshinTracker-Windows-<version>.zip   full download for new users
"""
import base64, gzip, hashlib, io, json, os, shutil, sys, zipfile, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'app')
CORE = os.path.join(APP, 'core')
RUNTIME_ZIP = os.environ.get('ELECTRON_WIN_ZIP', '/home/claude/dl/electron-win.zip')
README = os.path.join(ROOT, 'packaging', 'README.txt')
MIN_LAUNCHER = '1.3.0'   # raise only when main.js (launcher) or the Electron runtime changes

version = json.load(open(os.path.join(CORE, 'version.json')))['version']
launcher = json.load(open(os.path.join(APP, 'package.json')))['version']
notes = sys.argv[1] if len(sys.argv) > 1 else ''
out = os.path.join(ROOT, 'dist', 'release-' + version)
shutil.rmtree(out, ignore_errors=True); os.makedirs(out)

# 1) core bundle
files = {}
for root, ds, fs in os.walk(CORE):
    ds[:] = sorted(d for d in ds if not d.startswith('.'))
    for f in sorted(fs):
        if f.startswith('.'): continue
        p = os.path.join(root, f); rel = os.path.relpath(p, CORE).replace(os.sep, '/')
        files[rel] = base64.b64encode(open(p, 'rb').read()).decode()
raw = json.dumps(files, separators=(',', ':'), sort_keys=True).encode()
buf = io.BytesIO()
with gzip.GzipFile(fileobj=buf, mode='wb', mtime=0, compresslevel=9) as g: g.write(raw)
bundle = buf.getvalue(); bname = 'core-%s.bundle.gz' % version
open(os.path.join(out, bname), 'wb').write(bundle)

# 2) update.json
upd = {'version': version, 'bundle': bname, 'sha256': hashlib.sha256(bundle).hexdigest(), 'size': len(bundle),
       'minLauncher': MIN_LAUNCHER, 'notes': notes, 'published': datetime.date.today().isoformat()}
json.dump(upd, open(os.path.join(out, 'update.json'), 'w'), ensure_ascii=False, indent=2)

# 3) full Windows zip: Electron runtime + this app
zname = 'GenshinTracker-Windows-%s.zip' % version
with zipfile.ZipFile(RUNTIME_ZIP) as src, zipfile.ZipFile(os.path.join(out, zname), 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for info in src.infolist():
        if info.is_dir(): continue
        name = info.filename
        if name == 'resources/default_app.asar': continue
        if name == 'electron.exe': name = 'GenshinTracker.exe'
        z.writestr('GenshinTracker/' + name, src.read(info.filename))
    for root, ds, fs in os.walk(APP):
        ds[:] = [d for d in ds if not d.startswith('.')]
        for f in fs:
            if f.startswith('.'): continue
            p = os.path.join(root, f)
            z.write(p, 'GenshinTracker/resources/app/' + os.path.relpath(p, APP).replace(os.sep, '/'))
    txt = open(README, encoding='utf-8').read().replace('{VERSION}', version)
    z.writestr('GenshinTracker/README.txt', ('﻿' + txt).replace('\n', '\r\n').encode('utf-8'))
print(json.dumps(upd, ensure_ascii=False, indent=2))
print('launcher', launcher, '->', out)
for f in sorted(os.listdir(out)): print(' ', f, os.path.getsize(os.path.join(out, f)))
