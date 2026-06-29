# TC-3: タッチターゲット床の維持 (AC-4)

結果: PASS

対象: 非公開ノート詳細 390px。各 icon-only ピル（button / a）の `getBoundingClientRect()` を計測。

| ピル (aria-label) | tag | width | height | 44px 床 |
| --- | --- | --- | --- | --- |
| 編集 | A | 44 | 44 | PASS |
| 公開状態: 非公開（ラベル付き） | BUTTON | 104 | 44 | PASS |
| 移動 | BUTTON | 44 | 44 | PASS |
| URLをコピー | BUTTON | 44 | 44 | PASS |
| エクスポート | A | 44 | 44 | PASS |
| その他の操作 | BUTTON | 44 | 44 | PASS |

備考:
- グリフが 18px に縮小されても各 icon-only ピルは 44×44px を維持（`min-h-[44px]` / `min-w-[44px]` 床が有効）。
- ラベル付き「公開状態」ピルは横 104px だが高さ 44px 維持。
