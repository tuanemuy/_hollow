# PR Review #001 — feat: 領域7（認証・エラー）のモック実装追従

**PR:** #592
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（Frontend 1 / Test 3）
- Notes: 多数（いずれも良い点）
- Verdict: **BLOCKED**（Warning 解消のため再レビューへ）

---

## Frontend

### Blockers
- なし

### Warnings
- **[W-FE-001]** `ReloadButton` / `BackLink` が同一 `"use client"` モジュールに同居。`ReloadButton` は `useRouter` 非依存なので別島にできた（凝集度の観点）。
  - 場所: `app/components/public/ErrorNavActions.tsx:16-28`
  - レビュアー評: 「実害なし・現状維持で許容範囲・修正必須ではない」。
  - **仕分け: 設計意図として受容（FIX しない）**。`ErrorNavActions` は「P34 エラーページの履歴ナビ系コントロール（back / reload）」という単一の関心でまとまった client 島であり、両者を1モジュールに同居させるのは凝集として妥当。バンドル増も僅少（500 のみ reload 描画）。adr.md の分割判断（ReloadButton/BackLink の2エクスポート）と整合。欠陥ではないため別Issue化も不要。

### Notes（抜粋）
- RSC/client 境界は最小化され ErrorPage 本体は SSR 維持（N-001）。`.alert` 案D は3フォームで一貫・塗りつぶし箱は完全除去（N-003）。同名 `FORM_ERROR` の取り違え無し・スコープ厳守（N-004/N-008）。`BACK_LINK` のトークン収斂・リテラルpx無し（N-005）。`data-primary` 規約整合（N-006）。a11y（button/aria-hidden/role）適切（N-007）。

---

## Test

### Blockers
- なし

### Warnings
- **[W-TEST-001]** 500 再読み込みの `location.reload()` 発火が未検証（plan ステップ4(e) の reload 観点が未カバー）。back は実 click → `toHaveBeenCalledTimes(1)` まで見ているのに reload はボタン存在のみ。onClick 配線が壊れても PASS する。
  - 場所: `app/components/public/__tests__/ErrorPage.test.tsx:130-138` / `ErrorNavActions.tsx:16-28`
  - **仕分け: FIX**。back と対称に `location.reload` を spy 化し、click で1回呼ばれることを assert する1ケースを追加。
- **[W-TEST-002]** LoginForm 失敗サマリーの body 実テキストを assert しておらず、`displayError` 経路（unauthorized→「認証が必要です」）の生存が素通し。
  - 場所: `app/components/auth/__tests__/LoginForm.test.tsx:80-99`
  - **仕分け: FIX**。各フォーム少なくとも1本で body の実出力テキストを assert し、案D の body 経路まで守る。
- **[W-TEST-003]** 案D「白地・塗りつぶしでない」を `not.toContain("bg-error-surface")` の否定アサーションのみで判定。別の塗りつぶしクラスへの書き換えはすり抜ける。
  - 場所: 4テストファイル全般（例 `SignUpForm.test.tsx:94` 他）
  - **仕分け: FIX**。肯定形で `bg-bg`（白地）と `border`（ヘアライン枠）の存在を assert に追加し、案D の塗り構造を肯定・否定の両面で守る。

### Notes（抜粋）
- plan ステップ4(a)〜(d) を的確にカバー、回帰観点（field 直下・未認証不変・検索ボックス出し分け）をテスト化（N-001）。back link は全バリアント横断で実 click 検証（N-002）。既存 `serverFnMock`/happy-dom パターン踏襲（N-003）。16本 PASS。

---

## Design Decisions

W-FE-001 を「設計意図として受容」とした以外、新規 ADR は無し。

## 仕分け結論

- FIX（このPRで対応）: W-TEST-001 / W-TEST-002 / W-TEST-003
- 受容（FIX しない・欠陥でない）: W-FE-001
