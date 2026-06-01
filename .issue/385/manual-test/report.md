# ブラウザ検証レポート — Issue #385

**Issue:** #385（ノート詳細: 存在しない noteId で notFoundComponent ではなく汎用エラー境界が表示される）
**ブランチ:** issue/385/note-detail-not-found
**実行日時:** 2026-06-02
**テストソース:** `.issue/385/testing.md`
**サーバー:** http://localhost:8787（`pnpm build && pnpm start`）

---

## 結果

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | UUID形式の非存在 noteId で notFound 表示 | 異常系 | PASS |
| TC-002 | 実在ノートが従来どおり表示される | 正常系 | PASS |
| TC-003 | 不正な形式の noteId で notFound 表示 | エッジ | PASS |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 検証内容と確認結果

- 修正前は RSC 内の `throw notFound()` が `notFoundComponent` に伝播せず汎用 `errorComponent`（「エラーが発生しました」）に流れていた。
- 修正後（`NoteDetail` 内で notFound 用 JSX を直接 return）、UUID 形式・不正形式いずれの非存在 noteId でも「ノートが見つかりません」（`role="alert"`）＋「削除されているか、アクセス権限がありません。」が表示され、汎用エラー境界には落ちないことを確認。
- 正常系（実在ノート `019e6e0f-...`）はタイトル「Issue-233 テストノートXYZ」・本文・パンくず・操作ツールバーが従来どおり表示され、回帰なし。

## 起票した Issue

なし（全 PASS）。

## 成果物

- サマリー: `.issue/385/manual-test/results/summary.md`
- TC結果: `.issue/385/manual-test/results/TC-001.md` 〜 `TC-003.md`
- スクリーンショット: `.issue/385/manual-test/screenshots/`（login.png, tc-001.png, tc-002.png, tc-003.png）
- シードデータ: `.issue/385/manual-test/seed-data.md`
- サーバー情報: `.issue/385/manual-test/server-info.md`

## 備考

- 手順書は password 欄 Enter 送信を前提にしていたが、本環境では「ログイン」ボタンの click で正常に submit・遷移した（cross-origin 拒否は発生せず）。
