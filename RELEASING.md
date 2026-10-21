# リリース手順

1. `app/core/version.json` のバージョンを上げる（例 1.3.0 → 1.3.1）
2. 起動役（`app/main.js`）や Electron 本体を変えたときだけ、`app/package.json` の version と `tools/build.py` の `MIN_LAUNCHER` も上げる
   （このときは自動更新できず、ダウンロードし直しが必要になります）
3. `python3 tools/build.py "更新内容のひとこと"` を実行する。`updates/` の中身が新しい版に置きかわります
4. 変更をすべてコミットして main に push する
   - インストール済みのアプリは `updates/update.json` を見て、起動の15秒後と6時間ごとに更新を取りに来ます
   - GitHub Actions（release.yml）が配布用 zip を作り、`vx.y.z` の Release として公開します
