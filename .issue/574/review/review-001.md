# PR Review #001 — feat(#574): P23 プロンプトプレビュー（LLM実行プレビュー機構）

**PR:** #629
**Date:** 2026-06-10
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 全件を本ラウンドで解消する方針）

---

## Use Case / Domain

#### Blockers
- なし

#### Warnings
- **[B1-W-001]** `translateLLMError` に未知 BusinessRuleError を verbatim 再送出する素通し分岐がある（`previewPrompt.ts:149,168-181`）。プレビューパスで想定外の code を持つ BusinessRuleError が来ると errorDisplay の専用ケースに無く汎用フォールバックに丸められ「正直な表示」原則の穴になる。→ 未知 BRE も `llm_preview_unavailable` に集約し、意図をコメント明示。
- **[B1-W-002]** `tryConsume` が LLM 成否に関わらず必ず1カウント消費する点が ADR に未記載（`previewPrompt.ts:79-88`）。安全側（DoS 防止）設計として妥当だが意図を記録すべき。→ usecase JSDoc + ADR に1行追記。

#### Notes
- ADR-002 集約・metadata マッピング・編集中プロンプト優先・LLM エラー翻訳網羅・命名規約・UoW 外実行・IdentityUserId brand いずれも計画/ADR に忠実。

## Adapter / Infrastructure

#### Blockers
- なし

#### Warnings
- **[B1-W-003]** adapter コメントの「lost INSERT race / on retry」機序の記述が誤り（`promptPreviewRateLimiter.ts:32-33`、port・ADR-003/006 も同様）。retry ループは無く、単一文が SQLite per-statement write lock で直列化される。結論（RETURNING 空＝denied）は正しいが機序説明を修正。

#### Notes
- migration 連番・schema 整合・mapDbError・window 計算・retryAfterSec・count 上限いずれも問題なし。
- **[B1-N-growth]** `prompt_preview_counters` の古い window 行を掃除する pruner が未配線で行が単調増加（Security W-001 と重複）。→ 下記で対応。

## Frontend / Presentation

#### Blockers
- なし
#### Warnings
- なし（XSS 安全＝LLM 出力 html はテキストノード描画、dangerouslySetInnerHTML 不使用。トークン追従・認証・schema・React 19 primitives すべて良好）
#### Notes
- N-009（軽微）: server 側の空白のみ入力 trim は無いが min(1) 内・レート制限内で実害なし。Note 据え置き。

## Test

#### Blockers
- なし
#### Warnings
- **[B1-W-004]** 新規4コードの「専用文言」を直接アサートするテストが無い（`errorDisplay.test.ts`、`message !== FALLBACK` のみ）。ミスマッピングを取り逃す。→ 各コード `toContain` で文言固定。
- **[B1-W-005]** unit (d) の LLM エラー翻訳が structure 経路でしか走らず metadata 経路（suggestMetadata reject）が未カバー（`previewPrompt.test.ts:172-191`）。→ metadata reject ケースを追加。
- **[B1-W-006]** （軽微）`llm_failure` 期待値が実装・テストで独立にハードコード（`previewPrompt.test.ts:170-171`）。→ 共有定数 or コメントで意図明示。

#### Notes
- Fake 最小化・integration 網羅・errorCodeNaming 自動カバーは良好。

## Security

#### Blockers
- なし
#### Warnings
- **[B1-W-007]** レート制限カウンタ行が無制限蓄積（pruner 未配線）。認証必須ゆえ外部無制限ではないが掃除経路がコードに無い（Adapter N-growth と同一）。→ adapter で per-user の古い window 行を tryConsume 時に opportunistic 削除して bound する。
- W-tuning（受容）: max=20/1h 固定 window は境界バーストを許す（ADR-003 既知トレードオフ）。変更なし。

#### Notes
- 認証・認可（actorUserId は server 確定）・レート制限が LLM 前・入力検証・機密非漏洩・XSS なし・read-only いずれも適切。

---

## 仕分け（本ラウンドで全件対応）

- B1-W-001: 修正（未知 BRE → llm_preview_unavailable 集約 + コメント）
- B1-W-002: ADR + JSDoc 追記
- B1-W-003: コメント機序修正（adapter / port / ADR）
- B1-W-004/005/006: テスト追加・改善
- B1-W-007（+N-growth）: adapter で per-user 古い window 行を opportunistic 削除（pruner 別配線を避け同一ファイル内で bound）+ integration アサート追加

## Design Decisions
ADR-008（消費は失敗時も行う安全側設計）/ ADR-009（カウンタ行は adapter 内 opportunistic cleanup で per-user bound）を追記予定。
