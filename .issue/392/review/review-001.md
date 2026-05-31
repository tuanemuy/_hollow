# PR Review #001 — feat(issue/392): ディレクトリ絞り込みをサブツリー一致に揃える

**PR:** #395
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1（Adapter W-001：コメントの host-var 余裕表現が楽観的）
- Notes: 多数（いずれも「正しさ確認済み」）
- Verdict: **APPROVED**（Blocker 0。W-001 はコメント精度の修正で対応）

レイヤー: Domain / Adapter(Infra) / Use Case / Test の4観点を並列レビュー。

---

## Domain

### Blockers
なし

### Warnings
- **[W-D-001]** `collectSubtreeIds` は rootId 非存在でも全ノードの隣接リストを構築する（`service.ts`）。実害は depth<=10・owner 規模で軽微。正しさには問題なし。→ **見送り**（性能微小点、Note 相当）。

### Notes（要点）
- owner スコープ越境は `repo.findTree(ownerId)` 委譲で構造的に発生しない。cross-owner rootId は `all` に含まれず空配列。
- 非存在 rootId → 空配列 → adapter match-nothing 短絡、と ADR-002 silent-empty が一貫。
- port `directoryId`→`directoryIds` 変更は型・JSDoc・`NoteOwnerCountOpts` Pick 追従とも正確。
- visited ガードは malformed データへの防御として WHY 付きで妥当（CLAUDE.md コメント原則合致）。

## Adapter / Infrastructure

### Blockers
なし（ADR-003 の不変条件を1つずつコードで追跡し整合確認。typecheck 通過・integration 527件 pass）。

### Warnings
- **[W-A-001]** 小集合パス（`directoryIds.length <= SAFE_CHUNK_SIZE`）のコメント「well under the cap」が実態より楽観的。`length===90` のとき owner(1)+status(1)+dateRange(2)+visibility サブクエリ(~3) を重畳すると最悪 ~97 host vars で、cap=100 に対し余裕は 3。`SAFE_CHUNK_SIZE=90` の JSDoc が想定する「1〜2 個の追加バインド」より多くを重ねるため、コメントの margin 表現が不正確。→ **対応**：cap 内（必須ではない）だが、コメントを正確な host-var 会計に修正する。

### Notes（要点）
- match-nothing 短絡（`length===0 → return null`）は where-builder 1箇所で findByOwner/listWithCount/countByOwner の3経路すべてに効く。
- 大集合フォールバック `resolveDirectoryNoteCandidates` は directory-id を note-id 集合へ解決して candidateSet に積み、note-id 前提の `intersectIdSets` に directory-id を混ぜていない。
- `buildOwnerListWhere` async 化に伴う await 漏れなし。SAFE_CHUNK_SIZE 境界のオフバイワンなし。
- `findByDirectory`（直下）/ 検索経路は無変更で回帰なし。

## Use Case

### Blockers / Warnings
なし

### Notes（要点）
- `ctx.directoryRepository` は UoW context に実在（`execution/unitOfWork.ts:42` 必須スロット + `adapters/d1/unitOfWork.ts` で wire）を実コードで確認。同一 UoW で `findTree` も同トランザクション。
- 入力契約（単一 directoryId）維持 + port 集合化変換が ADR-001 どおり。ドメインロジック漏出なし。

## Test

### Blockers / Warnings
なし

### Notes（要点）
- 仕様カバレッジ網羅：サブツリー全件 / 兄弟除外 / 子起点 / タグ交差 / 非存在id空一覧 / host-var境界(96>90) / count>limit。collectSubtreeIds ユニットは単一/親子孫/兄弟非包含/非存在rootId。
- single-root・同名兄弟制約を破るデータ生成なし（`seedChildDirectory` の id 由来ユニーク name・depth 引数を実スキーマと照合）。
- Set 比較で順序非依存、count は items と独立検証で Issue #30 不変条件を担保。

---

## Design Decisions

新規 ADR なし。W-A-001 の対応はコメント精度の修正であり設計変更を伴わない（`<= SAFE_CHUNK_SIZE` の挙動は `SAFE_CHUNK_SIZE` JSDoc の設計 contract 内であり維持）。

## 対応方針

- **W-A-001 → このPRで対応**（コメント修正、同一ファイル内・低リスク）。
- W-D-001（隣接リスト構築の性能微小点）→ **見送り**。正しさに影響なし・owner 規模で実害なし。スコープ拡大を避ける。
