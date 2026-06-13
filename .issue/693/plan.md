# 実装計画 — Issue #693: ノート詳細でMarkdownテーブルの枠線が表示されない

**Issue:** #693
**作成日:** 2026-06-13
**複雑度:** 小規模

---

## 目的

`.note-detail-content` に table 系のスタイルが無いため、Markdown のテーブルが枠線ナシで表示される問題を、デザイントークンに沿った table スタイルを追加して解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ノート詳細でGFMテーブルを表示すると、行を区切る罫線（`th`/`td` の下罫線）が表示される | Issue本文 | 1 |
| AC-2 | ヘッダ行（`th`）が本文セル（`td`）と視覚的に区別される（太字＋濃いめの下罫線） | Issue本文「th: 見出し」・採用デザイン draft-4 | 1 |
| AC-3 | `.note-detail-content` を共有する全表示面（詳細・公開・リビジョン・法務・エディタ）で同じ罫線が出る | Issue「影響範囲」 | 1 |
| AC-4 | 罫線色・余白・文字色がデザイントークン（`--color-hairline` / `--color-hairline-strong` / `--color-ink` / `--weight-semibold` 等）を使い、採用デザイン Apple Calm（draft-4）の本文テーブルと一致する（全周ボーダー・ヘッダ背景・外枠角丸は ADR-001 により不採用） | CLAUDE.md トークンSSOT・ADR-001 | 1 |
| AC-5 | 既存の見出し・コードブロック・リスト等のスタイルに影響が無い | Issue「確認」 | 1 |

## スコープ

### 含まれないもの
- WYSIWYGエディタ（TipTap）でのテーブル**編集**機能の追加 — 本Issueは「表示時の枠線」のみ。エディタはテーブルを `unsupportedTags` として扱う既存挙動を変えない
- 横スクロールのための DOM ラッパー追加 — `dangerouslySetInnerHTML` 直下に出力される `<table>` には wrapper を差し込めないため、`table` 自身への `display:block; overflow-x:auto` 等での対応に留める（必要な範囲で）

## 調査結果

- 関連ファイル:
  - `app/styles/index.css`（189-404行 `@layer components` の `.note-detail-content` ブロック）— table 系スタイルが欠落。**本Issueの唯一の変更対象**
  - `app/core/adapters/markdown/markdownConverter.ts` — markdown-it を default preset で初期化（`html:false`）。GFM テーブルを HTML 化する。変更不要
  - `app/core/adapters/sanitizer/htmlSanitizer.ts:97-102,153-154` — `table/thead/tbody/tr/th/td` とその属性（`scope`/`colspan`/`rowspan`）を許可済み。変更不要
- あるべきアーキテクチャ: 「utility-first only」。ただし `dangerouslySetInnerHTML` 本文は ADR-002 で `.note-detail-content` への素の CSS が認められた例外。table もこの例外ブロック内に追記するのが正
- 既存実装の状態: `.note-detail-content` 配下に既に p/h/code/pre/blockquote/ul/ol/li/img のスタイルがある。table だけ抜けている。同ブロックに追記して整合させる
- デザイン参考: ノート本文のビジュアル SSOT は採用デザイン Apple Calm（`spec/design/drafts/draft-4-apple-calm-detail.html:294-309` の `.content table`）。横罫線（`border-bottom`）のみ・全周ボーダーなし・ヘッダ背景なし、ヘッダは太字（`font-weight:600`）＋濃いめの下罫線（`--hairline-strong`）。`spec/design/index.md:4,75` の「GitHub Markdown 互換」は機能の互換であって GitHub の全周グリッドを複製する意味ではない（配色は Apple 側に寄せる）。admin テーブル P47 は別サーフェスのため踏襲しない
- 依存関係: `.note-detail-content` を className に持つ全コンポーネント（NoteDetail / PublicNoteDetail / NoteRevisionDetail / LegalDocument / HtmlEditor / InlineEditor）に自動で波及する

## 設計

### ドメインモデルへの影響
なし（純粋にスタイルの追加）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。markdown-it・サニタイザは既にテーブルを出力・許可しており変更不要。

### UI / プレゼンテーション
`app/styles/index.css` の `.note-detail-content` ブロック末尾（`img` 規則の後）に table 系規則を追加する。`@layer components` 内、utility-first 例外（ADR-002）の範囲。新規 UI 画面・レイアウト変更はなく、既存コンテンツ領域へのスタイル追加のため Phase 1.5（デザインモック作成）は不要。デザイン言語は採用デザイン Apple Calm（draft-4）の `.content table` から抽出する。

## 実装ステップ

### 1. `.note-detail-content` に table スタイルを追加

- **対象ファイル:** `app/styles/index.css`
- **変更内容:** `@layer components` の `.note-detail-content` ブロック内、`img` 規則の後に以下を追加（採用デザイン draft-4 `.content table` 準拠、値はトークン参照）:
  - `.note-detail-content table`: `width:100%`、`border-collapse:collapse`、`font-size:var(--text-sm)`、上下マージンは既存の `> * + *` の `margin-top:1.1em` に委ねる
  - `.note-detail-content th, .note-detail-content td`: `padding:var(--space-2) var(--space-3)`、`border-bottom:1px solid var(--color-hairline)`（横罫線のみ・全周ボーダーなし）、`text-align:left`、`vertical-align:top`
  - `.note-detail-content thead th`: `font-weight:var(--weight-semibold)`、`color:var(--color-ink)`、`border-bottom:1px solid var(--color-hairline-strong)`（ヘッダ背景なし・太字＋濃い下罫線で区別）
- **理由:** AC-1〜AC-4 を満たす。Apple Calm 本文の横罫線ミニマルスタイルで罫線表示・ヘッダ区別・トークン統一を付与する

## リスクと注意点

- 全周ボーダー・外枠角丸・横スクロールラッパーは採用しない（ADR-001）。採用デザイン draft-4 が横罫線のみであり、`dangerouslySetInnerHTML` 本文にはラッパーを差し込む手段がないため
- `.note-detail-content` は read-only 表示面とインラインエディタ host（`InlineEditor` / `HtmlEditor`）で共有される。エディタ内でもテーブルに罫線が付くが、これは表示の一貫性として許容（編集機能の追加ではない）
- トークン SSOT 遵守: 生の色・px を直書きせず `var(--*)` を使う（CLAUDE.md スタイル規約）

## テスト方針

- 既存のスタイル系テスト（CodeHighlight 等）が壊れないこと: `pnpm test:unit`
- `pnpm typecheck && pnpm lint:fix && pnpm format`
- ブラウザ実機で GFM テーブルを含むノートを表示し、罫線・ヘッダ背景・既存要素への無影響を目視確認（testing.md 参照）
