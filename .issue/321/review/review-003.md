# PR Review #003 — feat(#321): 内部リンクの後追い再解決

**PR:** #327
**Date:** 2026-05-29
**Round:** 3回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（すべて positive / 確認事項）
- Verdict: **APPROVED**

2視点でレビュー: (1) B-1 収束修正の検証＋全配送順序の収束分析、(2) 最終完全性（指摘の解決確認＋スコープ/ADR 整合）。

---

## B-1 収束修正検証

#### Blockers
なし

#### Warnings
なし

#### Notes
- `handleLinkTargetTrashed` のガード（`null`→FK済み / `active`→no-op / `trashed`のみ解除）は `handleLinkTargetResolution`（`active`のみ作用）と正確に対称。
- 全配送順序で収束を確認: 正順 / 逆順（restore先着）/ trash重複 / restore重複 / trash→restore→trash再配送 / purge。resolution(`active`のみ) と trashed(`trashed`のみ) が active/trashed を排他分割、null は両者 no-op で FK 委譲。漏れなし。
- 退行なし（正常 trash は `status==='trashed'` で確実に解除）。追加テスト（統合 reorder/redeliver、ユニット active/absent no-op）は偽陽性でなくガードを実検証。ADR-012 と実装一致。

## 最終完全性

#### Blockers
なし

#### Warnings
なし

#### Notes
- round-1/2 の全指摘（自己参照 W-T1 / backfill ページング W-A1 / setLinkResolution W-Ad1 / trashed 収束 B-1 / format W-F1）が解決済み、修正同士の干渉・退行なし。
- plan.md スコープ（作成/改名(content_updated・renamed)/trash・restore のバックフィル、既存滞留 backfill usecase）すべて実装・テスト済み。含まれないもの（purge は FK、moved/tags_replaced 不要）も dispatch の4イベント判定で正しく除外、テストで明示アサート。
- ADR-008〜012 すべて実装と一致。エラー/UoW/冪等/owner スコープ/型安全 OK。TODO/仮実装なし。

## 品質ゲート
- `pnpm typecheck` クリーン / `pnpm format:check` クリーン / Biome lint クリーン
- unit 2753 PASS / integration 461 PASS（全スイート）
- ブラウザ検証 3/3 PASS（Issue 起票なし）

## 結論
Blocker 0 / Warning 0 で **APPROVED**。3ラウンド（round-1: W×3、round-2: B×1+W×1、round-3: クリーン）で収束。

## Design Decisions
- ADR-011（`findUnresolvedIdLinkRows` 専用ポート追加）/ ADR-012（trashed handler の consume-time status 再読で対称化）を実装過程・レビュー過程で記録。
