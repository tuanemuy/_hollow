# Manual Test Summary — Issue #221

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-01 | ログイン → ヘッダー「アップロード」モーダル開閉 | PASS |
| TC-02 | 即時 loading / skeleton / aria-live フィードバック | PASS (※ ファイルが小さいため中間状態の DOM 捕捉不可、コード上は確認) |
| TC-03 | 失敗ジョブのエラー日本語マッピング（unsupported_format） | PASS |
| TC-04 | 失敗ジョブのエラー日本語マッピング（empty file） | **FAIL**（実装バグの可能性） |
| TC-05 | /upload キューでのエラー文言とフルリロード非発生 | PASS |
| TC-10 | spec / design 反映の目視確認 | PASS |

**合計:** 6 件（PASS: 5 / FAIL: 1）

## 検出した問題

### TC-04: 0 バイトファイル投入時の不適切なエラーメッセージ

- **症状**: `empty.md`（0 byte）を投入すると HTTP 409 + `kind=conflict, code=CONSTRAINT_VIOLATION` が返り、UI 上は "他の操作と競合しました。もう一度お試しください" と表示される。
- **期待**: 「ファイルが正しく読み取れませんでした。別のファイルでお試しください」相当の業務エラー文言。
- **影響**: ユーザーが「リトライすれば成功する」と誤解する。実際は同じファイルを再投入しても永続的に失敗。
- **対処案**:
  - A) `app/core/application/ingestion/uploadFile.ts` で `byteSize === 0` を business error として弾く（`IngestionErrorCode.InvalidByteSize` or 専用 code）
  - B) `app/core/presentation/errorDisplay.ts:renderConflictMessage` に `CONSTRAINT_VIOLATION` ケースを追加
- 詳細は `results/TC-04.md` 参照。
