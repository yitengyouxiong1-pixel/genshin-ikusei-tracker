# リリース手順

1. `app/core/version.json` のバージョンを上げる（例 1.3.0 → 1.3.1）
2. 起動役（`app/main.js`）や Electron 本体を変えたときだけ、`app/package.json` の version と `tools/build.py` の `MIN_LAUNCHER` も上げる
   （このときは自動更新できず、ダウンロードし直しが必要になります）
3. `python3 tools/build.py "更新内容のひとこと"` で `dist/release-x.y.z/` を作る
4. GitHub で `vx.y.z` のタグの Release を作り、次の3つを添付して公開する
   - `update.json`
   - `core-x.y.z.bundle.gz`
   - `GenshinTracker-Windows-x.y.z.zip`
5. 公開した Release が「Latest」になっていることを確認する。インストール済みのアプリは起動の15秒後と6時間ごとに確認します。
