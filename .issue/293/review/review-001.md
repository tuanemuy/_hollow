# PR Review #001 — feat(issue/293): persist AppShell across authenticated route navigations

**PR:** #297
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 12
- Notes: 19
- Verdict: **BLOCKED**

---

## Frontend / Route Architecture

#### Blockers
なし

#### Warnings
- **[W-F-001]** `AppShellFrame.tsx` の side-effect import コメントが現状と乖離（`_app/route.tsx` も同じ import を持つため「集約」と書くと嘘になる）
  - 場所: `app/components/layout/AppShellFrame.tsx:11-14`
  - 提案: コメントを実態に合わせて書き直すか、`_app/route.tsx` 側の同 import を削除して一本化
- **[W-F-002]** `HomePage.tsx` の JSDoc が「shell」「sidebar」のニュアンスのまま（AppShell ラップを撤去した今は単なる props 中継）
  - 場所: `app/components/note/HomePage.tsx:19-24`
  - 提案: 「shell」「sidebar」言及を外し props 合成ラッパーとしての説明に書き直す
- **[W-F-003]** `getRouteApi("/_app/")` への routeId 変更後、JSDoc が `getRouteApi("/")` のまま
  - 場所: `app/components/note/list/DisplayModeSwitch.tsx:20`、`NoteListViews.tsx:18`、`__tests__/NoteListViews.test.tsx:9`
  - 提案: routeId 文字列をコメントから外すか `"/_app/"` に同期
- **[W-F-004]** `__tests__/index.loaderDeps.test.ts` のコメントと mock が実装と乖離（`_app/index.tsx` は side-effect import を持たない）
  - 場所: `app/routes/__tests__/index.loaderDeps.test.ts:25-34`
  - 提案: 不要 mock の削除またはコメント更新

#### Notes
- N-001: ADR-007 の判断が `__root.tsx` の `beforeLoad: () => loadAppContext()` パターンと整合
- N-002: `_app.loader` の RSC slot 方式は docs の canonical pattern と整合
- N-003: routeTree.gen.ts の差分が期待通り（`'/_app': { path: '', fullPath: '/' }`）
- N-004: defensive 1-line redirect が 7 ファイルで一貫
- N-005: `staleTime` 式が `__root.tsx` と一致
- N-006: `AppShell.tsx` が dead code 化したが ADR-004 で「本 Issue では削除しない」と明示済み（grep で外部参照ゼロ確認）
- N-007: 2 server fn 並列化（`Promise.all`）は ADR-007 で受容済み

---

## Auth / Security

#### Blockers
なし

#### Warnings
- **[W-A-001]** `_app.loader` の `staleTime: Infinity` + `_app.beforeLoad` が子間遷移で再評価されないため、セッション失効後に旧 `userDto` ベースの AppShell が表示され続けるウィンドウがある
  - 場所: `app/routes/_app/route.tsx:75-86`
  - 提案: セッション関連イベントで `_app` を invalidate するフロー。最小修正は leaf の defensive redirect + `router.invalidate({ filter: r => r.routeId === "/_app" })` 相当。ただし server fn からは router を呼べないため client 側 wrapper か別アプローチが必要 → **別 Issue 推奨**
- **[W-A-002]** `resolveAppAuth` の `pathname` 入力に長さ上限がない
  - 場所: `app/routes/_app/route.tsx:39`
  - 提案: `z.string().max(2048)` 程度。**W-P-005 の pathname 撤去で同時解消**
- **[W-A-003]** ADR-005 の文言（「redirect ガードを削除」）と実装（defensive 1 行を残す）の乖離
  - 場所: `app/routes/_app/notes/new.tsx:15` ほか 8 leaf
  - 提案: ADR-005 を「leaf 側 defensive guard は意図的に残す」と更新するか新 ADR で記録

#### Notes
- N-001: ADR-007 の判断が manual-test で実機検証済み
- N-002: `normalizeAuthGuardPathname` の網羅性確認（trailing slash, 空文字, 小文字化）
- N-003: 全 leaf で redirect 先が `/` + `HOME_SEARCH` 統一、`/login` 混入なし
- N-004: `errorComponent` 全 11 箇所で `sanitizeRouteError` 経由（情報露出なし）
- N-005: side-effect import 集約が `__root.tsx`（auth）と `_app/route.tsx`（auth ページ）で role-based に分離
- N-006: `_app/index.tsx` の `renderHome` が独自に `getCurrentUser` を呼ぶため SSR / SPA 両経路で安全

---

## Performance / RSC

