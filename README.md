# Umbrella Parade Writer

小説原稿を、Kindle電子書籍としまうまマルシェ向け紙面の両方を意識して書くための原稿ツールです。

## 最初のMVP

- 横書き / 縦書きプレビュー
- 標準 / Kindle / しまうま紙面プレビュー
- 見出し1ベースのKindle向け目次
- 目次クリックでプレビュー内の章へジャンプ
- 見出し1ごとの自動改ページ
- ルビ記法 `｜文字《ふりがな》`
- 通常の青色・下線リンク
- 挿絵や外部QR画像の取り込み
- DOCX / EPUB / PDF 書き出し
- タイトル入りQRコードカード作成、外部QR画像差し替え
- QRコード枠: 記録室 / 装飾 / クラシック / ミニマル
- ChatGPT / Claude / Gemini のAPIキーとモデル設定画面
- Custom GPT / Gem 連携の将来用入口

## 開発

```bash
npm install
npm run dev
```

Windows PowerShellで `npm.ps1` が止まる場合は、次のように実行します。

```bash
npm.cmd install
npm.cmd run dev
```

## AIモデル既定値

2026-06-28時点で公式モデル一覧を確認し、初期値は次にしています。

- OpenAI: `gpt-5.5`
- Anthropic: `claude-fable-5-20260601`
- Gemini: `gemini-3.5-flash`

参照:

- [OpenAI model docs](https://developers.openai.com/api/docs/models)
- [Anthropic model docs](https://docs.anthropic.com/en/docs/about-claude/models/overview)
- [Gemini model docs](https://ai.google.dev/gemini-api/docs/models)

## 注意

APIキーは現時点ではブラウザのlocalStorageに保存します。GitHubには `.env` と `.env.*` が入らない設定です。実際にAI相談機能を呼び出す段階では、キーを守るためのローカルバックエンドか安全なプロキシを追加します。
