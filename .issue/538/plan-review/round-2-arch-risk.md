# Plan Review — Issue #538 / Round 2（アーキテクチャ・リスク視点）

レビュー対象: `.issue/538/plan.md` / `.issue/538/adr.md`（round 1 反映後）

## Round 1 指摘の反映確認

| Round 1 指摘 | 反映状況 |
|---|---|
| P-001（UploadForm 経由アップロードの notify 漏れ・coverage / arch-risk 共通） | 反映済み。ステップ 6 の対象ファイルに `UploadForm.tsx` を追加、設計 UI #3・AC-5 文言・テスト方針（UploadForm の notify 1 ケース）・adr.md ADR-002 の発火点リストすべてに波及している。実コード（`UploadForm.tsx` の `uploadAccepted` 成功パスに `routerInvalidate` あり）を確認し、notify の差し込み位置として実現可能であることも裏取りした |
| arch-risk S-001（EditDialog 編集中の行アンマウントによる強制クローズ） | 反映済み。plan「リスクと注意点」に独立項目として追記され、ADR-001 Consequences にも許容トレードオフとして記録。回避策（ポーリング一時停止）をスコープ外と明記する判断も round 1 の提案どおり |
| arch-risk S-002（`countByOwner` opts の語彙差異の JSDoc 明記） | 反映済み。ステップ 1 の変更内容と ADR-003 の Decision に「`findByOwner` の opts と意味論が異なる理由を JSDoc に明記」が入った。`NoteRepository` の sibling-family コメント文化（`noteRepository.ts` 23 行目）への参照も正確 |
| arch-risk S-003（queueBadgeBus のテスト境界） | 反映済み。ステップ 5 に unsubscribe 返却・unmount 時の購読解除・テスト間残留防止（afterEach 解除 or `resetForTest()`）が必須項目として明記された |
| coverage S-001〜S-003（AC 表のステップ列・AC-1/2 の検証粒度・spec 対象行明示） | 反映済み。AC-5 の対応ステップは「1–7, 9」、AC-1/AC-2 はテストケースと同粒度の合格条件に具体化、ステップ 10 に 170–176 行目（書き換え本体）と 18 行目（ヘッダー CTA の整合確認）が明記された |

反映の品質に問題なし。レビュー履歴セクションに修正内容と取り込み判断が透明に記録されている点も良い。

## Round 2 で新規に検証したこと

- `UploadDialog.tsx` の `multiResult` / `queueGuidance` / `POLL_TIMEOUT_MS = 180_000`、複数経路のみの `routerInvalidate` — plan の削除対象・「単一でも invalidate を追加」の記述と現物が一致
- `IngestionPreviewForm` のコールバック契約（`onCommitted(noteId, title)` / `onDiscarded` / `onRegenerated(jobId)` / `titleInputRef` 親所有）— EditDialog の配線計画と整合
- `IngestionJobRow.tsx` の previewing 行アクション（「ノートとして保存」→ navigate）— 「編集 commit はノートへ navigate（行の即時保存と同じ着地）」の前提が正しい
- `getIngestionJobFn` の使用箇所（`UploadDialog.tsx` のみ）— 削除後も server-fn 自体は残す判断のリスク記述と一致
- `getIngestionJobs` usecase の read パターン（`unitOfWorkProvider.run` 内で repository を呼ぶ）— `countActiveIngestionJobs` が踏襲すべき既存パターンが実在
- `spec/pages/index.md` 16 行目（ヘッダー CTA）・32 行目・170–176 行目 — ステップ 10 の対象指定が正確

#### 問題点（要修正）

問題点ゼロ。

#### 改善提案（検討推奨）

- **[S-001]** バッジの status 集合から `failed` を除外する理由を usecase 定数の JSDoc か ADR-003 に一言記録する
  - 理由: AC-5 / `countActiveIngestionJobs` は「未処理 = pending / processing / previewing」と定義しており plan 内では一貫しているが、Issue 本文はキューを「進行中・**失敗**・プレビュー保留のジョブ一覧」と説明しており、`failed` もユーザーの対応待ち（再試行・破棄）である。除外は妥当な設計判断（失敗は「進行中の作業」ではなく、バッジを恒久的に点灯させ続けるノイズになり得る）だが、判断の WHY が現状どこにも残らない。status 集合を usecase に閉じ込める設計（ADR-003）の趣旨どおり、定数の JSDoc に一文添えれば将来の「failed もバッジに含めるべきでは？」という再検討時に経緯が追える。
- **[S-002]** `countActiveIngestionJobs` が既存 read usecase と同じく `unitOfWorkProvider.run` 経由で repository にアクセスすることをステップ 3 に一言明記する
  - 理由: `getIngestionJobs` 等の既存 read usecase はすべて UoW コンテキスト経由で repository を取得するパターン。plan は「usecase を新設」とだけ書いており実装者がパターンを外す余地は小さいが、ポート追加（ステップ 1）が UoW コンテキストの repository 型に波及することも含め、明記しておくと迷いがない。軽微。

#### 良い点

- Round 1 の全指摘が plan 本文・AC・テスト方針・ADR の 4 点に漏れなく波及しており、反映が表面的でない（例: UploadForm の notify は対象ファイル追加だけでなく「漏れるとバッジが古い件数のまま残る」という理由まで本文化されている）。
- inside-out の実装順（ポート → adapter → usecase → server-fn → UI）と、status 集合の業務的意味づけを usecase に閉じ込めるレイヤー判断が維持されている。
- 削除系の大規模変更（UploadDialog の 9 ビュー → 3 ビュー縮退）について、削除対象の import・定数・コメント参照（#253/#256/#258/#319）まで具体的に列挙されており、残骸リスクの統制が効いている。
- ADR-004 による旧 ADR の supersede が「旧ファイルは書き換えず歴史的記録として残す」方針で、記録の不変性と追跡可能性を両立している。

## 総評

Round 1 の反映は正確かつ十分。新規の要修正事項はなく、残るは記録粒度の改善提案 2 件（いずれも実装を妨げない）。計画は実装着手可能な品質に達している。
