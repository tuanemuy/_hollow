# 実装計画 — Issue #497: ノート一覧 FilterBar の体裁を整える

**Issue:** #497
**作成日:** 2026-06-05
**複雑度:** 小規模

---

## 目的

ノート一覧のフィルター（`FilterBar`）に残る体裁の崩れ・無意味な表示を解消し、全 facet のトリガー語彙・サイズ・見出し方針を揃えて一貫した見た目にする。

## スコープ

### 含まれるもの

- 折り返し時に行頭に浮く縦区切り線（`filterSeparator`）の廃止（問題1）
- 「ノートを選ぶ…」トリガーを他フィルターチップと高さ・見た目で統一（問題2）
- 「内部リンク参照」未選択時トリガーをゴーストチップ言語に揃える（問題3）
- facet 見出し（`filterLabel`）の全廃で見出し有無を統一（問題4）

### 含まれないもの

- `NotePickerDialog` 本体・その挙動の変更／削除（in-bar 導線は残す方針のため）
- ノート詳細の被リンクパネル（`NoteMetaPanel`）からの導線（既存のまま）
- フィルターのロジック・URL スキーマ・ローダーの変更

## ユーザー確定方針

- 問題3: 「内部リンク参照」は **バーに残す**。未選択時トリガーを `filterChipGhost`（破線ゴーストチップ）に揃え、期間・公開状態と横並びにする。`NotePickerDialog` は残す。
- 問題4: facet 見出しは **全廃**。タグ・ディレクトリ・内部リンク参照の `filterLabel` 見出しを削除し、チップ群だけにする（期間・公開状態は元々見出しなし）。

## 実装ステップ

### 1. 縦区切り線の廃止（問題1）

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`, `app/components/note/list/styles.ts`
- **変更内容:**
  - `FilterBar.tsx:345-347` のタグ群と期間の間の `<span className={filterSeparator} />` ブロックを削除。
  - コンテナ（`FilterBar.tsx:306` の `flex flex-wrap ... gap-3`）の gap だけで facet 間を区切る。
  - `styles.ts` の `filterSeparator` export を削除（他に利用箇所なし）、`FilterBar.tsx` の import からも除去。
- **理由:** `flex flex-wrap` で折り返すと区切り線が行頭に浮き、隣接区切りの役割を果たさない。gap での区切りに一本化する。

### 2. 「内部リンク参照」トリガーをゴーストチップ化（問題2・3）

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** `FilterBar.tsx:411-419` の未選択時トリガーを `pillBtn`（h-9）から `filterChipGhost`（h-7）に変更し、期間・公開状態のゴーストトリガーと同じ構造にする。
  - className を `filterChipGhost` に。
  - ラベルテキストを facet 名「内部リンク参照」にし、`filterChipCaret`（▾）を付与（期間・公開状態のトリガーと視覚統一）。
  - `aria-haspopup="dialog"` / `aria-expanded={pickerOpen}` / `onClick={() => setPickerOpen(true)}` は維持。
  - `pillBtn` の import が他で不要になれば import から除去（`すべてクリア` ボタンが `pillBtn` を使うため import は残る）。
- **理由:** 未設定トリガーを破線ゴーストチップに揃えることで、期間・公開状態と高さ・見た目が一致し（#2）、見出し全廃後はバー全体が「未設定フィルタの並び」として一貫する（#3）。`NotePickerDialog` を開く挙動はそのまま。

### 3. facet 見出しの全廃（問題4）

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** facet 見出しとして使われている `<span className={filterLabel}>…</span>` を削除する。
  - タグ: `FilterBar.tsx:311` の `<span className={filterLabel}>タグ</span>` を削除。ラッパ `<div className="inline-flex items-center gap-2 flex-wrap">` はチップ群（`<div className="inline-flex gap-1.5 flex-wrap">`）だけを内包する形に簡素化。
  - ディレクトリ: `FilterBar.tsx:373` の `<span className={filterLabel}>ディレクトリ</span>` を削除。アクティブチップだけを残す。
  - 内部リンク参照: `FilterBar.tsx:391` の `<span className={filterLabel}>内部リンク参照</span>` を削除。
  - `filterLabel` の export は **残す**（`DatePopover` の「プリセット」「範囲指定」見出しで使用中。これらは popover 内のラベルであり facet 見出しではないため対象外）。
- **理由:** 期間・公開状態はトリガーチップ自体がラベルを兼ね見出しがない。それに合わせて他 facet の見出しも廃し、バー全体の見出し有無を「なし」で統一する（Issue 本文の「素直」案）。

## 設計判断

詳細は `adr.md` 参照。要点:

- 問題3 はユーザー確定方針で「in-bar トリガーを残しつつゴーストチップ化」を採用。Issue 本文の方針案（未選択時はバーに出さない）とは異なる解決だが、受け入れ条件の趣旨（不揃い・無意味な表示の解消）はゴーストチップ統一で満たす。

## リスクと注意点

- `filterSeparator` 削除後に他参照が残らないこと（grep で FilterBar 専用と確認済み）。
- `filterLabel` は DatePopover で使うため export を消さないこと。
- `FilterBar.test.tsx` はタグの楽観的選択のみ検証し `NotePickerDialog` をモック化しているため、本変更で破綻しない見込み。トリガーの className/テキストに依存したテストはない。
- アクティブ時のチップ（参照中: … / ディレクトリ）は見出し削除後も単独で意味が通ること。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` が通る。
- `pnpm test:unit`（FilterBar / NotePickerDialog 関連）が通る。
- ブラウザで FilterBar の体裁を確認（区切り線の折り返し挙動・トリガーの高さ統一・見出し全廃・内部リンク参照の選択／解除）。
