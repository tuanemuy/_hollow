# 実装計画 — Issue #173: perf(notes): listNotesByOwner で findByOwner + countByOwner の重複計算を回避

**Issue:** #173
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

`listNotesByOwner` ユースケースで `findByOwner` と `countByOwner` を続けて呼ぶことで `buildOwnerListWhere` が 2 回走り、`intersected` 計算と各候補セット取得の I/O（`resolveVisibilityCandidateIds` / `resolveTagAndCandidates` / `resolveReferrerCandidates`）が二重化される。これを 1 回に集約する。

PR #170 (Issue #165) レビュー指摘 **P-W-004 のフォローアップ**で、`.issue/165/adr.md` ADR-001 Follow-up にも記録済み。

## スコープ

### 含まれるもの

- `NoteRepository` ポートに `listWithCount(ownerId, opts)` を追加し、D1 アダプターで `buildOwnerListWhere` を 1 回だけ走らせる実装
- `listNotesByOwner` usecase を新 API に切り替え
- ポートを実装している全箇所（D1 アダプター + `runExportJob` の inline stub）の型エラー解消
- D1 adapter integration test の追加（新 API の意味論検証）
- spec ドキュメント (`spec/domains/note.md`, `spec/usecases/note.md`) の同期

### 含まれないもの

- 他リポジトリ（`tag`, `media`, `ingestion` 等）への横展開 — grep 結果から、現状 `findByOwner` + `countByOwner` ペア呼び出しは `listNotesByOwner` 1 箇所のみ。`listWithCount` 相当 API を他 repository に追加する必要はない（Follow-up として記録するに留める）
- ADR-001 §Follow-up の P-W-001/P-W-002（2-pass 化）への対応 — 別 Issue で扱う
- ADR-001 §Follow-up の A-W-003（chunk 並列数上限ガード）への対応 — 別 Issue
- 既存 `findByOwner` / `countByOwner` の削除 — 単体利用 usecase の可能性があるため残す

## 設計判断（採用案）

**(1) batch API `listWithCount` を採用**

`NoteRepository` ポートに `listWithCount(ownerId, opts): Promise<{ items: readonly Note[]; count: number }>` を追加し、D1 アダプター内部で `buildOwnerListWhere` を 1 回だけ走らせて list と count を同じ `(where, idScope)` から生成する。

却下案:
- **(2) usecase 層 memo**: `buildOwnerListWhere` の `(where, idScope)` 構造を usecase に露出させると、adapter 内部の SQL 表現が domain ポートを汚す（hexagonal 違反）
- **(3) UoW を貫いた memo**: UoW context にリポジトリ実装詳細が漏れる。横断的影響大

詳細は `.issue/173/adr.md` ADR-001 を参照。

## 実装ステップ

### 1. ポートに `listWithCount` を追加

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:**
  ```ts
  listWithCount(
    ownerId: UserId,
    opts: NoteOwnerListOpts,
  ): Promise<{ items: readonly Note[]; count: number }>;
  ```
  JSDoc を厚めに書く（既存 `findByOwner` / `countByOwner` の JSDoc が好例）。明記すべき契約:
  - `findByOwner(ownerId, opts)` + `countByOwner(ownerId, opts)` と意味論的に等価
  - アダプター実装は同じ filter 解決を 1 回だけ走らせて両方を返す
  - `count` は filter 適用後の総件数（pagination 前。`opts.limit/offset/sort/order` は `items` 側のみに作用し `count` には影響しない）
  - PR #170 ADR-001 Follow-up P-W-004 由来
- **理由:** usecase 側から adapter 内部詳細に依存せず最適化の恩恵を受けられるようにする

### 2. D1 アダプターに `listWithCount` を実装

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** `findByOwner` の直後にメソッドを追加。内部で `buildOwnerListWhere(ownerId, opts)` を **1 回だけ**呼び:
  - `null` → `{ items: [], count: 0 }` を短絡返却
  - `idScope === null` 経路: ORDER BY/LIMIT/OFFSET の 1 クエリで `items` 行を取得 + 別途 `select count() from notes where (where)` で `count` を取得（`Promise.all` で並列化）
  - `idScope !== null` 経路: `selectInChunks(Array.from(idScope), ...)` を **1 度だけ**走らせて全 chunk 行を取得 → JS sort で全件 sort → `count = sorted.length` / `items = sorted.slice(offset, offset+limit)` → `hydrateMany(items)`。`countByOwner` 側の per-chunk `count()` クエリは不要になる
  - `findByOwner` / `countByOwner` の既存実装は**残す**（単体利用後方互換）
- **理由:** アダプター内部に最適化を閉じ込める。`buildOwnerListWhere` は private のまま

### 3. `listNotesByOwner` ユースケースを新 API に切り替え

