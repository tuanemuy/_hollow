# 実装計画 — Issue #389: ノート一覧ビューのUI改善（罫線の二重表示・タイルサムネイルの是非・情報量の不揃い）

**Issue:** #389
**作成日:** 2026-06-01
**複雑度:** 中〜大規模

---

## 目的

ノート一覧ビュー（`/` ホーム）の見た目を5点改善する。罫線の二重表示解消、タイルのサムネイル枠廃止、ListView の更新日時重複解消、リスト/タイルの情報量統一、visibility 系ユーティリティの共通化。

## スコープ

### 含まれるもの

- FilterBar 下端とリスト先頭の罫線二重表示の解消（divide-y 方式）
- TileView のサムネイル枠（img + グラデーションフォールバック）廃止
- ListView の更新日時二重表示の解消
- リスト/タイルで表示する情報量の統一（タイルにタグ・更新日時を追加）
- `CHIP_BASE` / `visibilityChipClass` / `visibilityLabel` の重複解消（新規 `list/styles.ts` へ集約）
- `formatDate` の共有化（`listSelectors.ts` へ移し両ビューから利用 — ステップ4でタイルに日時を出すため）
- デッドフィールド `thumbnailUrl` の DTO / projection / loaders からの除去

### 含まれないもの

- 空状態（0件）の見た目（`NoteList.tsx` 側担当）
- CalendarView の表示（visibility 系ユーティリティ未使用）
- サムネイル機能そのものの再設計・将来実装

## 実装ステップ

### 1. 共有スタイルモジュール `list/styles.ts` を新規作成

- **対象ファイル:** `app/components/note/list/styles.ts`（新規）
- **変更内容:** `CHIP_BASE` 定数、`Visibility` 型を引数に取る `visibilityChipClass(v)` / `visibilityLabel(v)` をエクスポート。`Visibility` 型は `OwnedNoteFilterItem["visibility"]`（`"private"|"unlisted"|"public"`）を踏襲。`public/styles.ts` の命名・粒度を踏襲し JSDoc は最小限。
- **理由:** Styling 規約「繰り返す utility 文字列は module-scoped 定数へ集約」。`listSelectors.ts` は React 非依存の純粋ロジック置き場なので UI 文字列は持たせない。

### 2. ListView の罫線・更新日時重複・ユーティリティ重複を解消

- **対象ファイル:** `app/components/note/list/ListView.tsx`
- **変更内容:**
  - ローカルの `CHIP_BASE`/`visibilityChipClass`/`visibilityLabel`/`Visibility`（22-37行）を削除し `./styles` から import
  - `<li>` の `border-t border-hairline`（60行）を削除し、`<ul>`（115行）に `divide-y divide-hairline` を付与（先頭行に線が付かない）
  - メタ行（102-103）の `· {updatedAtDisplay}` を削除し、右カラム（106-108）に集約
- **理由:** 受け入れ条件「罫線が二重に見えない」「更新日時重複解消」「visibility 重複解消」

### 3. FilterBar の下端罫線は維持

- **対象ファイル:** `app/components/note/list/FilterBar.tsx:211`
- **変更内容:** `border-b border-hairline mb-3` は維持。ListView を divide-y にして先頭行の線を落とすことで二重表示は解消。FilterBar 下線はフィルター領域とリストの区切りとして全ビュー共通で機能するため残す。
- **理由:** Issue が「どちらか一方に寄せる」と明示。フィルター直下を正・リスト先頭を消す方針。

### 4. TileView のサムネイル枠廃止・情報量統一・ユーティリティ共通化

- **対象ファイル:** `app/components/note/list/TileView.tsx`
- **変更内容:**
  - ローカルの `CHIP_BASE`/`visibilityChipClass`/`visibilityLabel`/`Visibility`（12-27行）を削除し `./styles` から import
  - `TileBody` の `aspect-[16/9]` サムネイル枠（32-45行、img + グラデーション両方）を削除し `note.thumbnailUrl` 参照を撤去
  - 本文下のメタ行を ListView に合わせ、`note.tagNames`（`#tag` 連結、`text-accent`）・visibility チップ・更新日時を表示。日付整形は共有 `formatDate` を使用
  - 既存の `justify-end` の visibility チップ単独行をメタ行に置き換え
- **理由:** 受け入れ条件「サムネイル枠削除・タイトル/抜粋/メタ主体のカード」「リスト/タイルの情報量が揃う」

### 5. `thumbnailUrl` をフロント表示型・DTO・projection から除去

- **対象ファイル:**
  - `app/components/note/loaders.ts` — `OwnedNoteCommon.thumbnailUrl` 削除、検索パス map（200行）・フィルタパス map（285行）の投入行削除、`OwnedNoteCommon` 直前の JSDoc（43-49 行、`thumbnailUrl` を「将来の検索インデックス拡張用に残す」と説明する段落）を削除/汎用説明へ置換
  - `app/core/application/dto/note.ts:52` — `NoteListItemDTO.thumbnailUrl` 削除
  - `app/core/application/note/view.ts` — `toNoteListItem` の `context` 引数・戻り値から `thumbnailUrl` 削除、JSDoc 言及削除
  - `app/core/application/note/listNotesByOwner.ts:89` / `listNotesInDirectory.ts:73` / `publication/listUserPublicNotes.ts:88` — `thumbnailUrl: null` 行削除
