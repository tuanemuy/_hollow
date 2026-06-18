# ブラウザ検証レポート — Issue #732

**実行日:** 2026-06-14
**テストソース:** .issue/732/testing.md
**サーバー:** http://localhost:3000/ （pnpm dev）

## 結果サマリー

| TC | テスト名 | 対応AC | 結果 |
|----|---------|--------|------|
| TC-001 | fresh 未認証で LandingPage が即表示（誤抑制しない） | AC-2（最重要・退行検出） | PASS |
| TC-002 | 認証済みで `/` を開くと HomePage 表示 | AC-3 | PASS |
| TC-003 | セッション失効後に LandingPage へ収束 | AC-1/AC-5（収束部分） | PASS |

**合計:** 3件（PASS: 3 / FAIL: 0）

## 所見

- **TC-001（核心）:** cookie 無しの fresh 未認証訪問で LandingPage が即時・完全表示。レンダリングガード（`selectUnauthenticatedView`）が fresh 未認証を誤抑制して空白化する退行は発生せず。本 Issue で最も警戒した退行が無いことを確認。
- **TC-002:** `__Host-session` cookie 注入後の認証済み HomePage が従来どおり表示。
- **TC-003:** 認証済み → `cookies clear`（CDP）でセッション失効 → 再ナビゲートで LandingPage へ正しく収束。無表示固着・HomePage 残存・エラーなし。

## 制約・注記

- 本 Issue の本質「1 フレームのちらつき」は agent-browser では原理的に捕捉不能（snapshot 取得時には過渡フレームは過ぎている）。これを FAIL 扱いせず、(1) 収束状態の正しさ (2) fresh 未認証で LandingPage が抑制されない退行検出、で代替検証した。
- 過渡フレームのゼロフレーム化体感・実 RPC 回数（AC-4b）は testing.md の人手ブラウザ検証が引き続き主担当（plan どおり）。ユニットテスト（`useAuthGuardEffect.test.tsx` / `selectUnauthenticatedView.test.tsx`）が分岐の向き・収束遷移を自動担保している。

## 起票した Issue

なし（全 PASS）。