- **対象ファイル:** `app/core/application/note/listNotesByOwner.ts`
- **変更内容:**
  - `findByOwner` + `countByOwner` の 2 連続呼び出しを `ctx.noteRepository.listWithCount(input.actorUserId, opts)` の 1 呼び出しに置き換える
  - `countOpts` 宣言を削除し、`opts` を `listWithCount` に渡す（`count` 側は `limit/offset/sort/order` を無視する契約）
  - `const { items: found, count: total } = await ...` で受け取り、以降の DTO 化処理はそのまま
  - 既存コメント「`// Filter set shared between the list query and the count query so the rendered count cannot disagree with the visible slice (Issue #30).`」は意味論を失わないよう、「`listWithCount` が同一 filter 解決から両方を導出するため、list/count は構造的に一致する（Issue #30）」相当に書き換えて残す
- **理由:** 本 Issue の本旨である重複計算回避を実現する usecase 側修正。Issue #30 由来の不変条件は型ではなく ports の契約に移動するため、コメントで意図を継承する

### 4. ポートを実装している全 stub への対応

ポートに新メソッドを足すため `implements NoteRepository` をしている全箇所が型エラーになる。grep (`implements NoteRepository`) で確認した全箇所:

#### 4-a. `runExportJob` の inline stub
- **対象ファイル:** `app/core/application/export/runExportJob.ts`
- **変更内容:** `noteRepo` オブジェクト内に `async listWithCount() { return { items: [], count: 0 }; }` を追加。意図が読めるよう「export 経路では未使用のため空返却」のコメントを 1 行入れる
- **理由:** stub の意味論（export 経路では使われない）に従って空を返す

#### 4-b. `StubNoteRepository`（directory service test）
- **対象ファイル:** `app/core/domain/directory/__tests__/service.test.ts`（class `StubNoteRepository implements NoteRepository`）
- **変更内容:** 既存の throw パターンに揃えて以下を追加
  ```ts
  listWithCount(_o: UserId, _opts: NoteOwnerListOpts): Promise<{ items: readonly Note[]; count: number }> {
    throw new Error("not implemented");
  }
  ```
- **理由:** `DirectoryService.deleteSubtree` は `listWithCount` を使わないため、既存方針（"All other methods throw, so an accidental dependency on them surfaces immediately"）に従う

`as unknown as NoteRepository` キャストの 2 stub（`app/core/domain/view/__tests__/service.test.ts:91`, `app/core/application/view/__tests__/fakes/container.ts:66`）は構造的型を回避するため typecheck は通る — 対応不要だが `pnpm typecheck` で念のため確認する

### 5. D1 アダプター integration test の追加

- **対象ファイル:** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
- **変更内容:** 新規系列として `T-listWithCount-001..` を追加（T-bind-* は Issue #165 の bind 上限文脈、本 Issue は意味論検証で関心事が異なるため別系統で命名）:
  - **T-listWithCount-001**: `idScope === null` 経路で `listWithCount(opts)` が `(findByOwner(opts), countByOwner(opts))` と等価
  - **T-listWithCount-002**: `idScope !== null` 経路（chunk）で 150 件 × visibility filter のようなクロスチャンク条件でも `listWithCount` ≡ `(findByOwner, countByOwner)` 等価性
  - **T-listWithCount-003**: 空 intersected scope（T-bind-014 相当の `tagIds=[存在しないtagId]`）で `{ items: [], count: 0 }` 短絡
  - **T-listWithCount-004**: `limit/offset/sort/order` が `count` に作用しない（`limit=10` でも `count === 全総件数`）
- **方針:** 既存 T-bind-* の条件と一字一句重複するセットアップは避け、`listWithCount` × `(findByOwner, countByOwner)` の同値性 pinning に集中する
- **理由:** 新メソッドの契約（特に list/count 整合）を D1 レベルで保証

### 6. `listNotesByOwner` usecase integration test の確認

- **対象ファイル:** `app/core/application/note/__tests__/listNotesByOwner.integration.test.ts`
- **変更内容:** 既存テストは usecase 出力 (`{ notes, count }`) のアサーションなので、内部実装変更による期待値変化は無し。回帰のみ確認
- **理由:** usecase の外部観察可能な動作に変化が無いことを確認

### 7. spec ドキュメントと PR #170 ADR の同期

- **対象ファイル:** `spec/domains/note.md` (NoteRepository 節)
- **変更内容:** `listWithCount` を `NoteRepository` メソッド一覧に追記。「`findByOwner` + `countByOwner` を 1 回の filter 解決で返すバッチ API。`listNotesByOwner` ユースケース向け最適化」
- **対象ファイル:** `spec/usecases/note.md` (ListNotesByOwner 節)
- **変更内容:** `findByOwner` を呼ぶ記述を `listWithCount` に書き換える
- **対象ファイル:** `.issue/165/adr.md`
- **変更内容:** §Follow-up 候補の **[P-W-004]** 行末に「→ Issue #173 で対応 (PR #XXX)」相当のマーキングを追記し、Follow-up 追跡の網が切れないようにする
- **理由:** spec と実装の同期（CLAUDE.md "Hexagonal architecture"）、および ADR チェーンのトレース性確保

### 8. ADR 起票

- **対象ファイル:** `.issue/173/adr.md`（新規）
- **変更内容:** 採用案・却下案・契約・横展開しないことの明文化を ADR として記録
- **理由:** 設計判断の記録

### 9. 品質ゲート

