# PR Review #001 — feat(#543): 領域4「設定」(P21〜P24) のモック実装追従

**PR:** #564
**Date:** 2026-06-07
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（+ 規約1件は対応不要と判断）
- Notes: 多数（虚偽表示回避・トークン遵守・server/client境界が高評価）
- Verdict: **BLOCKED**（Warning 修正のため）

---

## Frontend

### Blockers
なし

### Warnings
- **[FE-W-001]** bio 文字数カウンタの `aria-live="polite"` が打鍵ごとに全文を読み上げる
  - 場所: `app/components/identity/ProfileForm/index.tsx:165-167`
  - 理由: 1文字入力するたびに「N / 500」が読み上げられ、自分の入力読み上げと衝突して冗長。文字カウンタは `aria-live` を付けないのが定石。かつ textarea と `aria-describedby` で関連付けもされていない中途半端な状態。
  - 提案: カウンタの `aria-live="polite"` を外し、カウンタ `<p>` に `id` を振って textarea に `aria-describedby` で紐付ける。
- **[FE-W-002]** controlled 化した newUsername が変更成功後にリセットされない
  - 場所: `app/components/identity/ProfileForm/index.tsx:59,90-102,217-218`
  - 理由: `value={newUsername}` の controlled 化後、`changeUsername` 成功時に `setNewUsername("")` していない。成功後も入力欄に旧入力が残り「現在: @bob」と入力欄 `bob` が併存して紛らわしい（再送信で同名エラーになりうる）。
  - 提案: usernameAction の成功分岐で `setNewUsername("")` を呼ぶ。

### Notes
- server→client 境界が規約どおり（Page が appUrl を取得し props 渡し、client は config 直読みなし）。
- 虚偽表示回避が徹底（500/30日/実appUrl、ダミー値の negative assert あり）。
- 空 appUrl フォールバック・末尾スラッシュ正規化が適切。
- 戻り導線・パスワード強度ヘルプの a11y 良好。新規スタイル定数に新規リテラル px なし。

---

## Test

### Blockers
なし

### Warnings
- **[T-W-001]** `AccountDeleteForm` の E-1「取り消せません」強調がテストで守られていない
  - 場所: `app/components/identity/AccountDeleteForm/__tests__/index.test.tsx`（未更新）
  - 理由: E-1 で `<strong className="font-medium text-ink">取り消せません</strong>` を追加したのに対応テストがなく、強調が消えるリグレッションを検知できない。plan.md テスト方針が「強調を反映した既存テスト更新」を明示。
  - 提案: 既存テストに 1 ケース追加し、`strong` 要素のテキストが「取り消せません」を含むことをアサート。
- **[T-W-002]** bio `null` 初期値（`0 / 500`）のケースが未テスト
  - 場所: `app/components/identity/ProfileForm/__tests__/index.test.tsx`
  - 理由: テストの USER.bio は常に `"hello"` で、`user.bio?.length ?? 0` のフォールバック分岐が一度も実行されない。
  - 提案: `bio: null` の USER で `0 / 500` 表示を確認する 1 ケースを追加。

### Notes
- **[T-N-003]**（採用）ProfileForm のレート制限ヘルプは aria-describedby 紐付けが未アサート。SecurityForm 側は検証済みなので対称性のため ProfileForm も紐付けをアサートすると一貫する。
- 虚偽表示の非混入アサーション（`/ 160`・`90日`・`hollow.example`・`/u//` の negative assert）が極めて良質。テスト設計・規約整合も良好。全12テスト green。

---

## 規約・アーキ整合

### Blockers
なし

### Warnings
- **[A-W-001]** `INPUT_GROUP_INPUT` の `outline-none` でフォーカスリングが消え、フォーカス表現が `focus-within:border-accent` のみ → **対応不要と判断**
  - 場所: `app/components/identity/styles.ts:70-78`
  - 判断: 既存 `fieldControl`（`common/styles.ts:189`）も `outline-none` + `focus:border-accent` で同等であり、本 PR が持ち込んだ退行ではない。`:focus-visible` のグローバル適用も効く。既存 input と挙動一致のため本 PR では対応しない（既存パターン踏襲）。tokens.md §10 のフォーカスリング SSOT 寄せは設定面全体の別タスク。

### Notes
- 虚偽表示の排除・デザイントークン遵守・styles.ts 集約・server/client 境界・スコープ遵守・plan/adr 整合のすべてを一次ソース照合で確認、完全に守られている。

---

## Design Decisions
特になし（A-W-001 の対応見送りは既存パターン踏襲のため ADR 化不要）。
