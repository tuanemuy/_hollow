# EDGE-001: 複数アップロードの部分失敗

**結果**: PASS（実機確認できた範囲。サーバー側部分失敗の静的再現は不能 — ユニットテストでカバー済みを確認）

**セッション**: verify-edge-1 / **日時**: 2026-06-13

## 実行ログ

| # | 操作 | 結果 |
|---|---|---|
| 1 | `__Host-session` クッキー注入 → `/#upload` を開く | モーダル（select ビュー）表示 |
| 2 | `test-note-1.md` ＋ `invalid-binary.bin` を混在送信 | `.bin` はクライアント検証（`validateUploadFiles` の `detectKind`）で unsupported として弾かれ、有効な `.md` 1 件のみ送信。`queued` ビューに「1 件中 1 件をキューに追加しました」表示。ヘッダーバッジ「未処理 1 件」 |
| 3 | 「続けてアップロード」 | select に戻り、前回の検証エラー表示は残らない（仕様どおり） |

## 所見

- 混在送信時の挙動は「全体ブロック」ではなく「有効分のみ送信」。`UploadDialog.tsx` `submitFiles` のコードと一致（`result.accepted` のみアップロード、全滅時は select に留まりバナー表示）。
- `queued` ビューの total / succeeded はクライアント検証通過分のみをカウントするため、client 側で弾かれたファイルは「失敗」リストに出ない（`failedNames` はサーバー失敗専用）。
- **サーバー部分失敗の静的再現は困難**（拡張子不正・サイズ超過とも client 検証で止まるため）。「N 件中 M 件をキューに追加しました（K 件失敗）」＋失敗ファイル名リストの表示は、`app/components/ingestion/__tests__/UploadDialog.test.tsx` の「renders the aggregate queued view with failed names on multi-file partial failure」（`"2 件中 1 件をキューに追加しました（1 件失敗）"` を検証）でカバー済み。当該テスト単体実行で **passed** を確認。
