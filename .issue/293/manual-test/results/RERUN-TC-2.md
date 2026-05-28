# RERUN-TC-2: 連続 SPA 遷移で AppShell 維持

**結果:** PASS
**実行日:** 2026-05-28
**セッション:** verify-rerun-tc-2
**修正対象:** `app/routes/_app/route.tsx` の `beforeLoad` を `createServerFn` (`resolveAppAuth`) でラップ

## 目的

ログイン後、Sidebar / Header の `<Link>` を経由した連続 SPA 遷移で、AppShell (Header / Sidebar) が維持され続けることを検証する。

## 実行ログ

| Step | 操作 | URL | エラー画面 | AppShell | スクリーンショット |
|---|---|---|---|---|---|
| 1 | `/login` でログイン → `/` | `/?page=1&limit=20` | なし | banner + complementary 描画、ノートリスト表示 | `screenshots/rerun-tc-2/step-1-home.png` |
| 2 | Sidebar 「タグ」リンク (`ref=e29`) クリック | `/tags` | なし (`false`) | banner / complementary / search input すべて維持 | `screenshots/rerun-tc-2/step-2-tags.png` |
| 3 | Sidebar 「ゴミ箱」リンク (`ref=e23`) クリック | `/trash` | なし (`false`) | AppShell 維持 (snapshot で banner + complementary + ディレクトリツリー描画) | `screenshots/rerun-tc-2/step-3-trash.png` |
| 4 | Header 「新規作成」リンク (`ref=e2`) クリック | `/notes/new` | なし (`false`) | AppShell 維持 (banner + complementary 描画) | `screenshots/rerun-tc-2/step-4-notes-new.png` |

## 検証ポイント

- 全 SPA 遷移で `document.body.innerText.includes('エラーが発生しました')` が `false`
- 各遷移後の snapshot に `- banner` と `- complementary` (Sidebar) が表示されている
- URL のみが変わり、AppShell の骨格と Sidebar のディレクトリツリーが各画面で繰り返し描画される

## 修正の効果

前回 (TC-2 失敗時) は最初の SPA 遷移時点で `beforeLoad` がクライアントで失敗し `_app.errorComponent` に切り替わっていたため、複数遷移を試すまでもなく不可だった。

今回は Sidebar / Header の `<Link>` を経由した 3 連続の SPA 遷移すべてが成功し、AppShell が一貫して保たれることを確認した。
