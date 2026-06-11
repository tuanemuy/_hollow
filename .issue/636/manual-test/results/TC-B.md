# TC-B: Issue #636 各画面の Suspense 分割後リグレッション確認

- 実行日: 2026-06-11
- 環境: dev サーバー http://localhost:3000（branch issue/635/loading-ux-assets-pending）
- セッション: agent-browser `verify-tc-b`
- 認証: `cookies set __Host-session dev-admin-session-token --url http://localhost:3000 --secure --path /`（name/value をオプションより先に置く必要あり。オプション先行だと "Done" 表示でも未設定になる）
- 確認観点: (a) エラーなく最終描画 (b) 静的見出し＋データ領域の整合 (c) console 重大エラーなし

## 結果サマリ

| # | 画面 | ロード方法 | 結果 | スクリーンショット |
|---|------|-----------|------|------------------|
| 1 | ノート詳細（本文・プロパティ・バックリンク） | 直接 URL ＋ JS click による SPA 遷移の両方 | PASS | tc-b/01-note-detail.png |
| 2 | /tags（一覧＋作成フォーム） | クライアントナビ（サイドバー「タグ」クリック） | PASS | tc-b/02-tags.png |
| 3 | /trash | クライアントナビ（サイドバー「ゴミ箱」クリック） | PASS | tc-b/03-trash.png |
| 4 | /views | 直接 URL | PASS | tc-b/04-views.png |
| 5 | /upload | 直接 URL | PASS | tc-b/05-upload.png |
| 6 | /export | 直接 URL | PASS | tc-b/06-export.png |
| 7 | /exports | 直接 URL | PASS（ジョブ 0 件のため詳細はスキップ） | tc-b/07-exports.png |
| 8a | /settings/profile | 直接 URL | PASS | tc-b/08-settings-profile.png |
| 8b | /settings/security | 直接 URL | PASS | tc-b/09-settings-security.png |
| 8c | /settings/prompts | 直接 URL | PASS | tc-b/10-settings-prompts.png |
| 8d | /settings/account-delete | 直接 URL | PASS | tc-b/11-settings-account-delete.png |
| 9a | /admin/users | 直接 URL | PASS（30 アカウント・テーブル描画） | tc-b/12-admin-users.png |
| 9b | /admin/jobs | 直接 URL | PASS（取り込みジョブ 21 件テーブル） | tc-b/13-admin-jobs.png |
| 9c | /admin/prompts | 直接 URL | PASS | tc-b/14-admin-prompts.png |
| 9d | /admin/llm | 直接 URL | PASS | tc-b/15-admin-llm.png |
| 9e | /admin/registration | 直接 URL | PASS | tc-b/16-admin-registration.png |
| 9f | /admin/metrics | 直接 URL | PASS（注記参照） | tc-b/17-admin-metrics.png |
| 9g | /admin/design | 直接 URL | PASS | tc-b/18-admin-design.png |

全画面で静的見出し（h1）とデータ依存領域が揃って最終描画され、スケルトンのまま固まる画面・境界内エラーパネルはなし。

## 注記・観察

- console 重大エラー: 0 件。あるのは TanStack Router の code-split warning（`AppErrorFallback` が route ファイルから export されている件）のみ。全画面共通で従来からの既知警告。
- スケルトン（aria-busy / role=status）: localhost で解決が速く、遷移直後の snapshot/eval では一度も捕捉できず（常に 0 個）。TC-A と同じ事象で FAIL ではない。
- /admin/metrics の「現在の利用量」各値が `—` 表示。`aria-busy` 0 個・2 秒後も不変のため、スケルトン残留ではなく dev 環境でメトリクスが取得不能な場合の最終表示と判断（参考情報）。
- ノート一覧カードのリンクは trusted click（座標クリック）では遷移しない（TC-A のブロッカーと同症状）。ただし本セッションでは React fiber は付与済み（298 要素）で、`element.click()` では SPA 遷移に成功し、サイドバーのリンクは trusted click でも遷移する。ハイドレーション停止ではなく、カードの重なり（stretched link 等）により座標クリックが別要素に当たっている可能性が高い。表示リグレッションではないため TC-B としては PASS 扱い、TC-A の調査時に合わせて確認推奨。
- /exports はジョブ 0 件（「エクスポートジョブはありません。」）のため、ジョブ詳細画面は対象なし。

## スクリーンショット

`.issue/636/manual-test/screenshots/tc-b/` 配下（上表参照、計 18 枚）。
