# ブラウザ検証レポート — Issue #506

**Issue**: #506 非モーダル Popover（DatePopover）の role=dialog と初期フォーカスの扱い
**実行日時**: 2026-07-01
**テストソース**: .issue/506/testing.md
**サーバー**: http://localhost:3001（`pnpm dev` / vite dev Cloudflare runtime）
**認証**: `pnpm seed:dev-admin`（`dev-admin@example.com` / cookie `__Host-session` を CDP 注入）

## 結果: 全 6 件 PASS / FAIL 0

| TC | 対象 | AC | 結果 |
|----|------|----|------|
| TC-001 | FilterBar DatePopover 初期フォーカス（キーボード/click 起動） | AC-1/3/5 | PASS |
| TC-002 | FilterBar Escape クローズ＋フォーカス復帰 | AC-6 | PASS |
| TC-003 | FilterBar マウス click で誤クローズしない | Edge 1 | PASS |
| TC-004 | menu/listbox roving 非回帰 | AC-7 | PASS |
| TC-005 | 公開 PublicTopControls DatePopover 初期フォーカス | AC-4/5 | PASS |
| TC-006 | 公開 DatePopover Escape クローズ＋復帰 | AC-6 | PASS |

## 結論

非モーダル DatePopover（dialog モード）は、キーボード/マウスいずれの起動でもパネル内先頭のプリセットボタン「今日」へ初期フォーカスが移り、`role="dialog"` / `aria-haspopup="dialog"` の意味論を保持したまま onFocusOut 誤発火で閉じることなく、Escape でトリガーへフォーカス復帰する。FilterBar・PublicTopControls の両 DatePopover で挙動が一致。menu/listbox モードの roving フォーカスは従来どおりで二重化・回帰なし。Issue #506 の受け入れ基準（実機で観測可能な AC-1〜AC-7）をすべて満たす。

詳細は `results/summary.md` を参照。
