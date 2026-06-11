# TC-C: Issue #636 失敗の局所化・リトライ回復・redirect/notFound 確認

- 実行日: 2026-06-11
- 環境: dev サーバー http://localhost:3000（branch issue/635/loading-ux-assets-pending、HMR 有効）
- セッション: agent-browser `verify-tc-c`（認証あり）/ `verify-tc-c-noauth`（cookie なし）
- 認証: `cookies set __Host-session dev-admin-session-token --url http://localhost:3000 --secure --path /`

## 結果サマリ

| # | テスト | 手順 | 結果 | スクリーンショット |
|---|--------|------|------|------------------|
| 1 | 失敗の局所化（DoD 2） | `loadAllTags`（app/components/note/loaders.ts）に `throw new Error("tc-c test")` を仕込みホームをリロード | PASS | tc-c/01-tags-error-localized.png |
| 2 | リトライ回復 | throw を外し HMR 反映後、エラーパネルの「再読み込み」をクリック | PASS | tc-c/02-tags-recovered.png |
| 3 | シェル/ページ局所化 | `loadDirectoryTree`（app/components/layout/action.ts）に一時 throw → ホームをリロード | PASS | tc-c/03-sidebar-error-localized.png |
| 4 | 未認証 redirect | cookie なしセッションで `/`・`/settings/profile`・`/admin/users` へ直接アクセス | PASS | tc-c/04-noauth-admin.png, tc-c/05-noauth-settings.png |
| 5 | notFound | `/notes/00000000-0000-0000-0000-000000000000` へアクセス | PASS | tc-c/06-notfound-note.png |

## 詳細

### 1. 失敗の局所化（loadAllTags throw）

- フィルタ境界のみ `role=alert` のエラーパネルに置換（「フィルタを読み込めませんでした。」＋「再読み込み」ボタン）。
- 他境界は正常: ノート一覧（「11 件のノート」＋全カード描画）、サイドバー（ディレクトリツリー treeitem 群・保存ビュー・管理リンク）、ツールバー（表示形式タブ・選択モード・ビューとして保存・新規作成）すべて正常描画。汎用文言で内部情報の漏えいなし。

### 2. リトライ回復

- throw 除去 → HMR 反映後、「再読み込み」クリック1回目はサーバー側モジュールの反映前で alert 残存、数秒待って2回目のクリックでタグチップ群（#design / #verify635タグ / #アイデア / #日記＋期間・公開状態・内部リンク参照）に回復。ページ全体のリロードは不要だった。

### 3. シェル/ページ局所化（loadDirectoryTree throw）

- サイドバーのディレクトリセクションのみ `role=alert`（「ディレクトリを読み込めませんでした。」＋再読み込みボタン）。サイドバー内の「管理」リンク群・ユーザーメニューは正常。
- ホーム本体（タグチップ・件数・ノート一覧・ツールバー）はすべて正常描画。
- throw 除去後、サイドバー側の「再読み込み」クリックでディレクトリツリーが回復することも確認。

### 4. 未認証アクセス

- `/`: 公開ランディングページを表示（仕様どおり。`/` は未認証にもランディングを提供する唯一の認証系ルート — app/routes/_app/route.tsx のコメント参照）。
- `/settings/profile`: `/` へリダイレクト（`loadAppShell` の `throw redirect({ to: "/" })`、コードどおりの fail-safe）。スケルトンのまま固まらない。
- `/admin/users`: 全画面の「アクセスできません / 権限がありません」エラー表示（境界内エラーではなく errorComponent）。スケルトン残留なし。
- 注: testing.md は「ログインへリダイレクト」と記載しているが、実装上の従来挙動は `/`（ランディング）への redirect ＋ admin は forbidden 全画面表示。#636 による挙動変化ではないため PASS 扱い。

### 5. notFound（存在しない noteId）

- `/notes/00000000-0000-0000-0000-000000000000` → main 領域に全画面 alert「ノートが見つかりません / 削除されているか、アクセス権限がありません。」。`aria-busy` / `role=status` は 0 個でスケルトン固まりなし。シェル（ヘッダー・サイドバー）は正常。

## 後始末

- 一時 throw は両ファイルとも除去済み。`grep -rn "tc-c test" app/` → 0 件。
- `git diff --stat` の app/ 配下に残る差分（41 ファイル）は、本セッション開始前から存在する #636 実装そのもの（未コミットの作業ツリー）。本テストで触れた `app/components/note/loaders.ts` / `app/components/layout/action.ts` は diff なし（完全に復元済み）。

## スクリーンショット

`.issue/636/manual-test/screenshots/tc-c/` 配下、計 6 枚。
