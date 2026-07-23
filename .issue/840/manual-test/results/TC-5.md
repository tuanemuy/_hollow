# TC-5（確認項目5 / #233 回帰防止, 非img部分のみ）— 装飾要素の remove は従来どおり rollback

- **対応 AC:** AC-5
- **対象ノート:** ノートB（ID `019f799f-27ac-7729-9620-2f4b058d7e48`）を一時的に `<p>a<strong>x</strong>b</p>` に差し替えて検証（検証後に原状復帰）
- **実行日:** 2026-07-19
- **実行環境:** wrangler dev（`http://localhost:8787`）/ agent-browser 0.32.0 セッション `verify-tc-noteb`
- **担当範囲:** 手順1（装飾要素 `<strong>` 削除の rollback）のみ。手順2・手順3 は `<img>` を含むため本担当では SKIP（別途検証）。

## 結果: PASS（手順1）／ 手順2・3 は SKIP（img・担当外）

装飾要素 `<strong>` の削除操作は従来どおり rollback され、`<strong>x</strong>` が復元された。候補C の緩和（空プレースホルダの1文字定着）は構造保持契約を壊していない。

## 実行ログ

| # | 手順 | 操作 | 観測結果 | 判定 |
|---|------|------|----------|------|
| 1a | `<p>a<strong>x</strong>b</p>` をビジュアルで開く | HTMLモードで本文投入・保存→ビジュアル再オープン | `<p contenteditable="true">a<strong>x</strong>b</p>`、`<strong>` 存在 | PASS |
| 1b | `<strong>` を選択して Backspace 削除 | Selection で `<strong>` ノードを選択（選択文字="x"）し Backspace | DOM が `<p contenteditable="true">a<strong>x</strong>b</p>` に**復元**（hasStrong=true, text="axb"）。rollback 発動 | PASS |
| 1c | rollback 後のエディタ操作性（エッジ1） | 段落末尾に `Z` を追加入力 | `<p contenteditable="true">a<strong>x</strong>bZ</p>`。通常テキスト入力は巻き戻らず定着、`<strong>` 保持 | PASS |
| 2 | img クリック選択→文字入力 | — | SKIP（img・担当外） | SKIP |
| 3 | `<p>a<br><img></p>` の `<br>` 削除 | — | SKIP（img・担当外） | SKIP |

## 期待結果との対照

- 手順1: `<strong>x</strong>` は復元される（装飾要素 remove は rollback）→ **達成**
- 追加: rollback 直後もエディタは操作可能で、以降の通常入力（Element remove を含まないバッチ）は定着 → **達成**（エッジケース1も同時確認）

要素子（装飾要素）が残る／消える構造変化を伴う remove では従来どおり rollback が維持されており、#840 の緩和が #233 の構造保持契約を損なっていないことを確認。
</content>
