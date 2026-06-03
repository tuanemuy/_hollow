# 実装計画 — Issue #178: design(notes): tighten NoteRepository filter-sharing contract at the type level

**Issue:** #178
**作成日:** 2026-06-04
**複雑度:** 中〜大規模（型のみの変更だが 3 案の設計評価 + ADR を伴う）

---

## 目的

`NoteRepository` の filter 共有 3 兄弟 (`findByOwner` / `countByOwner` / `listWithCount`) が扱うフィルタフィールド集合を、名前付き中間型 `NoteOwnerFilters` として抽出し（提案 B 採用）、`NoteOwnerListOpts` と `NoteOwnerCountOpts` の両方をこの単一の SSOT から導出する。これにより `Pick` の冗長なキー列挙を廃し、将来のフィルタ追加で count 側に漏れが出ない「型レベルの完全強制」を実現する。実行時挙動はゼロ変更の型のみリファクタ。

## スコープ

### 含まれるもの
- `NoteOwnerFilters` 中間型の新設と、`NoteOwnerListOpts` / `NoteOwnerCountOpts` の導出への置換
- フィルタ意味論 JSDoc の `NoteOwnerFilters` への集約と、3 兄弟メソッド JSDoc の `{@link NoteOwnerFilters}` 参照化
- `Pick` キー列挙（6 個）の廃止
- 型のみの変更（実行時挙動ゼロ変更）の検証

### 含まれないもの
- 他リポジトリ（tag / media / ingestion / export / savedView）への横展開（別 Issue）
- adapter の `buildOwnerListWhere` などフィルタ解決ロジックの変更
- branded type 等のランタイム制約の導入

## 設計判断（3 案評価）

| 案 | 概要 | 判定 |
|----|------|------|
| (A) 型関係の反転 `NoteOwnerListOpts = NoteOwnerCountOpts & PaginationOpts` | count 型を契約本体に昇格 | **却下** — 「count 用」型を契約本体に流用するのは命名・責務の逆転。既存 `NoteListOpts` との二重定義リスク |
| (B) 名前付き中間型 `NoteOwnerFilters` を抽出 | 両型がこれを intersect/エイリアス | **採用** — フィルタ契約に名前と単一定義を与え、`Pick` 列挙を構造的に排除。命名と責務が一致 |
| (C) Branded type で制約 | filter contract タグを型で強制 | **却下** — 分散した opts 構築点に儀式を強いるオーバーエンジニアリング |

**決定: (B)**。CLAUDE.md の「illegal states unrepresentable／ボイラープレートより型関係で表現」に最も忠実。詳細は `adr.md` ADR-001 を参照。

## 実装ステップ

### 1. 中間型 `NoteOwnerFilters` を新設

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** 現在 `NoteOwnerListOpts` のインライン `Readonly<{ status?; tagIds?; dateRange?; visibility?; referencingNoteId?; directoryIds?; }>` ブロックを、独立した export 型 `NoteOwnerFilters` として切り出す。現在 `NoteOwnerListOpts` 本体に付いている filter 意味論の JSDoc（`visibility` の 3 状態、`referencingNoteId`、`directoryIds` のサブツリー意味論）を `NoteOwnerFilters` の JSDoc に**移設**する。
- **理由:** フィルタ契約の SSOT を 1 つの型として可視化する。意味論ドキュメントもここに集約するのが筋。

### 2. `NoteOwnerListOpts` を導出に置換

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `NoteOwnerListOpts = NoteListOpts & NoteOwnerFilters`。本体に残す JSDoc は「owner-scope listing = listing opts + owner filters の合成」という構成説明に簡素化し、フィルタ意味論は `{@link NoteOwnerFilters}` 参照に委ねる。
- **理由:** listing opts と filter の合成であることを型関係で明示する。

### 3. `NoteOwnerCountOpts` の `Pick` を廃し `NoteOwnerFilters` 由来に置換

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `NoteOwnerCountOpts = NoteOwnerFilters`（型エイリアス）に変更し、6 個の `Pick` キー列挙を完全削除。JSDoc を「count 用 opts はフィルタフィールドのみ。`NoteOwnerFilters` そのもの」に更新。「`Pick` で drift しない」旧説明を「`NoteOwnerFilters` を直接共有するので構造的に drift 不能」に書き換える。
- **理由:** `Pick` のキー列挙（drift 源）を構造的に排除。`directoryIds` 追加時に手動同期が必要だった実害を恒久解消。エイリアスとして残すのは消費側 import 名（「count opts」意味ラベル）を保ち、変更を port 層に局所化するため。

### 4. 3 兄弟メソッドの JSDoc を `NoteOwnerFilters` 参照に統一

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `findByOwner` / `countByOwner` / `listWithCount` の JSDoc で「filter semantics mirror …」「status / tagIds / dateRange / visibility / referencingNoteId」のような手書きフィールド列挙を `{@link NoteOwnerFilters}` 参照に置換。`directoryIds` が列挙から漏れている JSDoc 箇所もこの参照化で恒久解消。`listWithCount` JSDoc は手書き列挙が **2 箇所**ある（意味論記述 `count === countByOwner(...)` 周辺と、Contract 節の `status / tagIds / dateRange / visibility / referencingNoteId` 列挙 — どちらも `directoryIds` 欠落）ので両方を確実に拾う。
- **理由:** フィルタ契約の語彙を 1 箇所に集約し、列挙漏れを構造的に防ぐ。

