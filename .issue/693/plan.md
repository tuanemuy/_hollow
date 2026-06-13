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
| AC-1 | ノート詳細でGFMテーブルを表示すると、テーブル外枠・セル境界の罫線が表示される | Issue本文 | 1 |
| AC-2 | ヘッダ行（`th`）が本文セル（`td`）と視覚的に区別される（背景・文字色） | Issue本文「th: 見出し用の背景」 | 1 |
| AC-3 | `.note-detail-content` を共有する全表示面（詳細・公開・リビジョン・法務・エディタ）で同じ罫線が出る | Issue「影響範囲」 | 1 |
| AC-4 | 枠線色・余白・ヘッダ背景がデザイントークン（`--color-hairline` / `--color-surface-elevated` 等）を使い、既存 admin テーブルと統一されている（外枠の角丸は ADR-001 によりラッパー不在のため不採用） | Issue「修正方針」・CLAUDE.md トークンSSOT | 1 |
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
- デザイン参考: `spec/design/pages/P47-admin-metrics.html`（406-441行）の `.table` がプロジェクトのテーブルデザイン言語。`border-collapse: collapse` / `--color-hairline` 罫線 / `--color-surface-elevated` ヘッダ背景 / `--space-3 --space-4` セル padding を踏襲する
- 依存関係: `.note-detail-content` を className に持つ全コンポーネント（NoteDetail / PublicNoteDetail / NoteRevisionDetail / LegalDocument / HtmlEditor / InlineEditor）に自動で波及する

## 設計

### ドメインモデルへの影響
なし（純粋にスタイルの追加）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。markdown-it・サニタイザは既にテーブルを出力・許可しており変更不要。

### UI / プレゼンテーション
`app/styles/index.css` の `.note-detail-content` ブロック末尾（`img` 規則の後）に table 系規則を追加する。`@layer components` 内、utility-first 例外（ADR-002）の範囲。新規 UI 画面・レイアウト変更はなく、既存コンテンツ領域へのスタイル追加のため Phase 1.5（デザインモック作成）は不要。デザイン言語は P47 admin テーブルから抽出する。

## 実装ステップ

### 1. `.note-detail-content` に table スタイルを追加

- **対象ファイル:** `app/styles/index.css`
- **変更内容:** `@layer components` の `.note-detail-content` ブロック内、`img` 規則の後に以下を追加（値はトークン参照）:
  - `.note-detail-content table`: `width:100%`、`border-collapse:collapse`、`border:1px solid var(--color-hairline)`、`border-radius:var(--radius-lg)`、`overflow:hidden`（角丸を効かせる）、`font-size:var(--text-sm)`、上下マージンは既存の `> * + *` の `margin-top:1.1em` に委ねる
  - `.note-detail-content th, .note-detail-content td`: `padding:var(--space-2) var(--space-3)`、`border:1px solid var(--color-hairline)`、`text-align:left`、`vertical-align:top`
  - `.note-detail-content thead th`: `background:var(--color-surface-elevated)`、`color:var(--color-ink-secondary)`、`font-weight:var(--weight-medium)`
  - 必要に応じて `.note-detail-content table` に `display:block; overflow-x:auto`（広いテーブルの横スクロール）。`border-radius` + `overflow:hidden` と両立しない場合はラッパー無しの制約として横スクロールを優先するか検討（実装時に判断、adr.md に記録）
- **理由:** AC-1〜AC-4 を満たす。table 罫線・ヘッダ区別・トークン統一を一括で付与する

## リスクと注意点

- `border-collapse: collapse` と `border-radius` は併用してもセル境界の角丸は効かない（CSSの既知挙動）。外枠の角丸を優先するなら `overflow:hidden` を併用。横スクロール対応（`overflow-x:auto`）と角丸 `overflow:hidden` は競合しうるため、実装時にどちらを優先するか判断し adr.md に残す
- `.note-detail-content` は read-only 表示面とインラインエディタ host（`InlineEditor` / `HtmlEditor`）で共有される。エディタ内でもテーブルに罫線が付くが、これは表示の一貫性として許容（編集機能の追加ではない）
- トークン SSOT 遵守: 生の色・px を直書きせず `var(--*)` を使う（CLAUDE.md スタイル規約）

## テスト方針

- 既存のスタイル系テスト（CodeHighlight 等）が壊れないこと: `pnpm test:unit`
- `pnpm typecheck && pnpm lint:fix && pnpm format`
- ブラウザ実機で GFM テーブルを含むノートを表示し、罫線・ヘッダ背景・既存要素への無影響を目視確認（testing.md 参照）
