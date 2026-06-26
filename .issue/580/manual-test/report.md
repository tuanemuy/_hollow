# ブラウザ検証レポート — Issue #580

**テストソース:** `.issue/580/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`, inline relay 経路 ON）
**実施日:** 2026-06-26

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | タグ統合の非同期化＋determinate 進捗バナー（ハッピーパス。AC-1〜AC-5） | 正常系 | PASS（バグ修正後の再検証） |

**合計:** 1 件（PASS: 1 / FAIL: 0）※初回は実装バグで FAIL → 修正 → 再検証で PASS。

## 検出・修正したバグ（重要）

初回検証で **FAIL**。タグ統合ジョブが永久に `pending` のまま処理されなかった。

- **根本原因:** `tag.merge.requested` のイベントデコーダが `defaultEventDecoderRegistry` に未登録。relay（`eventRelayWorker.processOutboxEvents`、ローカル inline 経路含む）は dispatch 前に必ずデコードするため、デコーダ未登録の行は `No decoder registered for event type "tag.merge.requested"` で quarantine され、`runTagMergeJob` に到達しなかった。
- **背景:** plan のレビュー（arch S-001）が「デコーダ登録は不要」と誤判断していた。runner 単体の integration テストは relay デコード経路を通らないため、この穴をすり抜けていた。
- **修正:** `app/core/application/tag/mergeJobEventDecoders.ts` を新設し、`AllDomainEvents` union に `TagMergeJobEvent` を追加、`defaultEventDecoderRegistry` に登録（`satisfies` がデコーダ網羅をコンパイル時強制）。回帰テスト `mergeJobEventDecoders.test.ts` を追加（registry 経由のデコードを assert）。詳細は ADR-008。
- 修正後の再検証で全 AC PASS。

## TC-001 結果（再検証）

全 AC PASS。詳細は `results/TC-001.md`。DB 裏取り:

- 最新ジョブ `status=completed`、`progress_processed/total = 6/6`
- `source_remaining = 0`（source タグ参照ノートが全て付け替え済み）
- `target_notes = 8`（元3 + source6 − 両持ち1の no-op）
- source タグ行（a001）= 0 行（削除済み）
- determinate progressbar: `role="progressbar"` / `aria-valuemin=0` / `aria-valuemax=6` / `aria-valuenow=processed`

**注意:** ローカル inline dev は relay が初回 poll で即 `completed` を返すため、進捗バーの中間フレーム（1/6→2/6…）はブラウザでは観測困難。markup（aria 属性）と最終 100%・DB 状態で確認した（testing.md 記載の既知の制約どおり）。

## ブラウザ未検証の項目（自動テストでカバー）

- **AC-6（統合失敗時のエラー表示・楽観状態保全）** — 失敗誘発がブラウザでは不安定なため、`runTagMergeJob` の失敗パス integration テストでカバー。
- **AC-8（IDOR 防止 / `getTagMergeJob` の所有者検証）** — client state の jobId 改ざんはブラウザ UI から自然に再現できないため、`getTagMergeJob` の所有者検証 integration テスト（他オーナーの jobId 拒否）でカバー。

いずれも `pnpm test:integration`（802 passed）に含まれる。

## 起票した Issue

なし（検出バグは本ブランチ内で即修正）。