- **コマンド:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`
- **理由:** CLAUDE.md の "After changes" 規約。特に integration test (D1 binding 必須) を必ず通す

## リスクと注意点

- **ポート実装箇所の見逃し**: ポートに新メソッドを足すため、`NoteRepository` を実装するあらゆる箇所が型エラーになる。grep で `runExportJob.ts` が唯一の adapter 外実装と確認済みだが、`pnpm typecheck` で必ず捕捉する
- **`count` の意味論の取り違え**: `count` は `items.length` ではなく**filter 適用後の総件数（pagination 前）**であることを JSDoc とテストで強固にする。`listNotesByOwner` の従来挙動と完全に一致させる
- **D1 トランザクション内整合**: usecase 側で `UnitOfWorkProvider.run(fn)` の同一 context 内で呼ばれているため、現状でも整合性は確保されているが、`listWithCount` 化により list と count が**完全に同じ filter 解決結果**から導出されるため、整合性は**強化**される方向
- **chunk 経路で count に `select count()` を別途叩かない理由**: chunk 経路では既に全 idScope 分の行を materialise しないと sort/slice ができないため、`sorted.length` で count を取る方が 1 ラウンドトリップ削減になる。P-W-001/P-W-002 の 2-pass 化（別 Issue）導入時は count 取得方法を再考する必要があり、ADR に注記する
- **既存 `findByOwner` / `countByOwner` を残すことによる API 重複**: ポート公開面が肥大化するが、単体利用 usecase の可能性を考えると残す方が安全。`listWithCount` の JSDoc で「両者の意味論的合成」と明示することで API 利用者の選択指針を示す
- **`Promise.all` 並列実行の安全性**: D1 アダプターは binding 直叩きの読み取りで in-flight transaction を共有しない（`noteRepository.ts` 冒頭 JSDoc 参照）。前例として `loadChildren` (`noteRepository.ts:233-252`) が既に `Promise.all` で 3 並列クエリを走らせており、同等パターンで安全

## テスト方針

- **D1 adapter integration test**:
  - `listWithCount` × `idScope === null` 経路: `findByOwner` + `countByOwner` の結果と完全一致することを cross-check
  - `listWithCount` × `idScope !== null` 経路: T-bind-010/011 と同等の 150 件 × visibility filter で chunk 跨ぎでも `items.length === limit` かつ `count === 150` を確認
  - 空 intersected: T-bind-014 相当で `{ items: [], count: 0 }` 短絡
  - `limit/offset/sort` と `count` の独立性: `limit=10, offset=0` でも `count` が全総件数を返す
- **`listNotesByOwner` usecase integration test**: 既存テスト群がそのまま通ることを回帰確認
- **品質ゲート**: `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`

## レビュー履歴

### 1周目

**修正した点（問題点）**:
- **[P-001]** `StubNoteRepository`（`app/core/domain/directory/__tests__/service.test.ts:135`）への `listWithCount` 追加が plan から欠落していた → ステップ 4 を「ポートを実装している全 stub への対応」に拡張し、4-a (`runExportJob` stub) / 4-b (`StubNoteRepository`) に分割。リスク欄の「`runExportJob.ts` が唯一の adapter 外実装」記述も修正

**取り込んだ改善提案**:
- **[S-001 (要件視点)]** ステップ 3 で Issue #30 由来コメントを意味論を継承する形で書き換えて残すよう明記
- **[S-003 (要件視点)]** ステップ 5 のテスト ID を T-bind-* 連番から `T-listWithCount-001..004` の別系統に変更
- **[S-002 (アーキ視点)]** ADR §補足に「既存 `countByOwner` の chunk per-chunk `count()` が `listWithCount` で純減」の説明を追加
- **[S-003 (アーキ視点)]** plan のリスク欄と ADR §補足に「`Promise.all` 並列実行の安全性」根拠（`loadChildren` 前例）を追記

**見送った提案**:
- **[S-002 (要件視点)]** `runExportJob` stub に意図コメント — ステップ 4-a に「export 経路では未使用のため空返却」コメントを入れる旨を明記したため取り込み済み（部分採用）
- **[S-001 (アーキ視点)]** ポート JSDoc の語彙選定は実装フェーズで既存 `findByOwner`/`countByOwner` JSDoc のトーンを揃えれば自然に解決するため、plan に追加文言は不要と判断（実装時に注意点として処理）
- **[S-004 (アーキ視点)]** テスト本数の最適化方針 → ステップ 5 で「既存 T-bind-* と一字一句重複するセットアップは避ける」と明記したため取り込み済み（部分採用）

### 2周目

**両視点とも問題点ゼロ**で終了。

**取り込んだ改善提案**:
- **[S-001 (要件視点)]** `.issue/165/adr.md` §Follow-up の P-W-004 行に「Issue #173 で対応」マーキングを追記する手順をステップ 7 に追加 — ADR チェーンの追跡性確保

**見送った提案**:
- **[S-002 (要件視点)]** `as unknown as NoteRepository` キャスト経路を ADR §補足に追記 — 構造的型キャストの脆弱性は本 Issue のスコープ外（将来の構造的安全性議論として別途扱う）
- アーキ視点: 改善提案なし
