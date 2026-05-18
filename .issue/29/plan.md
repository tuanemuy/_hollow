# 実装計画 — Issue #29: search 経路 (searchOwnNotes) への visibility 入力伝達 + projection 実値化

**Issue:** #29
**作成日:** 2026-05-18
**複雑度:** 中〜大規模

---

## 目的

Issue #8 (PR #28) のフォローアップ。`?q=` 非空の **search 経路** で残存している以下2つを解消する:

1. `loaders.ts` の search 経路で `?visibility=...` URL パラメータが `searchOwnNotes` まで届かず、index 側で常時 `["private","unlisted","public"]` で検索される（フィルタ未反映）
2. `OwnedNotesResult.notes[].visibility` が search 経路で `"private"` プレースホルダ固定（`.issue/1/adr.md` ADR-012）

ADR-013 (`NoteList` のバッジ表示を filter 経路のみに抑制) は **解消の前提が整うが、本 Issue では撤廃しない**。理由は ADR-004 (Issue #29 ADR) を参照（要約: `ListView` が `formatDate(note.updatedAt)` を 2 箇所で表示しており、`updatedAt` プレースホルダ (`new Date(0)`) と一緒にバッジを出すと「公開 · 1970年1月1日」というUX破綻が起きる。バッジ表示と `updatedAt` 実値化は同じ別 Issue でまとめて切り替える）。

## スコープ

### 含まれるもの
- `loaders.ts` の search 経路で `visibility` を `searchOwnNotes` に配列化して伝達
- `searchOwnNotes` の入力 DTO に `visibility?: readonly PublicationVisibility[]` を追加し、`SearchQuery.visibilityFilter` に流す
- `SearchHit` (domain) / `SearchHitDTO` (application) に `visibility` フィールドを追加
- D1 adapter (`searchIndex.ts`) で SELECT 句に `sd.visibility` を追加し、`toHit` で `Visibility.create` してブランド化
- `loaders.ts` の search 経路 projection で `visibility: "private" as const` プレースホルダを `hit.visibility` に置換
- 既存テスト（`searchOwnNotes.test.ts` / `searchPublicNotes.test.ts`）の `makeHit` を新フィールドに追従、`searchOwnNotes.test.ts` に新規ケース追加、`searchPublicNotes.test.ts` に visibility 投影確認を 1 ケース追加

### 含まれないもの
- `searchPublicNotes` のロジック修正（visibility は仕様上 `['public']` 固定が正しい。`makeHit` の shape 補修と投影確認のみ）
- `searchOwnNotes` の `updatedAt` / `directoryId` / `slug` プレースホルダの実値化（ADR-012 の他 3 プレースホルダ。本 Issue は `visibility` 単体）
- ADR-014 (`CalendarView` の search 経路フォールバック) の解消（`updatedAt` が実値化されるまで継続）
- ADR-013 (`NoteList.showVisibilityBadge` の `mode === "filter"` ガード) の撤廃（`updatedAt` 実値化と同じフォロー Issue で同時に切り替え）
- `publication_states` テーブルへの JOIN（→ 設計判断参照、Issue 説明文の方針は採用しない）

## 実装ステップ

### 1. Domain — `SearchHit` に `visibility` フィールドを追加

- **対象ファイル:** `app/core/domain/search/valueObject.ts`
- **変更内容:** `SearchHit` 型 (L354-362) に `visibility: Visibility` を追加。同ファイルの既存 `Visibility` ブランドを流用するため import 追加不要。
- **理由:** 検索結果として visibility を運搬する必要がある。

### 2. Application DTO — `SearchHitDTO` に `visibility` を追加

- **対象ファイル:** `app/core/application/dto/search.ts`
- **変更内容:**
  - `SearchHitDTO` に `visibility: "private" | "unlisted" | "public"` を追加
  - `toSearchHitDTO` で `visibility: hit.visibility` を写す（`Visibility` ブランドは構造的に同じ string union なのでキャスト不要）
- **理由:** 既存パターン（`SearchTitle` 等が domain ブランド、DTO は素の string）と一致。
- **コールチェーン確認（変更不要）:**
  - `app/core/application/search/view.ts` の `toSearchHitView` は `toSearchHitDTO` を delegate するだけ → 自動追随
  - `app/core/application/search/index.ts` の `SearchHitDTO` re-export も自動追随
  - usecase 側 (`searchOwnNotes` / `searchPublicNotes`) は `toSearchHitView` 経由で投影しているため変更不要

### 3. Adapter — D1SearchIndex で `visibility` を SELECT して `SearchHit` に詰める

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts`
- **変更内容:**
  - `SearchRow` 型に `visibility: string` を追加（既存パターンを踏襲。literal union ではなく `string` で受けて `toHit` 内の `Visibility.create` で narrow する。`noteId` / `ownerId` も同パターン）
  - SELECT 句 (L162-170) に `sd.visibility AS "visibility"` を追加（`sd.tag_names_json` の隣に配置）
  - `toHit` の既存 try/catch ブロック内 (L262-290) で `visibility: Visibility.create(row.visibility)` を呼ぶ。不正値は既存の `isRehydrationError` 経路で `SystemError(DataIntegrityError)` に変換される
- **理由:** `search_documents.visibility` カラムは既に書き込み済み（`toRow` L221）。schema 上 NOT NULL + CHECK 制約 (`schema.ts:590, 600-608`) があるため driver は必ず enum 文字列を返す。読み取り側だけ未実装。

### 4. Usecase — `searchOwnNotes` に `visibility` 入力受け入れ

- **対象ファイル:** `app/core/application/search/searchOwnNotes.ts`
- **変更内容:**
  - `SearchOwnNotesInput` に `visibility?: readonly PublicationVisibility[]` を追加（`@/core/domain/publication/valueObject` から import）
  - `SearchQuery.create` の `visibilityFilter` を `input.visibility ?? ["private","unlisted","public"]` に置換
- **理由:** Issue #8 ADR-001 の port 規約（`readonly PublicationVisibility[]`）と統一。`undefined` = フィルタなし（全件 = 3 値ハードコード）、配列 = その集合をそのまま `SearchQuery` に渡す。
- **Issue 文言との対応:** Issue 本文は「`searchOwnNotes` usecase / `searchDocumentRepository` に visibility フィルタを受け入れさせる」と書かれているが、port (`SearchIndex.query` / `SearchQuery.visibilityFilter`) と adapter (`D1SearchIndex` の `sd.visibility IN (...)`) は既に対応済み。本 Issue で必要な変更は usecase 側が常時 3 値をハードコードしている箇所のみ。

### 5. Loader — search 経路で `visibility` を伝達 + projection 実値化

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:**
  - 関数スコープ内に `toVisibilityArr(v)` のような小ヘルパを追加（`normalizeSearchDateRange` の隣）し、search / filter 両経路で同じ式を使い回す
  - search 経路で `searchMod.searchOwnNotes` の input に `visibility` を渡す
  - 結果マッピング L128 を `visibility: "private" as const` から `visibility: hit.visibility` に変更
- **理由:** Issue の主目的。両経路で配列化ロジックを共通化することで「片方だけ更新して片方が漏れる」リグレッションを防ぐ。

### 6. テスト追加・更新

- **対象ファイル:**
  - `app/core/application/search/__tests__/searchOwnNotes.test.ts`
  - `app/core/application/search/__tests__/searchPublicNotes.test.ts`
- **変更内容:**
  - 両ファイルの `makeHit` ヘルパに `visibility: Visibility.create(...)` を追加（own は `"private"`、public は `"public"` をデフォルトに）
  - `searchOwnNotes.test.ts` に新規ケース:
    - **「`input.visibility = ["public"]` を渡すと `observed.visibilityFilter === ["public"]` になる」**
    - **「`input.visibility = undefined` のとき従来通り 3 値（既存の `forwards the keyword + ownerId filter` テストをそのまま維持）」**
    - **「結果 hit の `visibility` が DTO に投影される」**
  - `searchPublicNotes.test.ts` に新規ケース:
    - **「結果 hit の `visibility = 'public'` が DTO に投影される」** — 公開検索側の visibility 漏洩リグレッション防止
- **理由:** 入力伝達と projection の両方を契約として固定する。既存テストは破壊しない。

## 設計判断

主要な判断は4つ。詳細は `.issue/29/adr.md` を参照。

- **ADR-001**: `visibility` のソースは `search_documents.visibility`（既存列）— `publication_states` JOIN は採用しない。Issue 説明文の「publication_states join で実値化」は実装方針として誤りで、search index は既に `handlePublicationChangedEvent` 経由で publication 変更を反映している
- **ADR-002**: `searchOwnNotes.visibility` は `readonly PublicationVisibility[]` で受ける（filter 経路と統一、Issue #8 ADR-001 を踏襲）
- **ADR-003**: 本 Issue は `visibility` 単体の解消にスコープを限定。`updatedAt` / `directoryId` / `slug` プレースホルダと ADR-014 (`CalendarView` フォールバック)、ADR-013 (`NoteList.showVisibilityBadge` ガード) は別 Issue で対応
- **ADR-004**: `NoteList.showVisibilityBadge = mode === "filter"` ガード撤廃は本 Issue では行わない。理由は `ListView` が `formatDate(note.updatedAt)` を 2 箇所表示しており、`updatedAt` プレースホルダが残ったままバッジだけ出すと「公開 · 1970年1月1日」のUX破綻が起きるため

## リスクと注意点

- **`SearchHit` フィールド追加の波及**: `makeHit` ヘルパが 2 ファイル（own, public）にあり、typecheck で漏れは検出される。
- **空配列 `[]` の扱い**: 現状 adapter L124 は `q.visibilityFilter.length > 0` のときだけ WHERE を追加するため、`[]` を渡すと「フィルタなし」になる。これは Issue #8 ADR-002 の「空配列 = no match」と意味的に乖離しているが、URL から `[]` は届かないので本 Issue では対応せず Issue #8 ADR-002 の前提を維持。将来 multi-select UI が入った際に再検討（ADR-002 で明記）。
- **結果整合性のラグ**: publication visibility 変更直後の search 結果は IndexJob 消費完了までは旧 visibility を返す。これは search index の本質的性質であり、他の属性（title, tagNames）と同水準。
- **`Visibility.create` 失敗時のフォールバック**: schema CHECK 制約があるので通常起きないが、`isRehydrationError` → `SystemError(DataIntegrityError)` 経路で扱われる。adapter 修正時に既存の try/catch ブロックを壊さないこと。
- **ADR-013 / ADR-014 の継続**: `updatedAt` プレースホルダは残るため `CalendarView` の search 経路フォールバックも継続。`mode === "search"` 分岐と `showVisibilityBadge = mode === "filter"` ガードは両方とも撤廃しない（→ ADR-004）。`mode` 値自体は CalendarView 分岐用に保持される。

## テスト方針

- **Unit**: `searchOwnNotes.test.ts` で入力伝達と projection の契約を固定。`searchPublicNotes.test.ts` は `makeHit` shape 補修 + visibility 投影確認を 1 ケース追加
- **Integration**: D1 SearchIndex の integration test は既存に無いため本 Issue では新規追加しない（既存パターン踏襲）。`pnpm test:integration` は触らないが、参考実行はする
- **Manual**: `?q=foo&visibility=public` で結果が public のみに絞られること、`?q=foo&visibility=private` で非公開のみに絞られることをブラウザで確認。バッジ表示は本 Issue では変えないため「search 経路でバッジが出ていない」状態は ADR-004 に従い期待通り
- **Regression**: `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit` 全グリーン

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | × | ○ | × |
| `search_documents.visibility` 利用 | ○ | ○ | ○ |
| `SearchHit` 増設 | ○ | ○ | ○ |
| `NoteList` ガード撤廃指摘 | ○ | ○ | × |
| 空配列セマンティクスの議論 | ○ | ○ | × |
| ADR 構造化 | ○ | ○ | △ |
| 取り込んだ点 | 空配列セマンティクスのリスク記述 | ベース（ステップ分割・ADR記録・テスト方針） | テスト方針の絞り込み（integration新設は本 Issue では行わない判断） |

## レビュー反映

### 修正した点
- **[P-001 / R2]** ステップ 2 に DTO → view → usecase のコールチェーン明示を追記（`view.ts` は delegate で変更不要、`index.ts` の re-export も自動追随）
- **[P-002 / R2]** ステップ 3 に `SearchRow.visibility: string` で受けて `Visibility.create` で narrow する方針、SELECT 句の正確な配置、CHECK 制約による driver 保証を明記
- **[P-003 / R2]** ステップ 6 (`NoteList.showVisibilityBadge` ガード撤廃) を **撤回**。理由を ADR-004 として記録。`ListView` で `updatedAt` プレースホルダ (1970年) と並ぶ UX 破綻を回避するため、バッジ撤廃は `updatedAt` 実値化と同じ別 Issue でまとめて切り替える
- **[P-001 / R1]** ステップ 6 撤回により JSDoc 改訂の懸念も自動解消（NoteList は無変更）
- **[P-002 / R1]** ステップ 4 に「Issue 文言との対応」セクション追加。port / adapter は既に対応済みで usecase 修正のみが本 Issue スコープであることを明示

### 取り込んだ改善提案
- **[S-001 / R2]** ステップ 5 に `toVisibilityArr(v)` 小ヘルパ抽出を明示
- **[S-001 / R1]** ADR-002 に「`[]` を受けたときの adapter 既存挙動」を明記（adr.md 側で記述）
- **[S-003 / R1]** `searchPublicNotes.test.ts` に visibility 投影確認 1 ケースを追加（漏洩リグレッション防止）
- **[S-004 / R1 & R2]** ADR-003 にフォロー Issue 起票方針を明記（adr.md 側で記述）

### 見送った提案とその理由
- **[S-002 / R2]** DTO projection テストを `dto/search.test.ts` に分離 → 現状 `dto/` 配下に test ファイルがなく、新規ハーネス整備は本 Issue のスコープ外。usecase テストで十分。
- **[S-002 / R1]** `handlePublicationChangedEvent` の同期コスト補足記述 → ADR-001 の判断根拠としては既に十分。冗長化を避ける。
- **[S-004 / R2]** `pnpm test:integration` を Regression に追加 → D1 SearchIndex の integration test は存在しないため形式的になる。手動で 1 度実行し緑であることだけ確認、計画文書には残さない。
