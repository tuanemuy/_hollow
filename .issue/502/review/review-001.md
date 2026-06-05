# PR Review #001 — fix(ui): /export と /notes/$noteId/export を _app 配下へ取り込み AppShell を付与 (#502)

**PR:** #513
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 13
- Verdict: **BLOCKED**（Warning 残のため）→ 修正後 round 2 へ

---

## Frontend / Routing

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** `createFileRoute` の path 文字列が両ファイルとも `/_app` プレフィックス付きへ正しく更新（`/_app/export/` index系・`/_app/notes/$noteId/export` 非index系）。typecheck クリーン。
- **[N-002]** fullPath 不変を routeTree.gen.ts で確認（`/export/`・`/notes/$noteId/export`）。pathless `_app` は URL に出ない。
- **[N-003]** routeTree.gen.ts の差分は自動生成として妥当。旧エントリ除去済み・残骸なし・手動編集痕なし。
- **[N-004]** `head`(internalRouteHead) の path は canonical URL のまま（`/_app` 付けない）。`loader`/`inputValidator`/`staleTime:0` 維持。
- **[N-005]** `beforeLoad: requireAuthenticatedRoute` と import 削除、認証は `_app` ゲートへ一元化。防御 `getCurrentUser` 不追加は前例と一貫。
- **[N-006]** `NoteActions.tsx:200` の `to="/notes/$noteId/export"` は URL ベースで書き換え不要。`/export` への外部リンクなし。
- **[N-007]** `ExportForm/action` の side-effect import を両 leaf に維持。旧ディレクトリ削除済み、`notes/` は公開ビュー専用に純化。

## Security / RSC / アーキテクチャ

### Blockers
なし

### Warnings
- **[W-001]** `requireAuthenticatedRoute` がこの PR で呼び出し元ゼロのデッドコードになる
  - 場所: `app/core/presentation/authGuard.ts:30`
  - 理由: origin/main 時点の唯一の呼び出し元が、この PR で書き換える export 2 leaf だった。両 leaf から `beforeLoad: requireAuthenticatedRoute` を削除した結果、到達不能なエクスポート関数として残る。
  - 提案: 認証ゲートが `_app` の `loadAppShell` に一元化された以上、`requireAuthenticatedRoute` を削除するのが筋。
  - **→ 本ラウンドで対応**: 移行の総仕上げとして同 PR で削除（同じ機能内で完結する軽微な作業のためスコープ内と判断）。`checkAuthenticated` は `redirectAuthenticatedRoute` がまだ使うため残置。working tree 全体で参照ゼロを grep 確認、削除後 typecheck/lint クリーン。

### Notes
- **[N-001]** 認証ゲート委譲は正しい。両 leaf が `AppRouteRouteChildren` に登録され `getParentRoute: () => AppRouteRoute`。`loadAppShell` が確実に先に走る。バイパスの穴なし。
- **[N-002]** RSC マニフェスト登録維持（4 server-fn: start/enqueue/cancel/download）。`_app/exports/route.tsx` の同 import と冪等共存。
- **[N-003]** ADR-002（防御チェック不追加）妥当。export 2 leaf は `getCurrentUser` を呼ばず、`action.ts` の各 server-fn が `requireCurrentUser()` で多層防御。
- **[N-004]** Input validation は transport 境界のみで維持。CLAUDE.md 方針に整合。
- **[N-005]** ADR-001（公開ツリー据え置き）に認可漏れの副作用なし。`notes/public/$noteId.tsx` 未変更。
- **[N-006]** 未認証 redirect 変更（`/login`→`/`+HOME_SEARCH）は #293 ADR-006 通り。テスト影響なし。

---

## Design Decisions

このラウンドの設計判断: W-001 への対応として `requireAuthenticatedRoute` を本 PR で削除（adr.md ADR-004 に記録）。認証ゲートの `_app` 一元化が完了したことの帰結であり、Issue #502 の移行作業と同一機能の総仕上げ。