- **理由:** デッドフィールド除去。全 producer が `null` 固定で、読むのは TileView 1 箇所のみ。`UserPublicTop` は不参照。詳細は adr.md ADR-001。

### 6. `formatDate` を共有化

- **対象ファイル:** `app/components/note/list/listSelectors.ts`（純粋関数の追加）、`ListView.tsx` / `TileView.tsx`（import 切替）
- **変更内容:** ListView 内の `formatDate`（12-20行）を `listSelectors.ts` へ移し、両ビューから import。
- **理由:** TileView でも日付表示が必要になる。utility 文字列ではなく純粋関数なので `listSelectors.ts`（純粋ロジック置き場）が適切。

### 7. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit` で回帰確認。

## 設計判断

- **thumbnailUrl 除去を推奨** — 全 producer が `null` 固定のデッドフィールド。詳細は adr.md ADR-001。
- **共通化先は新規 `list/styles.ts`** — `listSelectors.ts` は純粋ロジック置き場で UI 文字列は持たない。`public/styles.ts` 等のドメイン配下 styles.ts が確立パターン。
- **`formatDate` は `listSelectors.ts` へ** — 純粋関数なので styles.ts ではなくロジック置き場。
- **情報量はタイルをリストに合わせる** — タグ / 公開チップ / 更新日時を両ビューで揃える。

## リスクと注意点

- `toNoteListItem` の引数変更は呼び出し 3 usecase を同時修正しないと typecheck が落ちる（ステップ5は5ファイルまとめて変更）。
- `dto/note.ts` の `thumbnailUrl` 削除と `loaders.ts:285`（`thumbnailUrl: n.thumbnailUrl` — `NoteListItemDTO` 由来）の削除は不可分。片方だけ変更した中間状態は typecheck が通らないため、ステップ5は一括で変更・コミットする。
- `formatDate` 移設に伴い `listSelectors.ts` 冒頭 JSDoc の責務列挙に「date formatting」を1語追加し、モジュール説明と実態を一致させる。
- `OwnedNoteCommon` から `thumbnailUrl` を抜くと `DisplayedNote` 利用全ビューの型が変わるが、参照は TileView のみで他は無影響。
- TileView メタ行追加でタグ名が長い場合のオーバーフロー。ListView のメタ行スタイル（`flex-wrap` 等）を踏襲。
- divide-y は子要素間のみに線を引くため 0 件時はリスト線が出ない（FilterBar の border-b のみ）。空状態は対象外。

## テスト方針

- 型・lint: `pnpm typecheck && pnpm lint:fix && pnpm format`。thumbnailUrl 除去の波及は typecheck で全検出。
- 既存ユニット: `pnpm test:unit`。`NoteListViews.test.tsx`（ビューをモック）/`listSelectors.test.ts` は無影響。`thumbnailUrl` 参照テストは無い。
- 手動: `pnpm dev` で `/` ホームを開き、(1) 罫線が二重にならない (2) タイルでサムネイル枠が消えタイトル/抜粋/タグ/公開チップ/更新日時が出る (3) リストで更新日時が右カラムのみ (4) リスト/タイルで情報が揃う、を目視。`UserPublicTop`（公開プロフィール）も回帰確認。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク）

両視点とも重大な問題なし（要件カバレッジ: 問題点ゼロ、5受け入れ条件すべてステップに紐づき確認）。アーキ視点の軽微指摘を反映:

**修正した点**:
- [P-001] `loaders.ts` のコメント対象行を 43-48 → 43-49（`OwnedNoteCommon` 直前の JSDoc 段落）に訂正。
- [P-002] `dto/note.ts` の `thumbnailUrl` 削除と `loaders.ts:285` の `n.thumbnailUrl` 削除が不可分である旨をリスク欄に追記（一括コミット）。

**取り込んだ改善提案**:
- [S-001] `formatDate` 共有化を「含まれるもの」に明記。
- [S-003] `listSelectors.ts` JSDoc に「date formatting」を追加する旨をリスク欄に追記。

**見送った提案とその理由**:
- [S-001/arch] `common/styles.ts` の `chip` と `CHIP_BASE` のベース重複を `common` 側で統合する案 → スコープ外。list ドメイン固有の visibility チップは `list/styles.ts` に閉じる。
- [S-002/両者] 「揃える」のフィールド定義明示・レイアウト差（List=右カラム / Tile=メタ行末尾）の注記 → 計画 59 行で既にフィールドを列挙済みで実質カバー。グリッド有無による必然的なレイアウト差は許容。

