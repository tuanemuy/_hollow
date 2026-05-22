# PR Review #001 — feat(infra): wire R2 ObjectStorage / TempFileStorage and remove production Stubs

**PR:** #150
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9（重複含む — 実質 7 観点）
- Notes: 17
- Verdict: **APPROVED with non-blocking warnings to address**

3レイヤー（Infrastructure / Adapter / DI 配線、Test、Architecture / ADR 整合性）の並列レビュー結果を統合。

---

## Infrastructure / Adapter / DI 配線

### Blockers
なし

### Warnings

- **[I-W-001]** `createUnavailableObjectStorage` / `createUnavailableTempFileStorage` に `satisfies` を付けて将来の port 拡張時の回帰検知を強化する
  - 場所: `app/core/application/di/serverCloudflare.ts` の inline factory 関数
  - 提案: `return { ... } satisfies ObjectStorage;` 形にする

- **[I-W-002]** integration test の "R2 path was exercised" 検証コメントが片側保証しか説明していない
  - 場所: `app/worker/cloudflare/__tests__/handlers.integration.test.ts` ingestion テスト周辺
  - 提案: コメントで「unavailable fallback だと `get` が throw して ingestion ジョブが失敗するので、本テストが pass = R2 adapter が wire されている、という間接的な保証」と補足

- **[I-W-003]** `r2ObjectStorage.ts` の冒頭 module JSDoc が `R2PresignConfig` 直前に位置し誤読を招く
  - 場所: `app/core/adapters/cloudflare/r2ObjectStorage.ts:9-16`
  - 提案: そのままでも実害なし。配置整理するなら `R2ObjectStorage` クラスの JSDoc にマージするか、独立ブロックに分離

### Notes
- ADR-001 の `async () => { throw }` クロージャ形が完全に守られている
- adapter ファイルから Stub が消え、CLAUDE.md「adapter は port 実装のみ」原則と整合
- ServerEnv の optional が維持され ADR-002 の前提が成立
- wrangler.toml のコメントが挙動ベース表現に刷新済み
- SigV4 atomic 判定式と DI 分岐は変更なしで挙動互換
- `isStorageUnavailableError` / `isTempFileStorageUnavailableError` 型ガード経由の usecase 群は完全互換
- `assertObjectStoragePortUnavailable` ヘルパーで port 全 6 メソッドを DRY に検証

---

## Test (Unit + Integration)

### Blockers
なし

### Warnings

- **[T-W-001]** テスト名と説明が新挙動と乖離 — 「production Stubs」表現が残存
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:217`
  - 提案: `"surfaces explicit unavailable errors from the inline unavailable storage adapters and StubLLMProvider"` 等に改名

- **[T-W-002]** TempFileStorage downgrade 検証だけヘルパー化されておらず対称性が欠如
  - 場所: `serverCloudflare.test.ts:315-329`
  - 提案: `assertTempFileStoragePortUnavailable` ヘルパーを追加して 3 メソッドを一括検証

- **[T-W-003]** consumer 側 `TEMP_FILES` 欠落時の downgrade を直接検証する it.each ケースがない
  - 場所: `serverCloudflare.test.ts:836-853` 周辺
  - 提案: `it("downgrades to an unavailable TempFileStorage adapter when TEMP_FILES is missing", ...)` を consumer describe に追加

- **[T-W-004]** インテグレーションテストで Stub 不在検証が消えた代替保証が薄い
  - 場所: `handlers.integration.test.ts:777-840`
  - 提案: `expect(r2GetSpy).toHaveBeenCalledTimes(1)` + R2 結果が successfully resolve したことの assertion を追加、コメントで補足

### Notes
- `ObjectStorage` port の全 6 メソッドを `rejects.toThrow(StorageUnavailableError)` で網羅
- `rejects.toThrow` 形式で port 契約検証として適切
- `R2TempFileStorage.prototype.get` spy で R2 path 通過を positive に検証
- `Stub.*Storage` パターンが `app/` 配下にゼロ残存
- it.each の 5 ケース（R2_* 4 + binding）は刷新後も同等カバレッジ
- ポジティブテスト（toBeInstanceOf(R2*)）は維持
- afterEach で spy リーク対策済み

---

## Architecture / ADR 整合性 / 計画準拠

### Blockers
なし

### Warnings

- **[A-W-001]** `plan.md` 実装ステップ 4 と `adr.md` ADR-001 で「inline adapter の実装形」の記述が食い違う
  - 場所: `.issue/100/plan.md` 実装ステップ 4
  - 提案: plan.md の `Promise.reject` 表記を `async () => { throw new ... }` クロージャ形に揃え、ADR-001 への参照を残す

- **[A-W-002]** Issue 本文「やること (1)〜(3)」が「既に別Issueで完了済み」とする主張の充足根拠（traceability）が薄い
  - 場所: `.issue/100/plan.md` 「含まれないもの」
  - 提案: 該当行に「（Issue #XXX で配備済み）」リンク、または PR description の Summary に「(1)(2)(3) は #XXX / #YYY で先行配備済み」を一行追記

- **[A-W-003]** integration test の負のアサーション喪失で「不正な adapter wire 時の回帰検出力」が一段下がる（Test [T-W-004] と同根）
  - 場所: `handlers.integration.test.ts:823` 付近
  - 提案: T-W-004 と統合対応

### Notes
- ADR-001 / ADR-002 の双方向リンクが整っており ADR 運用として理想的
- 3 つの選択肢 (A) (B) (C) を ADR で比較した上で (B) を選択した judgment が明文化
- adapter ファイルの module JSDoc が「責務縮減」を読み手に明示
- ServerEnv optional 維持は妥当判断、ADR-002 で revisit 条件も明示
- PR タイトル・コミットメッセージとも規約準拠
- 差分はスコープ 5 つに綺麗に収まり、便乗リファクタなし

---

## Design Decisions

このラウンドで新たな設計判断は発生していない。レビューで挙がった warnings はいずれも plan.md / コード / テストの細部調整で、ADR レベルの判断変更は不要。

---

## 修正方針

すべての warning を本PR内で対応する（issue-implement skill の原則「Blocker・Warning 問わずできる限りすべてその場で修正」）:

1. **A-W-001**: `plan.md` 実装ステップ 4 を `async () => { throw }` 形に揃える
2. **T-W-001**: テスト名 `surfaces explicit unavailable errors from production Stubs` を改名
3. **I-W-001**: inline factory に `satisfies ObjectStorage` / `satisfies TempFileStorage` を付与
4. **T-W-002 + T-W-003**: `assertTempFileStoragePortUnavailable` ヘルパーを追加し、consumer 側にも TEMP_FILES 欠落 it.each ケースを追加
5. **T-W-004 + I-W-002 + A-W-003**: `r2GetSpy.toHaveBeenCalledTimes(1)` 追加 + コメントで補足
6. **A-W-002**: PR description の Summary に「Issue 本文 (1)(2)(3) は Issue #110 などの先行作業で配備済み」を一行追記
7. **I-W-003**: r2ObjectStorage.ts の冒頭 JSDoc 配置整理（軽微、`R2PresignConfig` と分離して module header として独立させる）
