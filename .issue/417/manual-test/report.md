# ブラウザ検証レポート — Issue #417: public 画面のボタン系統を common へ統一

**実行日**: 2026-06-03
**ブランチ**: issue/417/unify-public-buttons
**サーバー**: http://localhost:5175/（`pnpm dev --port 5175`, ライブソース）
**テストソース**: `.issue/417/testing.md`

## 結論

CSS クラス文字列のみの変更（PILL_BTN / SEARCH_FORM_BUTTON / GATE_SUBMIT を common pill primitive 合成へ寄せた）に対し、ボタンの見た目・色・配置・押下・disabled を検証。**実装バグ起因の FAIL は 0 件**。意図的差分（press feedback / disabled ガード）以外の回帰は検出されなかった。

特に懸念だった **SEARCH_FORM_BUTTON のモバイル幅 min-h 回帰**（base `max-sm:min-h-[44px]` で input をはみ出す可能性）は、ADR-004 の対策（配置を `top-1.5` 固定 → `top-1/2 -translate-y-1/2` 中央寄せ）により 375px 幅で bottomOverflow = -2px（はみ出しなし）を確認。対策が機能している。

## 結果一覧

| TC | 名前 | 結果 |
|----|------|------|
| TC-001 | ログイン pill(surface) + 検索ボタン(accent, PC幅) | PASS |
| TC-002 | 検索ボタン モバイル375px min-h 回帰 | PASS |
| TC-003 | ErrorPage primary(accent)/surface 色分け | PASS |
| TC-004 | UserPublicTop ページネーション pill | PASS（1ページ収まりで nav 非表示・仕様内） |
| TC-005 | ShareLinkGate 送信ボタン(accent/full-width/h-12) + disabled | PASS（解錠遷移のみ環境制約で自動検証不可） |
| TC-006 | reduced-motion press scale 無効 | SKIP（ソース担保） |

## 検証で確認できた要点

- **PILL_BTN → `${pillBtn} ${pillBtnPrimary}`**: data-primary 無し consumer（ログイン pill / 検索ページを開く）は surface 明色を維持、data-primary 付き（ホームへ戻る）は accent 暗色＋白文字。variant 後勝ちが実画面で機能。
- **SEARCH_FORM_BUTTON → base + primary + 中央寄せ absolute**: accent 維持、PC/モバイル両幅で input(48px) 内に収まる。
- **GATE_SUBMIT → `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full mt-2`**: accent / full-width（btn 366px == form 366px）/ h-12(48px) / rounded-pill を確認。auth BTN_PRIMARY と同型の描画。

## 制約・既知事項

- **TC-005 解錠遷移**: agent-browser からの server-function POST はクロスオリジン制約（403 FORBIDDEN_CROSS_ORIGIN）で自動検証不可。環境要因であり実装バグではない。ボタンのハンドラ発火（"確認中..." 表示）までは確認済み。解錠フローは integration テストで担保。
- **TC-006 reduced-motion**: OS 設定依存のため agent-browser での自動検証は対象外。`pillBtn` の `motion-reduce:active:scale-100` でソース上担保。
- **テーマ**: `--color-accent` は彩度0のダークグレー（`oklch(37.1% 0 0)`）。accent/surface は明度で明確に区別され、判定に支障なし。

## 起票した Issue

なし（FAIL 0 件）。

## 成果物

- 結果ファイル: `.issue/417/manual-test/results/TC-001.md` 〜 `TC-006.md`, `summary.md`
- スクリーンショット: `.issue/417/manual-test/screenshots/tc-001/` 〜 `tc-005/`（計9枚）
- シードデータ: `.issue/417/manual-test/seed-data.md`
- サーバー情報: `.issue/417/manual-test/server-info.md`