#### Blockers
- **[B-P-001]** `router.invalidate()` ノーフィルター呼び出しが 30+ 箇所残っており、`_app` を強制的に再評価させて Issue が解決したいキャッシュ局所性を実質的に無効化する
  - 場所: `app/components/directory/DirectoryTree.tsx:496`、`app/components/note/list/MoveNoteDialog.tsx:73`、`BulkActionBar.tsx:54`、`BulkVisibilityDialog.tsx:64`、`NoteEditor.tsx:263`、`UploadDialog.tsx:321,532`、`UploadForm.tsx:40`、`IngestionPreviewForm.tsx:210`、`IngestionJobRow.tsx:96,108`、`publication/PublishSettings/index.tsx:55,71,182,197`、ほか identity/auth/admin 配下に 20+ 箇所
  - 理由: TanStack Router の `router.invalidate()` はフィルタなしですべてのマッチを invalid 化する。`staleTime: Infinity` を上書きするため、mutation 後に `_app` が再評価され Sidebar の `loadDirectoryTree` が走り直す。Issue が抑えたいはずの「Sidebar 再フェッチ抑制」が mutation のたびに自分で潰れる
  - 判断: **本 PR ではスコープ外として受容**。30+ 箇所変更は変更範囲が大きすぎ、Issue 本文の主目的「ページ遷移時の AppShell 再マウント抑止」は manual-test で確認済み。invalidate filter 化は **別 Issue を起票** して継続課題とする。ADR で経緯を記録

#### Warnings
- **[W-P-001]** SPA 遷移ごとに `resolveAppAuth` RPC が 1 ラウンドトリップ発生し、`_app.loader` の `staleTime: Infinity` 恩恵が半減
  - 場所: `app/routes/_app/route.tsx:37-47, 76-85`
  - 理由: `beforeLoad` は `staleTime` を見ず毎回実行される
  - 提案: `loadAppShellChrome` 冒頭で redirect を集約し `beforeLoad` を削除。SPA 2 本目以降の navigation で RPC ゼロに → **修正**
- **[W-P-002]** `_app.errorComponent` 発火で AppShell ごと差し替わるため、`resolveAppAuth` の一過性失敗が Issue 本来の目的を瞬間的に破壊
  - 場所: `app/routes/_app/route.tsx:88-95`
  - 提案: errorComponent を shell 残し / main だけエラーに、または retry 動線。**作業量大 → 別 Issue 起票**
- **[W-P-003]** Sidebar の RSC payload にディレクトリツリー全体が乗り、大規模ユーザーで payload 肥大化リスク
  - 場所: `app/components/layout/Sidebar.tsx:23-24`、`app/routes/_app/route.tsx:69`
  - 提案: B-P-001 を解消すれば re-fetch 頻度が下がるので妥協可。長期は client 側 lazy fetch → **別 Issue 起票**
- **[W-P-004]** ADR-005 の「`cache()` で `getCurrentUser` の 3 重呼び出しは実質ノーコスト」が server fn 境界をまたぐと確証できない
  - 場所: `app/routes/_app/route.tsx:42,53`、各 leaf
  - 提案: W-P-001 の loader 統合で `resolveAppAuth` + `loadAppShellChrome` の `getCurrentUser` は 1 回に揃う。leaf 側は本 Issue では妥協。**W-P-001 と同時解消**
- **[W-P-005]** `_app.beforeLoad` の `location.pathname` を毎回 server fn 引数として送るのは過剰（判定はクライアント実行可能）
  - 場所: `app/routes/_app/route.tsx:39, 77-78`
  - 提案: W-P-001 の loader 統合で同時解消

#### Notes
- N-001: Header / Sidebar の `Promise.all` 並列化は正しい
- N-002: dynamic import の `Promise.all` 並列化も妥当
- N-003: ADR-007 の「`beforeLoad` / `loader` から `server-only` を直接 import しない」は CLAUDE.md に追記する価値あり
- N-004: leaf 遷移時に Sidebar の DB アクセスが消える改善は確実に効いている
- N-005: `_app.loader` が `loaderDeps` を持たない設計は正しい

---

## Design Decisions

- **B-P-001 を別 Issue に切り出す判断**: Issue #293 の主目的「リーフ単純遷移時の AppShell 再マウント抑止」は manual-test で確認済み。`router.invalidate()` の filter 化は 30+ 箇所の機械的置換 + ヘルパー新設という別スコープのリファクタリングであり、本 PR で同梱すると差分が肥大化しレビュー粒度が崩れる。新 ADR で経緯記録 + 別 Issue 起票して継続課題化
- **W-P-001 + W-P-005 を loader 統合で同時解消**: `beforeLoad` を削除し、`loadAppShellChrome` の handler 冒頭で redirect 判定を行う。SPA 2 本目以降の navigation で RPC ゼロ、`pathname` 引数撤廃、ADR-007 の trade-off を改善
- **W-P-002 / W-P-003 / W-A-001 を別 Issue に**: errorComponent の細粒度化、Sidebar payload 削減、セッション失効時の stale AppShell 対策はすべて「AppShell 持続化の体感改善」フォローアップとして 1 つの後続 Issue にまとめる
