# TC-1: DownloadMedia 他人 unlisted + viaShareLinkId 未指定で拒否

**結果**: PASS
**実行時間**: 約 60 秒
**実行日時**: 2026-05-20（UUID v7 再シード後の実行）

## サマリ

閲覧者 B (`mt42-bob@example.com`) で port **3000** にログイン後、オーナー A 所有の unlisted ノートに添付されたメディア (`019e4114-5869-776b-a627-42006d6431a1`) の download URL (`/media/{mediaId}`) に **`viaShareLinkId` 未指定**で直接アクセスしたところ、UI は「メディアを取得できません」エラー画面に置き換わり、dev server ログには **`BusinessRuleError(media_not_viewable)`** が serialized 形式で記録された。

期待通り `assertViewableBy` 段階で拒否され、R2 fetch には到達していない。**PASS**。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
| - | - | - | - | - |
| 1 | `agent-browser open http://localhost:3000/login` でログイン画面表示 | ログインフォームが表示される | `ログイン` 見出し + email/password フォーム表示 | PASS |
| 2 | `mt42-bob@example.com` / `Password123!` を入力し送信 | 認証成功 → ホームへ遷移 | ヘッダーに「Bob TC1 Viewer のメニュー」表示。サイドバーに「すべてのノート」等のライブラリメニューが見える。ログイン成功 | PASS |
| 3 | `http://localhost:3000/media/019e4114-5869-776b-a627-42006d6431a1` を直接開く（`viaShareLinkId` 無し） | `media_not_viewable` 由来のエラー画面 / 403 相当 | エラー画面に「**メディアを取得できません**」「エラーが発生しました」見出しが alert として表示。本文ボタン無し（download にも遷移しない） | PASS |
| 4 | dev server ログ（`/tmp/manual-test-server.log`）で serialized エラー確認 | `kind: 'business'`, `code: 'media_not_viewable'` が出ている | `AppServerError: Media asset 019e4114-5869-776b-a627-42006d6431a1 is not viewable by 019e4114-5869-78b9-9edc-0000000b0001` がログにあり、`serialized: { kind: 'business', code: 'media_not_viewable', retryable: false }` が併記されている | PASS |
| 5 | ブラウザを閉じる | `Browser closed` | `Browser closed` | PASS |

## 成功判定の根拠

指示書の PASS 判定:

> PASS: media download が拒否され、`media_not_viewable` 由来のエラー画面 / 403 相当が表示される

確認内容:

1. **UI 上で download に成功していない**: `/media/{mediaId}` ルートはメディアバイト列を返さず、`メディアを取得できません` エラー画面に置き換わった（step-03 スクリーンショット参照）。
2. **拒否原因が `media_not_viewable`**: dev server ログに以下が記録された。
   ```
   Route error: [AppServerError: Media asset 019e4114-5869-776b-a627-42006d6431a1 is not viewable by 019e4114-5869-78b9-9edc-0000000b0001] {
     serialized: {
       kind: 'business',
       code: 'media_not_viewable',
       message: 'Media asset ... is not viewable by ...',
       retryable: false
     }
   }
   ```
   - `kind: 'business'` → `BusinessRuleError` であることが明確。
   - `code: 'media_not_viewable'` → 期待コード一致。
   - 拒否対象 user id 末尾は `0000000b0001`（user B = Bob）で、別人 (オーナー A) の unlisted ノート添付メディアにアクセスしたという TC-1 のシナリオと一致。
3. **R2 由来の 404 ではない**: ログに R2 4xx の痕跡なし。`assertViewableBy` が R2 fetch より先に走り、`BusinessRuleError(media_not_viewable)` を return しているため、シードで R2 にバイト列を置いていないことは判定に影響しなかった（seed-data.md の想定通り）。
4. **`viaShareLinkId` 無しで拒否**: URL は `/media/019e4114-5869-776b-a627-42006d6431a1`（query 無し）であり、share-link も seed していないため、share-link 経由のアクセス権付与は走らずにそのまま拒否されている。

## スクリーンショット

- Step 1 (login page): `.issue/42/.manual-test/screenshots/tc-1/step-01-login.png`
- Step 2 (after login as Bob): `.issue/42/.manual-test/screenshots/tc-1/step-02-after-login.png`
- Step 3 (media access denied): `.issue/42/.manual-test/screenshots/tc-1/step-03-media-access.png`

## メモ

### ポート

指示書通り `http://localhost:3000/` を使用（TC-2 で確認済みの実稼働ポート）。port 3001 は使っていない。

### エラー画面の UI

`/media/$mediaId` route のエラー画面は非常に最小で、alert role で「メディアを取得できません」見出しと「エラーが発生しました」のみが表示される。ヘッダーやナビゲーションも消えるため、CatchBoundaryImpl がページ全体を置き換えている挙動と思われる。文言が「403」「アクセス権限がありません」のような明示的なものではないが、これは UI 設計上の選択であり、サーバー側のエラー contract (`code: 'media_not_viewable'`) が正しく投げられているため判定には影響しない。

### `assertViewableBy` 優先のエビデンス

シードでは R2 にメディアバイト列を置いていない（`seed-data.md` 第 3 節参照）。もし権限チェックを通過していたら R2 fetch で 404 か別のエラー (`media_storage_not_found` 等) になるはずだが、実際は `media_not_viewable` が return されている。これは downloadMedia usecase 内で **権限チェックが R2 アクセスより前に実行されている**ことを示しており、Issue #42 の修正が期待通り動作していることを裏付ける。

### viewer の user id 整合

ログに記録された viewer id `019e4114-5869-78b9-9edc-0000000b0001` の suffix `0000000b0001` は `seed-data.md` の user B (mt42-bob) の suffix tag と一致。media id `42006d6431a1` も TC-1 media の suffix tag と一致しており、テスト対象が正しいことを ID レベルで確認できた。

## 結論

- `mt42-bob` で他人 (オーナー A) の unlisted ノート添付メディアに `viaShareLinkId` 無しでアクセスした結果、`BusinessRuleError(media_not_viewable)` が return され、UI 上では「メディアを取得できません」エラー画面に置き換わった。
- 権限チェックが R2 fetch より先に走っており、Issue #42 の修正意図通りに動作している。
- 指示書の PASS 判定基準を満たすため **PASS**。
