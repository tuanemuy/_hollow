# Step 0 実証結果 — Issue #670（再マウント・編集内容喪失の実測）

**検証日:** 2026-06-13
**環境:** `pnpm dev`（vite, port 3001）+ agent-browser 0.27.1 / local D1（`seed:dev-admin`）
**ブランチ:** `issue/670/loader-seed-remount-resilience`（#676 を含む origin/main から分岐済み・`.issue/669/` 実在）

## 実証方法

各フォームコンポーネントに一時 mount プローブ（`app/components/_mountProbe.tmp.ts` の `useMountProbe`）を仕込み、コンポーネントの root に `data-mount-probe` を描画。`useState` の lazy initializer は **実マウント時のみ** インクリメントされ、再レンダー（reconcile）では不変・再マウントでは新インスタンスとして増加する。これにより「invalidate が reconcile か remount か」を一次観測する。

invalidate は `window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })` で発火。本番の `routerInvalidate(router)`（`app/components/common/routerInvalidate.ts`）は `_app` とエディタールート（`/_app/notes/$noteId/edit`・`/_app/notes/new`）を除外するが、**対象3ルートはいずれもエディタールートに該当しない**ため、エディタールート除外条件は対象3ルートに対して恒等。よって本実測フィルタ（`_app` のみ除外）は対象3ルートに対し本番 `routerInvalidate` と **発火結果が恒等**であり、`UploadDialog` 完了が呼ぶ本番経路を忠実に再現している。focus を動かさない eval 経由のため、フォーカス喪失の有無を交絡なく観測できる。

## 観測結果

| 観測項目 | `/_app/views`（SavedViewRow inline rename, ×3, staleTime:0） | `/admin/prompts`（PromptCard, ×5, staleTime:0） |
|---|---|---|
| 再マウント（mount probe） | ❌ 起きない（"1" のまま） | ❌ 起きない（"1" のまま） |
| 編集内容（入力 value） | ✅ 保持（`..._EDIT670` / `UNSAVED_ADMIN670`） | ✅ 保持 |
| DOM ノード同一性 | ✅ 同一ノード（`__tag670` 残存） | ✅ 同一ノード（`__tag670` 残存） |
| DOM 位置 | ✅ 同一親・同一 index・document 内に残留 | ✅ 同一親・同一 index・document 内に残留 |
| フォーカス | ⚠️ **失われる**（activeElement → BODY） | ⚠️ **失われる**（activeElement → BODY） |

補足:
- **コントロール**: invalidate を発火せず focus + 3秒待機 + 無関係 eval を行うと focus は保持される（`focused: true`）。→ フォーカス喪失は **invalidate が原因**であって eval / 待機の artifact ではない。
- **個人 prompts（`/_app/settings/prompts`）**: DEV では `staleTime: 0` で views / admin と同一挙動。本番は `staleTime: Infinity` のため invalidate で loader 再実行されない可能性が高く、本番では再レンダー自体が起きず focus 喪失も起きない（= さらに安全側）。コンポーネント構造（seed-once `useState`・再seed effect 無し・invalidate で変わる key 無し）は admin/views と同一。
- raw invalidate（`_app` 含む）でも同一結果（value 保持・再マウント無し・focus 喪失）。#669 TC-009（生 invalidate でも編集維持）と整合。

## 結論

### Issue の前提は再現しない（防御機構 a/b/c は不要）
対象3ルートはいずれも `Route.useLoaderData()` が `renderServerComponent(...)` の RSC ペイロードを返す同一パターン。loader 再実行 → ペイロード差し替えは **client component を reconcile（props 更新）するだけで再マウントしない**（mount probe で実証）。さらに各フォームの編集 state は seed-once `useState` で、再seed effect も invalidate で変わる key も持たないため、**reconcile では編集内容が保持される**（value 実測で実証）。

→ Issue 本文・plan・ADR が想定した「invalidate 起因の**再マウント**で**編集内容を失う**」は **どのルートでも再現しない**。plan ADR-001 の防御機構 (a)/(b)/(c)（state を再マウントから守る仕組み）は **作るべきでない**（plan が最大リスクとした「Step 0 を飛ばした過剰設計」に該当する）。

### 別症状: invalidate でフォーカスが外れる（value は残る）
mount もせず DOM ノードも同一・同位置のまま、focus だけが失われる。React の RSC ペイロードコミット時の一時的な subtree detach/再 attach が原因と推定（同一ノードが detach→再 attach されると browser は focus を落とす）。

- これは「state 喪失」ではないため plan の (a)/(b)/(c) では直せない（守る state が無く、防ぐ remount も無い）。
- 重篤度は低い: 入力内容は保持され、UploadDialog 完了など**バックグラウンド invalidate がフォーカス中に重なった時だけ**カーソルが外れる（再クリックで継続可能）。
- 根本原因が別で、修正は focus 退避/復元 or ルート描画構造の見直しという別アプローチが要る。Issue #670 / plan の枠組み外。

## AC への対応

- **AC-1**: 本ドキュメントで再マウント実証結果を記録（本番相当 invalidate のブラウザ観測が一次根拠）。✅
- **AC-2/3/4（入力内容保持）**: 全ルートで **編集内容(value)は保持される** ことを実証。✅（再マウント・value 喪失は不存在）
- **AC-2/3/4（フォーカス保持）**: フォーカスは invalidate で失われる。⚠️ ただし原因は Issue 前提の「再マウント」ではなく別機序。別 Issue で追跡（下記）。
- **AC-5（保存→最新値再表示）**: 既存挙動（各フォームの保存後 `routerInvalidate` → reconcile で最新 props 反映）は維持。変更を加えないため退行なし。✅
