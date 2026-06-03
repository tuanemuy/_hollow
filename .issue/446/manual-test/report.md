# ブラウザ検証レポート — Issue #446

**実行日時:** 2026-06-04
**テストソース:** `.issue/446/testing.md`
**サーバー:** http://localhost:3010（`PORT=3010 pnpm dev --port 3010`）
**検証対象:** admin の surface ローカルボタン定義を common `pillBtn` / `pillBtnSm` へ寄せる純粋な UI リファクタ

## 認証

dev には email/password 認証しかないため、seed した管理者セッション（token `verify446-token-abc` / ユーザー `verify446-admin@example.com` = admin・email_verified=1）を使い、CDP 経由で `__Host-session` cookie を注入して認証済み描画を検証（メモリ `browser-verify-authed-routes` の手順）。検証後 seed 行は削除済み。

## 結果サマリー

| TC | 画面 | 対象定数→寄せ先 | 結果 |
|----|------|----------------|------|
| 1 | /admin/users | `BTN_SM_CLASS` → `${pillBtn} ${pillBtnSm}` + `data-sm` | PASS |
| 2 | /admin/jobs | `BTN_SM_CLASS` → `${pillBtn} ${pillBtnSm}` + `data-sm` | PASS |
| 3 | /admin/llm | `BTN_CLASS` → `pillBtn` | PASS |
| 4 | /admin | `ADMIN_BTN_CLASS` → `pillBtn`（Link はエラー時のみ表示） | PASS |

**合計: 4 件（PASS: 4 / FAIL: 0）**

## 所見

- **/admin/users:** Active/Suspended/Other Admin 各行の操作ボタン（一時停止・復帰・管理者に昇格・管理者を解除）が small surface pill（h-7 相当・text-xs・薄グレー背景・角丸 pill・アイコン+ラベル間隔自然）で表示。hover で surface-hover に変化。レイアウト崩れなし。
- **/admin/jobs:** 失敗行の「再実行」と、常時表示の「再構築を実行」「バックフィルを実行」「再暗号化を実行」がいずれも small surface pill で表示。崩れなし。
- **/admin/llm:** 「接続テスト」が h-9 surface pill、最下部「変更を保存」が primary pill で、両者の高さ・形状が揃う。
- **/admin:** ダッシュボード正常描画。`pillBtn` の Link はエラー/未検出時のみ表示される設計のため通常状態では未出現（仕様どおり）。

## 補足（生成 CSS 検証）

`pnpm build` の生成 CSS で `data-[sm]:` height/font-size 規則（byte ~57.5k）が base `.h-9` / `text-sm`（byte ~15k）より後方にあり、variant が後勝ちすることを確認（#442 と同論点）。

## スクリーンショット

- `screenshots/users.png` / `screenshots/users-hover.png`
- `screenshots/jobs.png` / `screenshots/jobs-full.png`
- `screenshots/llm.png`
- `screenshots/admin-index.png`

## 起票した Issue

なし（全 PASS・視覚回帰なし）。
