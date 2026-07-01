# TC-1: モバイルモックの縮小 (AC-1 / AC-6)

結果: PASS

対象: `file:///Users/hikaru/github.com/tuanemuy/hollow3/spec/design/pages/mobile/P11-note-detail.html`（モバイル専用静的モック、390px viewport）

`.action-toolbar` の computed style と icon-only ピル内 svg 寸法を計測。

| 項目 | 期待値 | 実測値 | 判定 |
| --- | --- | --- | --- |
| gap | 4px (`--space-1`) | 4px | PASS |
| margin-top | 12px (`--space-3`) | 12px | PASS |
| margin-bottom | 16px (`--space-4`) | 16px | PASS |
| icon-only グリフ svg | 18px | 18px (×4) | PASS |
| role | toolbar | toolbar | PASS |
| overflow-x (レール) | auto | auto | PASS |

備考:
- svg 一覧 = [16, 18, 18, 18, 18]。先頭 16px はラベル付きピル内の小型ステータスアイコンで、icon-only グリフではない。icon-only ピルのグリフはすべて 18px。
- 各ピル box は 36x40 / 98x40（静的モックの寸法。実装側の 44px タッチ床は TC-3 で確認）。
- デスクトップモック `spec/design/pages/P11-note-detail.html` は本検証で変更していない。
