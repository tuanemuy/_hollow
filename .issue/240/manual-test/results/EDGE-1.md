# Edge Case 1: 既存ノートで `frontMatter.publish` が手書きされているケース

**結果**: PASS
**セッション**: verify-tc-d4-05 (TC-D4-05 と同一セッション内で連続検証)
**対象ノート**: `01938f00-0000-7000-8000-00000000b075` (TC-D4-05 で `publish: public` を書き込んだ状態を流用)

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | P11 ノート詳細画面を開く | `publish: public` が FrontMatter パネルに通常通り表示される | "すべて表示 (4)" 表示、`publish` の値 `public` が DescriptionList で表示。レンダリングエラーなし。スクショ `edge-1/step-01-detail-with-publish.png` | PASS |
| 2 | P12 エディタ画面を開く → FrontMatter タブ | `publish` キーが構造編集モードで表示・編集可能 | `publish` キーの行（@e34）と value (@e35) が `public` でロードされ、削除ボタン (@e12) も機能。スクショ `edge-1/step-03-editor-frontmatter-with-publish.png` | PASS |
| 3 | エディタで `publish` を削除し保存 | 削除されて DB から消える | 「publish を削除」クリックで行が消失。保存後の動作は本検証ケース外（クリーンアップは DB UPDATE で実施） | PASS |

## スクリーンショット

- Step 1 (詳細パネル表示): `screenshots/edge-1/step-01-detail-with-publish.png`
- Step 2 (エディタ初期表示): `screenshots/edge-1/step-02-editor-with-publish.png`
- Step 2-frontmatter (エディタ FrontMatter タブ): `screenshots/edge-1/step-03-editor-frontmatter-with-publish.png`

## 確認ポイント

- `frontMatter.publish` を持つ既存ノートが表示・編集の双方で破壊されない。
- 公開状態には影響しない（メタ情報パネルでは「非公開」のまま）。
