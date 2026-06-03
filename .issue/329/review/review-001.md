# PR Review #001 — feat(#329): 内部リンクバックフィルの管理画面起動口を追加

**PR:** #448
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning を潰してから完了とする方針）

---

## ユースケース層・認可

#### Blockers
なし

#### Warnings
なし

#### Notes
- カーソルページングが `rebuildSearchIndex` と完全同型で正しい（owner 0件/1件/ページ境界すべて妥当）。
- 認可が全 owner walk の前に独立 UoW で確実に実行。owner usecase 無認可前提に穴なし。server function 側 `requireAdminUser` と二重ガード。
- 集計（`ownerCount`/`scannedNotes`/`resolvedRows`）の合算ロジック正しい。
- UoW 3層独立分割が `rebuildSearchIndex` の前例どおりで D1 ステートメント予算を超えない。
- DTO 越境・ServiceArgs・JSDoc・plan/adr 整合すべて問題なし。

## フロントエンド・プレゼンテーション層

#### Blockers
なし

#### Warnings
なし

#### Notes
- server function 規約完全準拠（middleware / requireAdminUser / loadServerDeps lazy import / DTO 返却 / inputValidator 不要判断）。RSC manifest 登録は既存 side-effect import でカバー。
- `useServerFn` + `useTransition` + `useState` 構成が既存 2 セクションと同型。アクセシビリティ属性（aria-busy/data-pending/role=status/role=alert）も一致。
- 結果文言が `resolvedRows` 主表示・`scannedNotes` 非 distinct 注記で正確。スタイル規約（既存定数再利用・新規 CSS なし）準拠。越境安全（DTO のみ）。

## テスト

#### Blockers
なし

#### Warnings
- **[W-001]** plan.md ステップ6 の検証項目4「owner ページング境界（`BACKFILL_OWNER_PAGE_SIZE` 跨ぎ）」が未実装。
  - 場所: `app/core/application/note/__tests__/backfillAllOwnersInternalLinkResolution.integration.test.ts`
  - 理由: `BACKFILL_OWNER_PAGE_SIZE=50` の cursor ページング walk は本 usecase 固有の新規ロジックで最も壊れやすい。現状最大 4 owner で 1 ページに収まり、2 ページ目遷移・cursor 引き継ぎ・終端判定が一切実行されない。cursor 取り違え/二重カウント/無限ループがあっても緑になる。
  - 提案: ページサイズ + 1 owner を seed して 2 ページ目遷移を踏ませる。`BACKFILL_OWNER_PAGE_SIZE` を export してテストが定数に追従するようにする。
- **[W-002]** `scannedNotes` が一切アサートされていない。
  - 場所: 同テスト（全ケース）。
  - 理由: 出力型・DTO・JSDoc・UI まで `scannedNotes` を主要返却値として扱うのにテストでゼロ検証。owner 横断の合算ロジックが壊れても検出できない。
  - 提案: 複数 owner ケースで `out.scannedNotes` の期待値を実数で検証。

#### Notes
- 認可・合算・冪等の 3 軸は実数アサーションで堅実。`ownerCount === 4`（admin 自身も walk される）の検証は良質。
- owner 0件/最小系・kind=id 行対象外は owner usecase 側で担保済みのため admin ラッパでの再検証価値は限定的（記録のみ）。

---

## 修正方針

W-001 / W-002 はともに同一テストファイル内・低コストで修正可能なため、本 PR で両方修正する（後回しにしない）。

## Design Decisions

特になし（既存 `rebuildSearchIndex` パターンの踏襲のため新たな設計判断なし）。
