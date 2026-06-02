# テスト実行サマリー — Issue #423

**実行日:** 2026-06-03
**テストソース:** `.issue/423/testing.md`
**サーバー:** http://localhost:8787（`pnpm build && pnpm start` = wrangler dev、ローカル D1）
**ユーザー:** verify423@example.com（session token 直挿し + `__Host-session` cookie 注入）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | SavedView 複製の楽観追加 | 正常系 | PASS | 再検証で確認（初回は seed 不備で /views 500 → 修正後 PASS） |
| TC-002 | tag のリネーム / 削除の即時反映 | 正常系 | PASS | rename 即時 + delete 即時除去 + 件数 3→2 即減 |
| TC-003 | directory インライン rename の即時表示 | 正常系 | PASS | Enter 直後に新名表示・旧名フリッカーなし |
| TC-004 | directory 削除は楽観化せず gate（軽確認） | 正常系 | PASS | 削除ダイアログの操作中フィードバック維持 |

**合計:** 4 件（PASS: 4 / FAIL: 0）

## 楽観的即時反映の観測結果

- **複製（TC-001）:** click 直後に「検証ビューA のコピー」が A/B の間に即時出現、件数 2→3 即更新。連続複製も即時反映。収束後も二重表示・key 崩れなし。
- **tag rename（TC-002）:** 保存直後に `#検証タグX2` 表示 + 編集モード即 close。
- **tag delete（TC-002）:** 確定直後に該当行が即時消去 + 件数表示が即時に減少（3→2）。
- **directory rename（TC-003）:** Enter 確定直後に新名表示、input unmount〜invalidate 完了の旧名フラッシュなし。
- **directory move/delete（TC-004）:** 楽観化せず、従来どおり操作中フィードバック（pending/gate）を維持（設計どおり）。

いずれも再読込で二重表示・崩れなく baseline に収束することを確認。

## 初回 TC-001 失敗の原因（解消済み）

初回の `/views` 500（`SystemError: Stored saved view ... violates invariants` / `Keyword cannot be empty`）は、**検証用 seed データの `query_json` に `keyword:""`（空文字）を入れたことが原因**。ドメイン invariant は keyword を null（フィルタなし）か非空文字のみ許容する。seed を `keyword:null` に修正後、`/views` は正常描画し TC-001 PASS。**#423 の実装変更とは無関係**（seed データ起因のテスト環境問題）。

## 失敗時 rollback の担保

mutation 失敗時の自動 rollback + エラー表示は、ローカル単一オリジンでは mutation が成功してしまい観測できないため、component テスト（happy-dom + `serverFnMock`）で担保：
- `SavedViewsList.test.tsx`（複製の追加 / reject 復帰 / 二重キー防御）
- `TagList.test.tsx`（rename / delete の即時反映 / reject 復帰）
- `DirectoryTree.test.tsx`（rename commit 配線 / reject 復帰）
