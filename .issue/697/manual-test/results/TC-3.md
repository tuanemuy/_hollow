# TC-3（AC-3）: 構造編集 ⇔ 生編集（JSON）トグル

**結果**: PASS

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | 下部メタデータ領域で「生編集（JSON）」ボタンを押す | JSON テキストエリアに切替 | JSON textarea 表示、構造編集のキー行（`[aria-label="FrontMatter キー"]`）は非表示、「構造編集に戻す」ボタン出現 | PASS |
| 2 | 現在の FrontMatter が JSON で表示されることを確認 | 現在値が JSON 表示 | textarea 値 = `{\n  "status": "edited",\n  "reviewer": "tc-004-edited",\n  "tc2key": ""\n}` を確認 | PASS |
| 3 | 「構造編集に戻す」ボタンを押す | 構造編集（キー/値の行）に戻る | 構造キー = [status, reviewer, tc2key] が復元、「生編集（JSON）」ボタン再表示、JSON textarea 消失 | PASS |

## 備考
- 双方向トグル（構造編集 → 生編集 JSON → 構造編集）が機能し、内容（status / reviewer / tc2key）が両表現間で保持されることを確認。
- JSON 表現は整形済み（2スペースインデント）で現在の FrontMatter を反映。
