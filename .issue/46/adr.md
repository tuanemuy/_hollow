# ADR — Issue #46: noteRepository.findReferrers 結果上限制御

## ADR-001: optional pagination（案A）採用

### Status
Proposed

### Context
Issue #33 / PR #44 のフォローアップ。`findReferrers` は chunk 化で bind 上限は解消したが、target を参照する全 note を全件 hydrate して JS sort するため、人気ノート（1万件被リンク）で 1 万行を 1 リクエスト内で full hydrate し `loadChildren([1万ids])` を同時発火させる。Issue は 3 案を提示:
- (A) `limit`/`offset` 追加でページネーション化
- (B) 無条件 top-N 保証
- (C) port 上で結果上限を明示

呼出側 3 箇所:
- `getNoteDetail`（詳細ページ inline backlinks、UI 本丸）
- `getBacklinks`（UI 未使用、export view 共有のみ）
- `export/service.ts`（`new Set(referrers.map(n=>n.id))` で**全 referrer id 集合**が必要）

### Decision
**案A を採用**。`findReferrers(targetNoteId, opts?: NoteListOpts)` とし、`opts` 省略時は全件（後方互換）、指定時のみ bounded slice。

- **案B 却下**: export が全 referrer id を必要とするため無条件 top-N にすると壊れる。
- **案C 却下**: 上限固定は export の全件要求と両立しない。optional opts なら呼出側が「全件 or bounded」を選べる。

既存 `NoteListOpts`（limit/offset/sort/order）を再利用し、新しい型を増やさない。

### Consequences
- 良い点:
  - export / `getBacklinks` は呼び出し無変更で全件取得を維持（後方互換が型レベルで保証される — opts は optional）。
  - 詳細ページのみ bounded slice を選択でき、メモリ・CPU 圧を解消。
  - `findByOwner` の `NoteOwnerListOpts` 系と整合する port 表面。
- トレードオフ:
  - port メソッドが「opts の有無で全件/bounded が切り替わる」2 モードを持つ。JSDoc で明示が必須。

---

## ADR-002: adapter は `findByOwner` の 2-pass chunk パターンを流用

### Status
Proposed

### Context
論点2: limit/offset を hydrateMany の**前**に適用し、重い `loadChildren` を top-N 件だけに当てたい。さらに正しい global top-N 順序のため「全候補の軽量列だけ取得 → sort → top-N id 確定 → その N 件だけ full fetch + hydrate」という最適化が望ましい。

調査の結果、この最適化は**既に `findByOwner` の 2-pass chunk path（Issue #171, adapter L439-489）で確立済み**:
1. Pass1: `selectInChunks` で `{id, updatedAt, createdAt, title}` の軽量列を全候補から取得 → `sortNoteRowsBy` で global sort → `offset/limit` で slice。
2. Pass2: 確定した最大 limit 件の id だけ full `NoteRow` を fetch → id reindex → `hydrateMany`。

chunk 境界跨ぎのソート整合性は ISO-8601 + UUIDv7 の文字列比較で `desc(updatedAt), desc(id)` を再現（T-bind-006 と同じ要件）。

### Decision
`findReferrers` の opts 指定パスを `findByOwner` と同型の 2-pass chunk に実装する。opts 省略パスは現行の 1-pass 全件（full fetch → sort → hydrateMany）を維持（全件 hydrate が前提なので 2-pass にする意味がない）。

referrer 候補 id 取得は `resolveReferrerCandidates` を流用しインラインクエリの重複を解消する（任意・推奨）。

### Consequences
- 良い点:
  - 重い `contentHtml`/`frontMatterJson` materialise と `loadChildren` が top-N 件だけに当たる（論点2の本質的解決）。
  - 既存の確立済みパターンを再利用し、chunk 境界ソート整合性が `findByOwner` と同じ保証を得る（テスト負債を増やさない）。
- トレードオフ:
  - opts 指定パスは Pass1/Pass2 で 2 ラウンド（各 chunk 並列）。referrer が多いほど Pass1 の軽量 select chunk 数は増えるが、full hydrate を回避する効果が支配的。
  - Pass1/Pass2 間の削除 race は `findByOwner` と同じ既存許容 race。

---

## ADR-003: 総数は `countByOwner({ referencingNoteId })` 流用、preview N=5

### Status
Proposed

### Context
論点3: preview を top-N に絞ると `backlinks.length` が頭打ちになり詳細ページの「（N 件）」表示が不正確になる。正確な総数の取得元を決める必要がある。選択肢:
- (a) 新規 `countReferrers(targetNoteId)` port メソッド追加
- (b) 既存 `countByOwner(ownerId, { referencingNoteId })` 流用
- (c) その他

`countByOwner` は既に `referencingNoteId` フィルタを `resolveReferrerCandidates` 経由でサポートし、`listWithCount`/`findByOwner` と同一 `buildOwnerListWhere` で resolve される。内部リンクは owner 内でしか解決しない（owner-scoped）ため、target owner = referrer owner であり `countByOwner(targetOwnerId, { referencingNoteId })` は referrer 総数と一致する。

### Decision
**(b) `countByOwner(found.entity.ownerId, { referencingNoteId: found.entity.id })` を流用**。新規 port メソッドは追加しない。`getNoteDetail` の出力 DTO に `backlinkCount: number` を追加。

preview 件数 **N = 5**（usecase の `BACKLINK_PREVIEW_LIMIT` 定数）。詳細パネルの inline は「主要な被参照の手がかり」を見せれば十分で、全件は既存のフッター導線（home の `referencingNoteId` フィルタ = ページネーション済み）が担う。

**status スコープ整合**: `findReferrers`（preview）は status 無条件で全 referrer（trashed 含む）。`countByOwner` も status 未指定なら全 status をカウント。両者で status フィルタを付けないことで母集合を一致させる。

### Consequences
- 良い点:
  - port 表面を増やさず、count/list/findByOwner の filter family の整合性を保つ。
  - preview を絞っても件数表示が正確。
- トレードオフ:
  - count クエリが 1 本増え、`resolveReferrerCandidates` の link 行 select が preview 側と count 側で 2 回走る。`Promise.all` で並列化して累積レイテンシを抑制。
  - status スコープを両側で揃える運用上の制約（テストで担保）。
- 注意:
  - N=5 は UX 仮置き。レビューで調整余地あり。
  - フォローアップ余地（PR #170 / #173 の `listWithCount` 前例と同型）: preview 側（`findReferrers` opts 指定）と count 側（`countByOwner`）で `resolveReferrerCandidates` の link 行 select が 2 回走る。本 Issue では `Promise.all` 並列化で十分だが、将来 `findReferrersWithCount` 的な統合 port で filter resolution を 1 回に畳む余地がある。本 Issue ではスコープ外。

---
