# テスト実行サマリー — Issue #32

**実行日時**: 2026-05-19
**テストソース**: `.issue/32/testing.md`
**サーバー**: http://localhost:3000
**ブランチ**: issue/32/p11-referencing-filter-link

---

## 集計

- 合計: **8 件**（PASS: **8** / FAIL: 0 / SKIP: 0）

## ケース別結果

| TC | テスト名 | 種別 | 結果 | 主要確認 |
|----|---------|------|------|---------|
| TC-01 | P11 から「このノートを参照しているノート一覧を見る」リンクで navigate | 主要受入 | PASS | URL = `/?referencingNoteId=01938f32-...000a&page=1&limit=20`、一覧に B/C のみ |
| TC-02 | P11 経由で chip にノートタイトル表示 | 主要受入 | PASS | chip = `参照中: ターゲット` |
| TC-03 | URL 直叩きで chip タイトル表示（SSR resolver） | 主要受入 | PASS | snapshot 直後から `参照中: ターゲット`（SSR 解決） |
| TC-04 | SavedView 復元時にも chip タイトル | 主要受入 | PASS | `/?viewId=019e3c01-...` 復元後も `参照中: ターゲット` |
| TC-05 | 他人のノート id（owner mismatch） | エッジ | PASS | chip = `参照中: 01938f32`、0 件、Note X タイトル漏出なし |
| TC-06 | 不正な UUID | エッジ | PASS | chip = `参照中: not-a-uu`、200 OK、レイアウト維持 |
| TC-07 | 存在しない有効 UUID | エッジ | PASS | chip = `参照中: 01938f99`、0 件、200 OK |
| TC-08 | chip × ボタンで解除（既存挙動の維持） | 既存挙動 | PASS | URL から `referencingNoteId` 消失、chip 消失、4 件全件に復帰 |

## 失敗・懸念事項

なし。8/8 PASS。Issue #32 主要受入条件（4 件）+ エッジケース（4 件）= すべて期待どおり。

## 補足

- TC-04 の SavedView 保存ボタンは UI で「ビューとして保存」として確認。保存後の viewId は D1 から SELECT で取得。
- TC-05 で X のタイトル「他人のノート X」が snapshot 文字列中に出現しないことを確認（情報漏洩なし）。
- TC-06 (`not-a-uuid-string`) は `noteListSearchSchema` の `z.string().min(1)` を通過 → loader 側の `DomainNoteId.create` で reject → `{ title: null }` フォールバックという想定経路が実機で確認できた。
- 既存機能 retrograde 確認: Note A 詳細画面で NoteMetaPanel のバックリンク 2 件表示、NoteActions 群（編集/公開設定/移動/URLコピー/複製/エクスポート/履歴/削除）すべて表示維持。

## クリーンアップ

- saved_views 1 行（TC-04 で投入、`id=019e3c01-c2f9-7308-bf35-085c67e95c84`）はテスト記録として残置可。削除する場合:
  ```sql
  DELETE FROM saved_views WHERE id='019e3c01-c2f9-7308-bf35-085c67e95c84';
  ```
- agent-browser セッション `verify-issue32` は close 済み。

## 結論

Issue #32（FilterBar chip タイトル化 + P11 詳細からの導線）の実装は手動テスト 8/8 PASS。バグ・retrograde は検出されず、SSR 解決経路・SavedView 往復経路・各種エッジケースのフォールバックがすべて意図どおり動作している。
