# ブラウザ検証レポート — Issue #496

**Issue**: #496 — refactor: loader が domain repository を直接叩いている箇所を読み取り usecase 経由に整理する
**実行日時**: 2026-06-06
**テストソース**: .issue/496/testing.md
**サーバー**: http://127.0.0.1:8787（`pnpm build && pnpm start`）

## 目的

publication state の読み取りを `getPublicationState` usecase 経由に整理したリファクタ（挙動変更ゼロ）について、ノート詳細ページの公開状態表示・公開日時・共有リンク一覧・trashed フォールバックが従来どおりであることを確認する。

## 結果: 全 4 ケース PASS

### TC-001: private ノート詳細の公開状態表示 — PASS

- 対象: `/notes/01938f00-...b071`（Weekly planning ノート, visibility=private, published_at=null）
- 確認: 公開状態ピルが `公開状態: 非公開` を表示。公開日（公開日 dt）は表示されない。
- スナップショット抜粋:
  ```
  button "公開状態: 非公開" [ref=e38]
    StaticText "公開状態:"
    StaticText "非公開"
  ```

### TC-002: public ノート詳細の visibility・公開日時 — PASS

- 対象: `/notes/01938f00-...b079`（公開デザインガイド, visibility=public, published_at=2026-05-09T12:00:00.000Z）
- 確認: 公開状態ピルが `公開状態: 公開`。メタパネルの `公開日` が `2026年5月9日 12:00` を表示（= DTO の `publishedAt` ISO 文字列が変換なしで従来どおり表示）。
- スナップショット抜粋:
  ```
  button "公開状態: 公開" [ref=e39]
    StaticText "公開"
  term "公開日"
    StaticText "2026年5月9日 12:00"
  ```

### TC-003: 共有リンク一覧の表示 — PASS

- 公開設定ダイアログを開き、`公開ステータス` ラジオが `公開` checked=true（getPublicationState の値と一致）。
- `限定公開リンク` セクションにシードした共有リンクが `有効` 状態で一覧表示:
  ```
  list
    listitem
      code → "http://localhost:8787/share/by-id/01960496-...a1"
      StaticText "有効"
  ```
- `listShareLinks` 経路（loader 内の逐次先行呼び出し）が正常に動作していることを確認。

### TC-004: trashed ノート詳細のフォールバック表示 — PASS

- 対象: `/notes/01960496-...c1`（Issue496 ゴミ箱ノート, status=trashed）
- 確認: ページがエラー境界に落ちず正常レンダリング。ゴミ箱インジケータと「ゴミ箱を開く」リンクを表示。公開状態コントロールは抑制（trashed の正規挙動）。
- `NoteErrorCode.Trashed` が `NoteDetail.tsx` の catch で吸収され `{ visibility: "private", publishedAt: null, links: [] }` 相当のフォールバックになることを確認（変更前と同一挙動）。

## 結論

publication state 読み取りを usecase 経由に置換しても、ノート詳細ページの公開状態・公開日・共有リンク・trashed フォールバックの各表示は従来どおりで、挙動変更ゼロを確認した。

## 起票した Issue

なし（全 PASS）。