### 5. テストコメントの `Pick` 言及を追従更新

- **対象ファイル:** `app/core/application/note/__tests__/listNotesByOwner.integration.test.ts`
- **変更内容:** L693 付近の「the `NoteOwnerCountOpts` Pick that carries `directoryIds`...」コメントを、`Pick` 廃止後の実態（`NoteOwnerFilters` 由来）に追従させる。`noteRepository.integration.test.ts:1696` のコメントは `Pick` 語に依存せず（「pagination fields are simply absent」）更新不要。
- **理由:** `Pick` を完全廃止するため、文言が実態とズレるのを防ぐ。コンパイルには無関係だがレビュー指摘の往復を避ける。

### 6. 検証

- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。消費 6 ファイルは構造保存により無変更で通る。`pnpm test:unit` / `pnpm test:integration` で回帰ゼロを確認。
- **理由:** 型のみの変更なので typecheck が構造保存（プロパティ集合・optional 性・read-only 性の一致）を保証する。

## リスクと注意点

- **構造保存が成立条件:** 変更後の `NoteOwnerListOpts` / `NoteOwnerCountOpts` のプロパティ集合・optional 性・read-only 性が現状と完全一致することが、消費 6 ファイル無変更の前提。`exactOptionalPropertyTypes: true` が有効なため、中間型でも `?:` optional 修飾を保持する必要がある（intersection が optional 性を保存することを前提に設計）。
- **JSDoc 移設での意味論欠落に注意:** `visibility` の 3 状態（undefined / 非空配列 IN / 空配列 match-nothing）、`directoryIds` のサブツリー・空配列短絡など情報量の多い契約を、削るのではなく移すだけにする。
- **`view/valueObject.ts:252` のコメント言及:** `NoteOwnerListOpts.visibility` への JSDoc 言及は文字列であり、型名を変えない本案では無影響。
- **スコープ厳守:** 横展開・adapter ロジック変更は禁止（型のみ）。

## 影響範囲（型の消費箇所・調査済み）

- port: `app/core/domain/note/ports/noteRepository.ts`（変更の中心）
- adapter: `app/core/adapters/d1/repositories/noteRepository.ts`（構造依存・無変更）。private `buildOwnerListWhere(opts: NoteOwnerCountOpts)` に `findByOwner` / `listWithCount` が `NoteOwnerListOpts` をそのまま渡す = 「`NoteOwnerListOpts` が `NoteOwnerCountOpts` に代入可能（フィルタ部分集合）」依存。提案 B では `NoteOwnerListOpts = NoteListOpts & NoteOwnerFilters` ⊇ `NoteOwnerCountOpts = NoteOwnerFilters` なので代入可能性は維持される
- usecase: `app/core/application/note/listNotesByOwner.ts`（`NoteOwnerListOpts` 組み立て・無変更）
- domain service: `app/core/domain/export/service.ts`（`NoteOwnerListOpts` 組み立て・無変更）
- test fake: `app/core/domain/directory/__tests__/service.test.ts`（両型 import・無変更）
- test comment: `app/core/application/note/__tests__/listNotesByOwner.integration.test.ts`（L693 の `Pick` 言及をステップ 5 で文言追従）

## テスト方針

- **型のみのリファクタ（実行時挙動ゼロ変更）。** 検証の主軸は `pnpm typecheck`（tsgo）で構造保存を確認すること。既存の `noteRepository.integration.test.ts` / `listNotesByOwner.integration.test.ts` / `directory/service.test.ts` がそのまま通れば 3 兄弟の filter 契約は保たれている。
- **型契約テストの追加は不要。** 本案の眼目は「`NoteOwnerCountOpts` が `NoteOwnerFilters` と構造一致」をコンパイラに恒久強制すること自体であり、`Pick` を廃して直接導出にした時点でコンパイラがそれを保証する（drift がコンパイルエラーになる）。`errorCodeNaming.test.ts` 流のランタイム pin は「型で表現できない制約」を埋めるものであり、本件は型で完全表現できるので冗長。
- **ブラウザ検証:** 不要（UI・挙動の変更なし）。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点**: なし（要修正の指摘なし）

**取り込んだ改善提案**:
- [要件 S-001] テストコメントの `Pick` 言及を追従更新する方針をステップ 5 として明記（`listNotesByOwner.integration.test.ts:693`）
- [アーキ S-001] 影響範囲に adapter 内の「ListOpts→CountOpts 代入依存」（`buildOwnerListWhere`）を追記
- [アーキ S-002] ステップ 4 に `listWithCount` JSDoc の手書き列挙が 2 箇所ある旨を明記し取りこぼし防止

**特記**: アーキ視点レビュアーが提案 B を実ファイルに適用して `pnpm typecheck`（tsgo）を実走し、ゼロエラー通過 → 原状復帰を確認。構造保存（optional/read-only 性の保存、消費 6 ファイル無変更、`countByOwner(opts?)` 整合）は実証済み。
