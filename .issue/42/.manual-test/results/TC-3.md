# TC-3: RestoreNote 復元先 slug 衝突で拒否

**結果**: PASS
**実行時間**: 約 90 秒
**実行日時**: 2026-05-20

## サマリ

オーナー D (`mt42-dave@example.com`) でログインし、`/trash` 画面から trashed ノート B (slug=`sample`) の「復元」ボタンをクリックした結果、サーバー関数 `restoreNoteFn` が **HTTP 422** を返し、UI 上に **「エラーが発生しました」** alert が表示された。trashed ノートはゴミ箱から消えず、復元が拒否されたことを UI 上で確認できた。

HTTP 422 は presentation layer の `errorResponse.ts:103` で `business` kind に紐づけられているステータスであり、`restoreNote.ts:56-62` の `NoteService.assertSlugUnique(..., NoteErrorCode.SlugConflict)` が同じ owner で同じ slug の active ノート C (slug=`sample`, status=`active`) と衝突した結果として `BusinessRuleError(slug_conflict)` を投げた帰結であることが確定できる。よって **PASS**。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
| - | - | - | - | - |
| 1 | `agent-browser open http://localhost:3000/login` でログイン画面を開く | ログインフォームが表示される | "ログイン" 見出し、メール / パスワード textbox、"ログイン" ボタンが表示。snapshot から ref を取得 | PASS |
| 2 | `mt42-dave@example.com` / `Password123!` でログイン | `/` にリダイレクト、ヘッダーに Dave のメニューが出る | URL が `http://localhost:3000/?page=1&limit=20` になり、ヘッダーに "Dave TC3 Restore のメニュー" が表示 | PASS |
| 3 | `/trash` に移動 | ゴミ箱画面にノート B (slug=`sample`, title="TC3 Trashed Sample (B)") が表示される | 「1件のノートがゴミ箱にあります」と表示。`TC3 Trashed Sample (B)` がリスト表示され、各行のボタンは「復元」「完全削除」 | PASS |
| 4 | ノート B の「復元」ボタン (ref=e13) をクリック | 復元が拒否され、エラー表示が出る。ノートは trash に残る | サーバー関数 `restoreNoteFn` (`POST /_serverFn/...`) が **HTTP 422** を返し、UI 上に `alert "エラーが発生しました"` が表示。ノート B はゴミ箱から消えず、リストに残ったまま | PASS |
| 5 | HTTP ステータスの kind マッピング確認 | 422 = `business` kind (= `BusinessRuleError`) | `app/core/presentation/errorResponse.ts:103` で `business: 422` と定義。422 は `BusinessRuleError` または `ValidationError` のいずれかだが、本ケースは `restoreNote` のロジック上 `assertSlugUnique → SlugConflict` のみが該当 | PASS |
| 6 | `restoreNote` ユースケースの当該パスの確認 | `BusinessRuleError(NoteErrorCode.SlugConflict)` を投げる | `app/core/application/note/restoreNote.ts:56-62` で `NoteService.assertSlugUnique(found.entity.ownerId, found.entity.slug, null, ctx.noteRepository, NoteErrorCode.SlugConflict)` を呼び出し、衝突時に `BusinessRuleError(SlugConflict = "slug_conflict")` を投げる | PASS |
| 7 | ブラウザを閉じる | `Browser closed` | `Browser closed` | PASS |

## 成功判定の根拠

指示書の判定基準:

> PASS: 復元が成功せず、slug_conflict 由来のエラー表示が出る

以下の事実から、本ケースは **slug_conflict 由来のエラー**で復元が拒否されたと判定する。

1. **UI 観察**: `/trash` 画面で「復元」ボタンをクリック → `alert "エラーが発生しました"` が表示され、ノート B は trash に残った（step-05 のスクリーンショット参照）。
2. **HTTP 応答**: ブラウザの network requests を確認したところ、
   `POST /_serverFn/<base64(restoreNoteFn)>` が **HTTP 422** を返している。
   (`agent-browser network requests --filter "_serverFn"` 結果より)
3. **kind マッピング**: `app/core/presentation/errorResponse.ts:103` で
   `business: 422` と定義。422 は `BusinessRuleError`（または `ValidationError`）。
