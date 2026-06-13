# Plan Review — Issue #538 / Round 1（アーキテクチャ・リスク視点）

レビュー対象: `.issue/538/plan.md` / `.issue/538/adr.md`
レビュー観点: あるべきアーキテクチャとの整合・実現可能性・リスク

## 検証したこと

- Issue #538 本文と plan の AC 対応（AC-1〜6 が Issue の 1〜3＋補足を網羅していることを確認）
- `spec/pages/index.md` P13・32 行目のモーダル方針記述（plan の更新対象指定が正確であることを確認。P13 の複数ファイル動線は既に「キューに積むのみ＋キュー画面で編集」と書かれており、本 Issue は単一ファイル動線を複数と同じモデルへ揃える方針転換であることも確認）
- `IngestionJobRepository` ポート（`findByOwner` / `findRecent` / `findStuck` のみで count 不在 — plan の調査どおり）と `NoteRepository.countByOwner`（同型パターンの先例が実在）
- `actions.ts` の input-less GET 先例（`getEffectiveIngestionPromptsFn` — plan が参照するパターンは実在し、コメントで「established pattern」と明記済み）
- `IngestionPreviewForm` の props 駆動設計（`titleInputRef` プロップが既に存在し、JSDoc も「parent owns the ref」契約 — EditDialog への移植は無改修で成立する）
- `Dialog` の API（`ariaLabelledBy` / `closeOnBackdropClick` が実在し、plan の利用法と一致）
- `Header.tsx` が server component で `UploadButton` を子に持つこと、アップロード CTA が現状ヘッダーのみであること
- 実装ステップの依存方向（ポート → adapter → usecase → server-fn → UI の inside-out 順になっている）

## 問題点（要修正）

- **[P-001]** `/upload` ページの `UploadForm` 経由アップロードがバッジ通知（`notifyIngestionQueueChanged`）の発火点に含まれていない
  - 理由: AC-5 は「バッジはアップロード・保存・破棄の操作後に更新される」を要求する。plan/ADR-002 の notify 発火点は `UploadDialog` / `IngestionJobRow` / `IngestionJobEditDialog` の 3 つだが、`/upload` ページには独立した `UploadForm`（`uploadFileFn` を直接呼ぶ）が存在し、ここからのアップロード成功でも active 件数は増える。`/upload` 滞在中はキュー自身のポーリングがリストを更新するが、バッジはバスかポーリングがないと更新されない（ADR-002 はバッジの常時ポーリングを否定している）ため、UploadForm からのアップロード直後にヘッダーバッジが古い件数のまま残る。
  - 提案: ステップ 5 または 6 の変更対象に `app/components/ingestion/UploadForm.tsx` を追加し、アップロード成功パスで `notifyIngestionQueueChanged()` を発火する。ADR-002 の発火点リストにも追記する。

## 改善提案（検討推奨）

- **[S-001]** EditDialog 編集中にキューのポーリングで行がアンマウントされるエッジケースを設計に明記する
  - 理由: 編集ダイアログは「行ローカル state」で開閉するため、`IngestionQueue` の 4s/16s ポーリングが（他タブでの commit / discard 等により）対象ジョブをリスト結果から外すと、行ごとダイアログがアンマウントされ未保存編集が無言で消える。plan のリスク欄は「commit が conflict エラーになる」ケースのみ記述しており、行消滅 → ダイアログ強制クローズのパスが漏れている。発生頻度は低い（同一タブの操作はダイアログを閉じてから行う設計のため、実質クロスタブのみ）が、テスト時に「ダイアログが勝手に閉じた」と混乱しないよう、許容するトレードオフとして ADR-001 か plan のリスク欄に一文添えるのが望ましい。実装で回避する（ダイアログ open 中はポーリング一時停止等）必要まではない — スコープ外の「ポーリング戦略変更」に踏み込むため。
- **[S-002]** `countByOwner` の opts 形を既存ポートの語彙と揃えるか実装時に確認する
  - 理由: 既存 `IngestionJobListOpts` は `status?: IngestionStatus`（単数）＋ `excludeStatuses`（複数除外）という語彙で、plan の `countByOwner(ownerId, { statuses })`（複数包含）は同一ポート内に第三の形を導入する。用途（IN フィルタ 1 クエリ）には `statuses` が素直で妥当だが、ポート JSDoc に `findByOwner` の opts と意味論が異なる理由（包含 vs 単数/除外）を一言書いておくと、`NoteRepository` の「countByOwner / listWithCount sibling family」のような整合コメント文化に沿う。
- **[S-003]** `queueBadgeBus` のテスト境界を明示する
  - 理由: モジュールスコープ pub-sub はテスト間で購読者が残留しやすい（モジュールキャッシュ）。テスト方針には `IngestionQueueBadge` の「notify で再取得」が挙がっているが、バス自体の reset 手段（unsubscribe 返却 or テスト用 reset）をステップ 5 の変更内容に一言含めておくと実装ブレを防げる。

## 良い点

- **ドメインから外向きの設計順**: 影響分析が「ドメインモデル変更なし（ライフサイクルは既にキュー前提）」から始まり、唯一の追加（read ポート）→ usecase → server-fn → UI と inside-out で実装ステップが並んでいる。status 集合（pending/processing/previewing）という業務的意味づけを usecase 定数に閉じ込め、presentation に漏らさない判断（ADR-003）はレイヤー責務の理解が正確。
- **既存パターンへの忠実な接地**: `NoteRepository.countByOwner`、input-less GET server-fn（`getEffectiveIngestionPromptsFn`）、Dialog の a11y 契約、`titleInputRef` の親所有契約 — 参照している先例がすべて実在し、plan の記述と現物が一致している。調査の精度が高い。
- **両方向のスコープ統制**: トースト基盤・常時ポーリング・専用編集ルートという「理想形の過剰追求」を ADR-001/002 で明示的に棄却しつつ、spec P13 の更新と旧 ADR（#319/#253）の supersede 記録（ADR-004）で「spec が正であり続ける」規律も守っている。AppShell ローダー `staleTime: Infinity` の制約を正しく踏まえてバッジを client 化した判断も実現可能性の裏取りができている。
- **spec との整合の発見**: P13 は複数ファイル動線を既に「キューで編集」と定義しており、本 Issue が spec の複数動線へ単一動線を収斂させる形になっている — この構図を plan が正しく捉えている（「乖離は実装ではなく UX 方針にある」）。
- **削除のリスク管理**: UploadDialog の大規模削除で他 Issue 参照コメントの残骸を残さない、`IngestionPreviewForm` の JSDoc を新しい親前提に書き換える、といった保守性への目配りがある。

## 総評

計画はアーキテクチャ的に健全で、実現可能性の裏取りも十分。要修正は P-001（UploadForm からの notify 漏れ — AC-5 の検証可能文言に対する実装漏れリスク）の 1 件のみで、修正コストは小さい。
