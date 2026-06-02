# PR Review #001 — feat(#396): プロンプト設定で operator が触るのは「分析の意図」だけにする

**PR:** #429
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3（実質的に要修正: 2 / 確認事項で修正不要: 1）
- Notes: 多数
- Verdict: **BLOCKED**（Warning を残さず潰す方針のため）

---

## Adapter / Domain

#### Blockers
- なし

#### Warnings
- **[B/A-W-001]** operator intent が前後空白を保持したまま追記される
  - 場所: `app/core/adapters/llm/prompts.ts:34`（`operatorIntentSection`）
  - 理由: 追記判定は `prompt.trim()` だが、配列に push するのは未トリムの `prompt`。D1 の `entry.text` がそのまま流れるため `"  \n意図文\n  "` でラベル直後に空行・末尾空行が混入し体裁が乱れる。③契約は別配列要素なので不変性は保たれるが、plan ステップ1も「`input.prompt.trim()` が非空のとき、その意図文を追記」と読める。
  - 提案: push する本文もトリムする（`[OPERATOR_INTENT_LABEL, prompt.trim()]`）。

#### Notes
- 核心ロジックは正しい（①固定先頭 / ②中間挿入 / ③末尾固定、`join("\n")` で③が構造的に displace 不可能）。`endsWith`/`startsWith` assert が不変性を固定。
- 3プロバイダは prompts.ts 単一実装に閉じ drift 防止維持。既存②③ substring assert 非回帰（267 件パス）。
- JSDoc 是正は実体と一致、誤認文言は app/spec から一掃。ADR-002 の空文字フォールバック契約は維持。

## Frontend

#### Blockers
- なし

#### Warnings
- **[FE-W-001]** placeholder と既定値ラベルの「分離」は未上書き時のみ確認可（上書きありカードは既定値ヒント非表示）
  - 場所: `app/components/admin/PromptsForm/index.tsx:176-180`
  - 理由: 実装上の自然な振る舞いで実害なし。`defaultLabel` は未上書き時の `既定値:` 行のみ消費、placeholder は常に `INTENT_PLACEHOLDER` 固定。plan [P-002] の「別定数に分離」は満たされている。
  - 判定: **確認事項であり修正不要**（要件充足）。

#### Notes
- 文言是正の網羅性は完全（grep 残存は別概念の `provider="anthropic"` と是正後文言のみ）。
- PromptsForm 要件全充足（`NO_OVERRIDE_LABEL`/`INTENT_PLACEHOLDER` 分離、ラベル「分析の指示（任意）」、description 意図記述化、confirm 是正、コメント是正、hint・schema・action 不変）。
- UploadDialog 機能不変・文言のみ（`SYSTEM_DEFAULT_PROMPT_COPY`、出所「システム既定」、バッジ未変更）。
- スコープ判断正しい（dead-input は description のみ、identity/PromptsForm は対象外）。

## Test

#### Blockers
- なし

#### Warnings
- **[T-W-001]** operator が③相当の literal 文字列（`JSON_CONTRACT_TAIL` 等）を入力しても③が末尾に残るケースが未テスト
  - 場所: `app/core/adapters/llm/__tests__/prompts.test.ts:72-83,126-135`
  - 理由: 現 (c) は散文を入れるだけで③の literal を埋め込んでいない。ADR-001 が想定する「移行ユーザーが③相当を自前で書いた文」との混在を固定できていない。
  - 提案: operator prompt に `JSON_CONTRACT_TAIL` を丸ごと埋め込み、`endsWith(JSON_CONTRACT_TAIL)` が true かつ `lastIndexOf(TAIL) > indexOf(OPERATOR_INTENT_LABEL)`（本物の③が operator コピーより後ろ）を 1 ケース追加。
- **[T-W-002]** 前後空白付き prompt の追記挙動が未固定
  - 場所: `prompts.test.ts` 全体
  - 理由: A-W-001 で本文をトリムする修正を入れるなら、その挙動（前後空白が除去される）をテストで pin すべき。
  - 提案: 前後空白付き入力で、トリム後の意図文がラベル直後に隣接する assert を 1 ケース追加。
- **[T-W-003]** operator 意図あり × directoryGuidance/existingDirectories 分岐ありの交差ケースが未検証
  - 場所: `prompts.test.ts` 全体
  - 理由: existingDirectories・locale 分岐は 3プロバイダ統合テストでカバーされるが全て `prompt: ""` 実行。非空 prompt との交差はどこにもない。
  - 提案: `existingDirectories` あり＋非空 prompt で「ロール→意図ラベル→verbatim ガイダンス→locale→③末尾」が揃う 1 ケースを追加。

#### Notes
- assert 設計は良質（`startsWith`/`endsWith`/`indexOf` 順序比較/ラベル隣接検証）。
- 非回帰確認済み（3プロバイダ 225 件パス）。UploadDialog.test.tsx の追従は語彙含め正確。

---

## 仕分け

- **このPRで直す**: A-W-001（impl トリム）、T-W-001 / T-W-002 / T-W-003（テスト追加）。すべて `app/core/adapters/llm/` 内に閉じ、修正コスト低。
- **修正不要**: FE-W-001（確認事項・要件充足）。

## Design Decisions

特になし（A-W-001 のトリムは plan ステップ1 / ADR-001 の「意図文を追記」の文意に沿う実装上の整合であり、新規 ADR 不要）。