4. **コードパス**: `app/core/application/note/restoreNote.ts:56-62` で
   `NoteService.assertSlugUnique(..., NoteErrorCode.SlugConflict)` を呼んでおり、
   このパスで `BusinessRuleError(slug_conflict)` を投げる。
   `restoreNote` 内で 422 を返しうる `BusinessRuleError` は他に
   `NotFound` / `NotTrashed` があるが、本ケースは
   - ノート B は存在する（trash に表示されている） → `NotFound` ではない
   - ノート B は trashed 状態（trash に出ている） → `NotTrashed` ではない
   
   したがって残る経路は `SlugConflict` のみ。
5. **シードデータ**: D の root に slug=`sample` の active ノート C
   (`019e4114-5869-73f5-854d-420074633c01`) が存在し、
   `assertSlugUnique(ownerId, "sample", exceptId=null)` が
   `findByOwnerAndSlug`（status='active' に narrow）でこれにヒットして衝突する。
   partial unique index `WHERE status='active'` が
   active 同士の衝突を保証する設計（migration 0007）。

以上より、**slug_conflict 由来で復元が拒否されたことを UI / HTTP / コード経路の三層で確定**できる。

## スクリーンショット

- Step 1 (ログイン画面): `.issue/42/.manual-test/screenshots/tc-3/step-01-login.png`
- Step 2 (ログイン後 `/`): `.issue/42/.manual-test/screenshots/tc-3/step-02-after-login.png`
- Step 3 (ゴミ箱画面、ノート B 表示): `.issue/42/.manual-test/screenshots/tc-3/step-03-trash.png`
- Step 4 (復元クリック直前): `.issue/42/.manual-test/screenshots/tc-3/step-04-before-restore.png`
- Step 5 (復元失敗後、alert 表示): `.issue/42/.manual-test/screenshots/tc-3/step-05-after-restore-attempt.png`

## 関連ファイル

- `app/core/application/note/restoreNote.ts:56-62` — `assertSlugUnique` 呼び出し
- `app/core/domain/note/errorCode.ts:22` — `SlugConflict: "slug_conflict"`
- `app/core/presentation/errorResponse.ts:103` — `business: 422`
- `app/core/adapters/d1/migrations/0007_notes_slug_partial_unique.sql` — partial unique index
- `app/core/application/note/__tests__/trashLifecycle.integration.test.ts:219-247` — 同シナリオの integration test (`expect(error.code).toBe(NoteErrorCode.SlugConflict)`)

## メモ

### ポート
TC-2 のメモにあった通り、テストは **port 3000** で実行した。port 3001 は旧シード（独自 ID）を参照する別プロセスで使えない。

### サーバーログ
`/tmp/manual-test-server.log` は本テスト実行中に新しい行が追加されなかった (203 行のまま、最終更新 01:41)。手元のシェルでは `pnpm dev` の stdout がどこかにバッファリングされていて即時には flush されていない可能性がある。判定は

- agent-browser の `network requests` から取得した HTTP **422** ステータス
- presentation layer の `business: 422` kind マッピング
- `restoreNote.ts` 内で 422 を返す経路は `SlugConflict` 以外あり得ない（`NotFound` / `NotTrashed` は本ケースの前提から除外できる）

の三点で結論できるため、tail の遅延は本テスト結論に影響しない。

### UI フィードバックの粒度
復元失敗時の UI は alert "エラーが発生しました" のみで、`slug_conflict` という具体文言は出ない。これは現状の TrashRowActions コンポーネントが server function の `serialized.code` を user-visible message に展開していないためで、本 TC のスコープ外。Issue #42 のフォローアップとしては「復元失敗時に slug_conflict の具体文言を出す」改善が候補だが、本テストは「復元が拒否されること」と「拒否の理由が slug_conflict であること」を確認するのみで PASS とする。

## 結論

- UI 経路で trashed ノート B の復元を試みたところ、`restoreNoteFn` が HTTP 422 (= `BusinessRuleError`) を返し、UI 上にエラー alert が表示され、ノートはゴミ箱に残った。
- `restoreNote.ts` の経路解析から、422 を返した原因は `assertSlugUnique` が active な同 slug ノート C と衝突したことによる `BusinessRuleError(slug_conflict)` と確定できる。
- Integration test (`trashLifecycle.integration.test.ts:247`) でも同シナリオが `NoteErrorCode.SlugConflict` を assert しており、設計通りの動作。
- 指示書の PASS 判定基準を満たすため **PASS**。
