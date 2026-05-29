# ADR — Issue #253: regenerateIngestionPreview の実装と spec を一致させる

## ADR-001: 再生成を二段遷移（previewing → pending → processing）で実装する

### Status
Proposed

### Context
`regenerateIngestionPreview` が現状 LLM を再駆動できていない。原因は usecase が `previewing → processing` に直接遷移するが、`runIngestionJob` の `isPending` ガード（入口で `pending` 以外を弾く冪等ガード）に引っかかり、かつ `ingestion.regenerated` イベントが `dispatchDomainEvent` のルーティングから意図的に除外（#57 ADR-004）されているため、pipeline が再起動されないこと。

Issue 本文は 3 つの修正案を提示している:

| 案 | 内容 | 評価 |
|---|---|---|
| A: `isPending` ガード緩和 | `runIngestionJob` が `processing` も受理 | ガードの不変条件を壊す。`processing` 中の再エントリ・OCC 競合・redelivery 縮退（#57 ADR-003）に広く波及。**最もリスキー** |
| B: 新イベント `ingestion.regenerationRequested` 新設 | regenerate 専用 event を追加 | event 種別/decoder/テストが純増。`retryRequested`（pending に戻して再処理）と実質重複 |
| C: 二段遷移 `previewing → pending → processing` | `regenerate` 遷移先を `pending` にし、既存 `ingestion.regenerated` を dispatch→`runIngestionJob` にルーティング | retry の確立パターンを完全再利用。`isPending` ガード無変更。新 event 不要 |

### Decision
**案 C を採用する。** `IngestionJob.regenerate` の遷移先を `processing` → `pending` に変更し、既存の `ingestion.regenerated` イベントを `dispatchDomainEvent` のルーティングに追加して `runIngestionJob` に渡す。`runIngestionJob` が `pending → processing` を担い、admin retry（`failed → pending` + `ingestion.retryRequested` dispatch + `isPending` 通過）と同一の経路に乗せる。

### Consequences
- 良い点:
  - spec「キューに RunIngestionJob を再 enqueue」を最小差分で満たす。
  - `isPending` ガードの不変条件を尊重（無変更）。#57 ADR-003 の既知の限界に新たな波及がない。
  - 新 event を作らず既存 `ingestion.regenerated`（`regenerationCount` 保持）を流用。
  - OCC は retry と同じ UoW 内 1 トランザクション挙動を踏襲。
- トレードオフ:
  - #57 ADR-004 の「`ingestion.regenerated` を routing から除外」を覆す（ADR-002 参照）。
  - `regenerate` の戻り型が `PendingIngestionJob` に変わり、entity の型・単体/integration テストの遷移先 assertion を更新する必要がある。

---

## ADR-002: #57 ADR-004（ingestion.regenerated の dispatch 除外）を覆す

### Status
Proposed

### Context
#57 ADR-004 は `ingestion.regenerated` を `dispatchDomainEvent` のルーティングから意図的に除外した。当時の理由は「regenerate が `previewing → processing` に直行するため、`runIngestionJob` にルーティングしても `isPending` ガードで no-op になり無意味」だったと読み取れる（機能的な反対ではなく、当時の遷移設計を前提とした技術的判断）。

### Decision
本 Issue で `regenerate` の遷移先を `pending` に変更する（ADR-001）ことで除外の前提が消えるため、`ingestion.regenerated` を `runIngestionJob` にルーティングするよう dispatch を変更する。コードコメントと spec に「ADR-004 を Issue #253 で覆した」旨を明記し、`dispatchDomainEvent.test.ts` の regression guard を「skip」から「route」へ反転する。

### Consequences
- 良い点: spec と実装の不整合が解消し、`/upload` の再生成ボタンが実際に機能する。
- トレードオフ: 過去の ADR を覆す判断であり、将来の読者が混乱しないよう ADR-004 の前提が無効化されたことを履歴として残す必要がある。

---

## ADR-003: プレビュー編集モーダルの再生成後は `waiting` view へ再遷移する

### Status
Proposed

### Context
#226 のプレビュー編集モーダル（`IngestionPreviewForm` + `UploadDialog`）に再生成ボタンを復活させるにあたり、押下後の UI 遷移に2案がある:
- (a) モーダルを閉じて `/upload` 一覧の `IngestionJobRow` に状態反映を委ねる（最小実装・`onClose` 直行）
- (b) `editing` view から `waiting` view へ再遷移し、既存のポーリングループ（`pending → processing → previewing` を監視し previewing 復帰で `editing` へ自動復帰）に乗せる

再生成は `previewing → pending` に戻して LLM を非同期再駆動するため、preview が一時的に消える。`UploadDialog` には既に `waiting` view のポーリング機構があり、`editing` view ではポーリングしない。

### Decision
**(b) `waiting` view への再遷移を採用する。** `IngestionPreviewForm` は成功時に `onRegenerated(jobId)` を親へ通知し、`UploadDialog` が `setView({ kind: "waiting", ... })` で再遷移する。これにより再生成 → 待機 → 新 preview 表示までモーダル内で完結し、編集モーダルの目的（preview を編集する場）と体験が一貫する。

### Consequences
- 良い点: 既存の `waiting` ポーリング機構を再利用し、ユーザーがモーダルを離れずに再生成結果を確認できる。
- トレードオフ: `UploadDialog` に `onRegenerated` ハンドラと view 再遷移ロジックを追加する必要があり、`UploadDialog.test.tsx` に regenerate → waiting の新ケース追加が要る（(a) より実装・テストがやや増える）。

---

## ADR-004: dispatch の `skipped` regression guard 例示を `ingestion.previewAttached` に差し替える

### Status
Accepted（実装時の付随判断）

### Context
`dispatchDomainEvent` の `DispatchOutcome.skipped` の JSDoc は「unit tests can prove specific event types (e.g. `ingestion.regenerated`) are intentionally not dispatched」と例示していた。Issue #253 で `ingestion.regenerated` を routing に追加したため、この例示が事実と矛盾するようになった。

### Decision
`skipped` の例示を、引き続き意図的に dispatch されない `ingestion.previewAttached`（既存の skip regression guard テストが存在する）に差し替える。`ingestion.regenerated` を巡る経緯（ADR-004 #57 を覆した点）は routing 本体の JSDoc 側に集約して記述する。

### Consequences
- 良い点: ドキュメントが実装と一致し、「skip の代表例」が現存する skip テストと対応する。
- トレードオフ: なし（純粋なドキュメント整合）。

---

## ADR-005: プレビュー編集モーダルの「再生成」ボタンは `Icon` + ラベルで `IngestionJobRow` と統一する

### Status
Accepted（実装時の付随判断）

### Context
`IngestionPreviewForm` のアクションバーの既存ボタン（キャンセル / 破棄 / 登録）はアイコンを持たないテキストのみだが、同じ再生成操作を提供する `IngestionJobRow` のボタンは `<Icon icon={RefreshCw} />` + ラベルで描画している。再生成ボタンをモーダルに追加するにあたり、どちらの様式に合わせるか判断が必要だった。

### Decision
`IngestionJobRow` と同じ `<Icon icon={RefreshCw} />` + 「再生成」ラベルで描画する。再生成という同一操作を 2 箇所で提供するため、アイコンを共有して視覚的に対応付けることを優先した。

### Consequences
- 良い点: 同一操作のアフォーダンスが画面間で一貫する。
- トレードオフ: モーダル内で 1 つだけアイコン付きボタンが混在するが、再生成は「やり直し」を示すアイコンの恩恵が大きく許容範囲とした。
