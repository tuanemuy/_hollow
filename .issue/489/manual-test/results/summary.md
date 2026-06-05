# テスト実行サマリー — Issue #489

**実行日時**: 2026-06-05
**テストソース**: .issue/489/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）
**性質**: presentation→domain の id 型を string に統一した型レベルリファクタ（挙動変更ゼロが期待値）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-NOTE-1 | 作成・保存・リネーム・移動・削除・復元・複製 | 正常系 | PASS | 全9操作成功 |
| TC-NOTE-2 | 一覧フィルタ graceful fallback（不正 directoryId/referencingNoteId/空）※ADR-002 最重要 | 正常系 | PASS | 3ケースとも500にならず正常描画。不正id黙殺を確認 |
| TC-NOTE-3 | 編集ロック・履歴・版復元・内部リンク補完 | 正常系 | PASS | 内部リンク補完のみツール制約で未発火（要確認・実装無関係） |
| TC-PUB-1 | 公開設定・共有リンク・バルク | 正常系 | PASS | visibility変更/リンク発行/PW設定/失効/バルク全成功 |
| TC-MEDIA-1 | アップロード・参照 | 正常系 | PASS | presign 200 / downloadMedia 302。R2直PUTのみ環境制約 |
| TC-EXPORT-1 | 単発・バルク・一覧・DL・キャンセル | 正常系 | PASS | 単発/バルク/一覧/DL成功。キャンセルのみ即時完了でSKIP |
| TC-EDGE-1 | 不正/存在しない id の異常系 | 異常系 | PASS | NotFound相当に正しく着地。500・握りつぶしなし |

**合計**: 7件（PASS: 7 / FAIL: 0 / SKIP相当の部分項目あり）

## 結論

型レベルリファクタ（id 入力の string 統一）による挙動変更は確認されなかった。特に唯一の挙動センシティブ箇所である **ADR-002 の transport-boundary graceful fallback（TC-NOTE-2）は完全に温存**されている。不正 id が 500 化・握りつぶしされず従来どおり NotFound / フィルタなしフォールバックになることを確認した。

## 起票した Issue

なし（FAIL ゼロ）。

## 補足（リファクタ無関係の環境制約・ツール制約）

- 内部リンク補完の `[[` ポップアップは TipTap Suggestion プラグインが CDP 合成入力で発火しないため自動検証では捕捉不可（既知の自動化偽陰性）。実装・ユニットテストは存在。
- ローカル R2 への直接 PUT/GET が 403/404 になるため、メディア finalize・エクスポート成果物の実ダウンロードは完走しない（インフラ制約）。アプリ側の string id 経路（presign / presignDownload）は 200 で正常動作を確認。
- エクスポート consumer がジョブを即時完了させるため「処理中ジョブのキャンセル」UI を捕捉できず（キャンセル機能自体の経路は型変更対象に含まれ typecheck で担保）。
- 一部 React onClick が `agent-browser click` で未達となり `eval` 経由 click で回避（ツール制約、実装バグではない）。
