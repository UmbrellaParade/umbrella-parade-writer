# Umbrella Parade Writer

小説原稿をKindle電子書籍としまうまマルシェ向けに整えるための制作ツールです。

## 方針

現在は2つの方向を置いています。

- `src/`: Web版の実験UI
- `google-docs-addon/`: Googleドキュメントを原稿エディタとして使うApps Script版

原稿を書く体験はGoogleドキュメントが安定しているため、今後の本命はGoogleドキュメント拡張版です。Web版はプレビューや書き出し処理の実験場として残します。

## Googleドキュメント拡張版

`google-docs-addon/` にApps Script用のファイルがあります。

できること:

- Docs本文の読み込み
- Kindle/しまうま向けプレビュー
- 横書き/縦書きプレビュー
- 見出しから目次を作成
- 文字数、見出し数、リンク数の確認
- ルビ記法 `｜漢字《かんじ》` の挿入
- Kindle用リンク挿入
- A+ 4枠の入力とプレビューPNG作成

詳しい入れ方は [google-docs-addon/README.md](google-docs-addon/README.md) を参照してください。

## Web版の開発

```bash
npm install
npm run dev
```

Windows PowerShellで `npm.ps1` が止まる場合:

```bash
npm.cmd install
npm.cmd run dev
```

本番ビルド:

```bash
npm.cmd run build
```

## 注意

AI APIキーはブラウザのlocalStorageに保存する実験仕様です。実運用でAI連携を行う場合は、キーを守るためのローカルバックエンドまたは安全なプロキシを追加する予定です。
