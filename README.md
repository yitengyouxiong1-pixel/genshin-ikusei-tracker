# 原神 育成トラッカー

原神のキャラ育成（天賦・突破・聖遺物）を毎日チェックして、目標まで育ちきる日数を計算する Windows アプリです。
ファンが作った非公式ツールで、HoYoverse とは関係ありません。ゲームのファイルやメモリには触れません。

## ダウンロード

[最新版のページ](../../releases/latest) から `GenshinTracker-Windows-x.y.z.zip` をダウンロードして、展開した中の `GenshinTracker.exe` を開いてください。
一度入れたあとは、アプリが自動で新しいバージョンに切りかわります。

## できること

- きょうのやること（樹脂の使い道・マップ巡回・週ボス・聖遺物）をチェックリストで表示
- 天賦本の曜日に合わせた2週間の予定と、育ちきるまでの日数
- 特産品の復活タイマー（取ってから48時間）
- ゲーム中の小さな表示（Ctrl+Alt+G）。原神の表示モードを「ボーダーレス」にすると、ゲームの上に出せます
- データは PC の SQLite ファイルに保存。書き出し・読み込みで引っ越しできます

## しくみ

- `app/main.js` … 起動役（ランチャー）。ダウンロード済みの新しい本体があればそれを、なければ同梱の本体を起動します。新しい本体が起動できなければ自動で前の版に戻ります。
- `app/core/` … アプリ本体（Electron のメインプロセス、画面、SQLite（sql.js））
- `tools/build.py` … リリース用ファイル（本体の更新ファイル、update.json、配布用 zip）を作ります
- `updates/` … インストール済みのアプリが読む更新ファイル（`update.json` と `core-x.y.z.bundle.gz`）。アプリはここを見て新しい本体を取得し、大きさと SHA-256 を確かめてから使います。
- `.github/workflows/release.yml` … `updates/update.json` の版が上がると、配布用 zip を作って Release に載せます。

## ライセンス

MIT。同梱の [sql.js](https://github.com/sql-js/sql.js)（MIT）と [Electron](https://github.com/electron/electron)（MIT）を使っています。
