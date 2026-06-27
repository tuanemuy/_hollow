# Issue #791 動作確認計画

## 確認環境

ローカル開発サーバー（Cloudflare runtime ターゲット）。

```bash
pnpm dev
```

ブラウザでノート詳細／公開ノート詳細を開く。本文に空白を含まない長い文字列を含むノートを用意する。

### シードデータ

本文（Markdown）に以下を含むノートを 1 件用意する:

```text
長い URL: https://example.com/very/long/path/segment/that/has/no/spaces?query=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

長い英字列: supercalifragilisticexpialidociousAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA

コードブロック（折り返さず横スクロールのまま）:

​```
const veryLongIdentifier = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
​```
```

## テストケース

1. **本文の長い URL／英字列が折り返される**
   - ノート詳細をモバイル幅（375px 程度）で表示
   - 期待: 長い URL・英字列がコンテンツ幅内で折り返され、`.note-detail-content` の横スクロール（横はみ出し）が発生しない

2. **コードブロックは従来どおり横スクロール**
   - 同ノートのコードブロックを確認
   - 期待: `pre` は折り返さず、コードブロック内で横スクロールできる（本文全体は横スクロールしない）

3. **共有面で同様に効く**
   - 公開ノート詳細（`PublicNoteDetail`）でも同じ本文で確認
   - 期待: 同様に折り返しが効く

## 自動チェック

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```
