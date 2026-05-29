# ブラウザ検証レポート — Issue #283

**Issue:** #283 — UrlCopyButton: コピー成功時にアイコンを Link2 → Check に切り替える
**実行日:** 2026-05-29
**テストソース:** `.issue/283/testing.md`
**サーバー:** http://localhost:5273（`pnpm dev --port 5273`、検証後に停止）
**ツール:** agent-browser 0.27.0 (HeadlessChrome)

---

## 結果サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | コピー失敗パス＋アイコン非切替＋a11y | PASS |
| TC-002 | コピー成功時のアイコン切替（Link2 → Check → Link2） | PASS |

**合計: 2 件（PASS: 2 / FAIL: 0）**

すべての確認項目が PASS。起票した Issue はなし。

## 検証ポイント

- **コピー成功時に Check 表示**: クリック直後にボタン内 SVG が `lucide-check` へ切り替わることを実測（TC-002）。
- **約2秒後に Link2 へ復帰**: 2.5秒後に SVG が `lucide-link-2` へ戻り、ステータステキストも消えることを実測（TC-002）。
- **aria-live ステータステキスト維持**: 「URL をコピーしました」が従来どおり表示・消去される（TC-002）。
- **アイコンは装飾扱い継続**: icon に `aria-hidden="true"`、status に `role="status"` `aria-live="polite"`、button に `aria-describedby` を実観測（TC-001）。二重読み上げの懸念なし。
- **失敗時は非切替**: コピー失敗時はアイコンが Link2 のまま（Check に切り替わらない）ことを実測（TC-001）。

## 環境上の留意点

HeadlessChrome では `navigator.clipboard.writeText` が権限拒否で reject されるため、素のクリックでは success パスに到達できない。TC-002 では `navigator.clipboard.writeText` を resolve するスタブに差し替えて UI 挙動（アイコン切替）を観測した（クリップボード API 自体ではなく UI 挙動の検証）。コードは未修正。

## シードデータ

`.issue/283/manual-test/seed-data.md` 参照。Issue #298 の seed（ログイン可能ユーザー＋ノート）を再利用。

## 成果物

- テスト結果: `.issue/283/manual-test/results/`
- スクリーンショット: `.issue/283/manual-test/screenshots/`
