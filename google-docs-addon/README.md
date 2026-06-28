# Umbrella Parade Writer Google Docs Add-on

Googleドキュメントを原稿エディタとして使い、Umbrella Parade Writerは出版準備用のサイドバーとして動かすためのApps Script版です。

## 方針

- 原稿本文はGoogleドキュメントで横書きのまま書く
- サイドバーでKindle/しまうま向けプレビューを見る
- 縦書きはDocs本文ではなくプレビュー側で確認する
- ルビは本文に `｜漢字《かんじ》` の記法で入れ、プレビュー側でruby表示する
- A+は4枠分の画像、代替テキスト、キャプション、見出し、説明を管理する

## 入れ方

1. Googleドキュメントを開く
2. メニューの「拡張機能」から「Apps Script」を開く
3. `Code.gs` にこのフォルダの `Code.gs` を貼り付ける
4. `Sidebar.html` というHTMLファイルを作って、このフォルダの `Sidebar.html` を貼り付ける
5. プロジェクト設定の `appsscript.json` を表示して、このフォルダの `appsscript.json` に置き換える
6. 保存して、Googleドキュメントを再読み込みする
7. メニューに「Umbrella Parade」が出たら「サイドバーを開く」を選ぶ

## 最初にできること

- Docs本文の読み込み
- 見出しから目次を作成
- Kindle/しまうまの横書き/縦書きプレビュー
- 文字数、見出し数、リンク数の確認
- 選択文字へのルビ記法挿入
- カーソル位置へのリンク挿入
- A+ 4枠の入力とプレビューPNGダウンロード

## まだMVPの範囲

- EPUB/DOCX/PDF書き出しは未接続
- QRコード生成は未接続
- しまうまの正確な判型・余白設定は未調整
- Google Workspace Marketplace公開用の審査情報は未整備

まずは自分のGoogleドキュメントに紐づけて試し、使い勝手が固まってから公開用に整える想定です。
