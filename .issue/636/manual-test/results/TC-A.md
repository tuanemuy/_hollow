# TC-A: Issue #636 ホーム Suspense 分割 検証結果

- 実行日: 2026-06-11
- 環境: dev サーバー http://localhost:3000（commit c17a511f / branch issue/635/loading-ux-assets-pending）
- セッション: agent-browser `verify-tc-a`
- 認証: `__Host-session=dev-admin-session-token` を `cookies set --url http://localhost:3000 --secure --path /` で注入（有効。ただしブラウザ側でナビゲーション後に消えることがあり、都度再設定した）

## 結果サマリ

| # | 確認項目 | 結果 | 備考 |
|---|---------|------|------|
| 1 | ホーム初回ロード（シェル＋全セクション最終描画） | PASS | ヘッダー・サイドバー（ツリー4項目・保存ビュー/管理リンク）・h1・ツールバー・タグチップ・フィルタ・「11 件のノート」・ノート一覧11件すべて描画 |
| 2 | スケルトン捕捉（任意） | 未捕捉 | localhost で解決が速すぎ（SSR 全体 66ms / 50KB）。`aria-busy` / `role="status"` 要素は捕捉できず。FAIL ではない |
| 3 | フリッカー観察（検索・タグトグル・ページ送り） | FAIL（ブロッカー） | 検索（native form submit＝フルロード）ではスケルトン巻き戻りなし。しかしタグチップ・タブ等のクライアント操作が一切反応せず観察不能（下記ブロッカー） |
| 4 | ミューテーション後のサイドバー観察 | SKIP（ブロッカー） | ページ非インタラクティブのためノート作成/削除を実行できず |
| 5 | 選択モード → BulkActionBar 表示 | FAIL（ブロッカー） | 「選択モード」ボタンが trusted click / JS click いずれにも無反応。チェックボックス・BulkActionBar 非表示のまま |

## ブロッカー詳細: クライアントハイドレーションがシェルで停止し、ページ全体が非インタラクティブ

### 症状

- ホーム `/` は SSR HTML として完全に描画されるが、クライアント側の React ハイドレーションがシェル（`BODY > BUTTON.fixed / DIV.grid / ASIDE / MAIN / DIV`）までで停止する。
- React fiber が付与された DOM 要素は **35 / 1230**（head + シェルコンテナのみ）。20 秒以上待っても増えない。
- その結果、Suspense 境界内のすべての UI が無反応:
  - タグチップ `#design` クリック → `aria-pressed="false"` のまま、URL 変化なし（Playwright trusted click・`element.click()` 双方）
  - 「選択モード」ボタン → 無反応、checkbox 0 個、BulkActionBar 出ず
  - 表示形式タブ「タイル」クリック → `aria-selected` は「リスト」のまま
- 検索ボックスだけは機能した（`?q=...` へ遷移）が、これは native form submit によるフルページ遷移であり、ハイドレーション不要のため。

### 切り分け

- console error: なし（TanStack Router の code-split warning のみ）。ネットワーク失敗: なし（全 200/304）。
- ルーター状態は正常: `__TSR_ROUTER__.state = { status: "idle", matches: 全て success }`。データ取得は完了しているのに、コンポーネントレベルの Suspense 境界がクライアントで解決されない状態。
- ホームだけでなく `/tags`（fiber 36/1221）、`/login`（新規セッション、fiber 58/980）でも同様 → #636 のホーム分割固有ではなくアプリ全体（少なくとも dev サーバー上）の事象。
- SSR ストリーム自体は curl で 66ms / 50081 bytes で正常完結。

### 影響

testing.md 確認項目5（フリッカー）・既存機能影響確認（選択操作・pending 表示）は、クライアント操作が成立しないため検証不能。表示（SSR）のリグレッションはなし。

### 推奨

- 通常ブラウザ（headed Chrome）での再現確認と、deferred loader promise がクライアントで resolve されない原因（TanStack Start RSC streaming + Suspense 分割の組合せ、または dev サーバーの長時間稼働による状態劣化の可能性）の調査。
- まず dev サーバー再起動＋`pnpm build && pnpm start`（本番ビルド）での再検証を推奨。再現する場合は Issue 起票が必要。

## 観察メモ（参考）

- 検索 `?q=テスト` / `?q=TC556` はいずれも「0 件のノート」＋空状態表示。タイトルに合致するノート（テスト用ノートA 等）が存在するのにヒットしない。シードデータが FTS インデックス未同期の可能性（本TCのスコープ外、参考情報）。
- 検索遷移中・遷移後にシェル/サイドバーがスケルトンへ巻き戻る挙動は観察されなかった（連続 eval サンプリングで `aria-busy/role=status` 常に 0）。

## スクリーンショット

- `.issue/636/manual-test/screenshots/tc-a/01-home-initial.png` — ホーム初回ロード（全セクション描画）
- `.issue/636/manual-test/screenshots/tc-a/02-reload-immediate.png` — リロード直後（スケルトン未捕捉）
- `.issue/636/manual-test/screenshots/tc-a/03-search.png` — 検索 `テスト`（0件・空状態）
- `.issue/636/manual-test/screenshots/tc-a/03b-search-tc556.png` — 検索 `TC556`（0件）
- `.issue/636/manual-test/screenshots/tc-a/04-tag-filter-on.png` — タグチップクリック後（無反応のまま）
- `.issue/636/manual-test/screenshots/tc-a/05-home-final-state.png` — 最終状態
