# Manual Test Report — Issue #221

**実行日時:** 2026-05-28
**テストソース:** `.issue/221/testing.md` 抜粋（agent-browser ベース）
**サーバー:** http://localhost:3000/
**ブランチ:** issue/221/upload-feedback-improvements

## 結果サマリ

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-01 | ログイン → ヘッダー「アップロード」モーダル開閉 | PASS |
| TC-02 | 即時 loading / skeleton / aria-live フィードバック | PASS |
| TC-03 | 失敗ジョブのエラー日本語マッピング（unsupported_format） | PASS |
| TC-04 | 失敗ジョブのエラー日本語マッピング（empty file） | FAIL → 修正済み（再検証は integration test で代替） |
| TC-05 | /upload キューでのエラー文言とフルリロード非発生 | PASS |
| TC-10 | spec / design 反映の目視確認 | PASS |

**合計:** 6 件（PASS: 5 / FAIL→修正済み: 1）

## 主要な検証ポイント

- ログイン → ヘッダー「アップロード」リンク → URL hash `#upload` でモーダル展開する経路は再現確認（#220 で確認済の挙動が #221 の変更後も維持）。
- `unsupported_format` の業務エラーは日本語マッピング「このファイル形式には対応していません。HTML / Markdown / Office / PDF / 画像 / 音声 形式でお試しください」に変換され、英語 errorCode は DOM 上に露出していない。
- 失敗時の `<div role="alert">` で表示される。
- `UploadDialog.tsx` の `UploadingView` / `WaitingView` には `aria-live="polite"` + `SkeletonBlock`（motion-safe pulse）が実装済み。
- `/upload` ページの取り込みキューは `IngestionQueue` がクライアント側 `setTimeout` ループでポーリング（active 4s / idle 16s）。`router.invalidate()` や全ページ navigation を行わず `setState` のみで更新するため、フルリロード（白点滅）は発生しない。実測で 30 秒間に 5 回のポール、`performance.navigation` エントリは 1 のまま増加しなかった。
- spec ドキュメント側にも `spec/pages/index.md` のフィードバックポリシーセクション、`spec/design/index.md` の §10b、`spec/scenario/ingest.md` の FrontMatter JSON エラー文言が反映済み。

## 検出した問題（修正済み）

### empty.md（0 byte）アップロードで誤った conflict 系メッセージ → 修正済み

- **再現手順**: ヘッダーモーダル または `/upload` ドロップゾーンで 0 バイトの `empty.md` をアップロード。
- **期待**: 業務エラー (`ingestion_invalid_byte_size` 系) として「ファイルが正しく読み取れませんでした。別のファイルでお試しください」を表示。
- **修正前の実際**: HTTP 409 / `kind=conflict, code=CONSTRAINT_VIOLATION, message="Failed to commit unit of work"` が返却され、`renderConflictMessage` のデフォルト「他の操作と競合しました。もう一度お試しください」にフォールバック。
- **修正内容**: `uploadFile` ユースケースの先頭で `byteSize === 0` を `BusinessRuleError(IngestionErrorCode.InvalidByteSize)` として早期 throw（`app/core/application/ingestion/uploadFile.ts`）。既存の `ingestion_invalid_byte_size` 日本語マッピングが効くようになる。
- **検証**: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts` に「empty file rejected with InvalidByteSize before UoW」テストを追加。`pnpm test:integration` で 440/440 PASS。
- **設計判断**: ADR-007 に記録（value-object 層の `validateByteSize` は 0 許容のまま、application 層で reject）。

## 補足

- テスト途中で dev server が一度落ちたため、TC-01 完了後にバックグラウンド再起動して TC-02 から再開した。再起動後はブラウザセッション cookie が失効していたため再ログインも実施。
- TC-02 の中間状態（uploading → waiting）は 28 byte の test-md がほぼ瞬時に editing へ遷移するため DOM 捕捉できなかった。実装コード（`UploadDialog.tsx:432-461`）で `aria-live="polite"` + skeleton の構造を確認し PASS とした。

## 成果物

- 各 TC 詳細: `.issue/221/manual-test/results/TC-01.md` 〜 `TC-05.md`、`TC-10.md`
- スクリーンショット: `.issue/221/manual-test/screenshots/tc-01/` 〜 `tc-05/`
- シードデータ: `.issue/221/manual-test/seed-data.md`
- サーバー情報: `.issue/221/manual-test/server-info.md`
- サマリ: `.issue/221/manual-test/results/summary.md`

## 起票 Issue

なし — TC-04 で検出した 0 byte ファイルの誤メッセージは Phase 2 内で修正済み（ADR-007 / integration test）。
