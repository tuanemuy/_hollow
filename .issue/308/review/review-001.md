# PR Review #001 — feat(issue/308): apply button form guideline to TagActions / AccountDeleteForm / UsersTable

**PR:** #313
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 13 (Frontend/UX: 4 / a11y: 6 / Plan・型: 3)
- Notes: 21
- Verdict: **BLOCKED**（Warning 多数のため修正してから再レビュー）

---

## Frontend / UX

### Blockers
なし

### Warnings

- **[W-F-001]** 非 validation エラーで dialog 閉じた後 `draft` が保持される（破壊的アクションの安全装置を実質迂回しうる）
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:46-55`（`onConfirm` catch ブロック）
  - 理由: server エラーで `setConfirmOpen(false)` するパスで `draft` をクリアしない。再度トリガー「続けて削除する」を押すと、前回入力したユーザー名が input に残ったまま dialog が開く。ユーザー名一致確認は「破壊的操作の摩擦点」として置かれた安全装置なのに、エラー後の再試行ではその摩擦が消える。
  - 提案: トリガー開時に `setDraft("")` + `setError(null)` を呼ぶ（W-F-004 と同時解消）。

- **[W-F-002]** validation エラーメッセージが入力中も古いまま残る
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:107-109`
  - 理由: server から `fieldErrors.confirmation` が返って dialog 残置後、ユーザーが input を編集しても alert は次 submit まで消えない。
  - 提案: `onChange` で `if (error?.kind === "validation") setError(null);` を行う。

- **[W-F-003]** ヒントテキスト「Tab キーで入力欄に移動できます」が入力済みでも常時表示
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:110-113`
  - 理由: フォーカスが既に input にある状態でも案内が残る。
  - 提案: 一致状態では文言を変える、または W-A-002 のクライアント validation 立てで間接的に補助される。

- **[W-F-004]** 非 validation エラー時、outer summary + dialog 内 input が二重表示されうる
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:82, 84-115`
  - 理由: 非 validation エラー後に再オープンすると、outer summary と dialog が同時に存在する。
  - 提案: トリガー開時に `setError(null)`（W-F-001 と同時解消）。

### Notes
- ADR-001〜005 の意図はコード上に正しく反映されている
- TagActions 編集モードは例外 (b) と IngestionJobRow 先行例に整合
- UsersTable BTN_SM_CLASS への Icon 追加でレイアウト破綻なし
- confirmDisabled API 拡張は別 Issue 候補

---

## Accessibility / a11y

### Blockers
なし

### Warnings

- **[W-A-001]** AccountDeleteForm の input に `aria-describedby` が欠落（fieldErrors / hint への明示的リンクなし）
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:93-106`
  - 理由: `aria-invalid` だけでは SR がフォーカス時にエラー文言を再読み上げできない。hint テキストも input と紐付いていない。
  - 提案: `useId()` 追加で `hintId` / `errorId` を作り、`aria-describedby={[hintId, fieldErrors ? errorId : null].filter(Boolean).join(' ')}` を付与。

- **[W-A-002]** 不一致時 Enter 押下が無反応で、SR / キーボードユーザーに失敗理由が通知されない（WCAG 3.3.1 Error Identification）
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:36-40`
  - 理由: クライアント early return では `fieldErrors` が立たず、SR は「何も起きなかった」状態を認識できない。
  - 提案: クライアント側で `SerializedValidationError` 相当の状態を立てる（`setError({ kind: "validation", code: null, message: "ユーザー名が一致しません", fieldErrors: { confirmation: ["ユーザー名が一致しません"] } })`）。これで W-F-003 も部分対応される。

- **[W-A-003]** ConfirmDialog の description 内 input の多重読み上げ可能性（SR 依存）
  - 提案: VoiceOver / NVDA で実機確認推奨。本 PR で対処困難なため別 Issue 候補。

- **[W-A-004]** `<label>` だけが accessible name で、ユーザー名 hint と結びついていない
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:92`
  - 理由: 「ユーザー名（確認）」だけ読まれ、「どのユーザー名を入れるか」が伝わらない。
  - 提案: `<label>` 文言を「ユーザー名（{user.username} を入力）」に変更、または `aria-describedby` で description 内の説明 `<p>` を参照（W-A-001 と統合解決可能）。

- **[W-A-005]** TagActions / UsersTable / AccountDeleteForm summary が `<p role="alert">` のみで `aria-live` 領域に置かれていない
  - 場所: `app/components/tag/TagActions.tsx:140-144`、`app/components/admin/UsersTable/index.tsx:203-210`、`app/components/identity/AccountDeleteForm/index.tsx:82`
  - 提案: `aria-live="polite"` を追加（軽微）。

- **[W-A-006]** `data-danger` / `data-primary` のコントラスト検証エビデンスなし
  - 提案: 別 Issue で `spec/design/tokens.md` に数値追記（本 PR スコープ外）。

### Notes
- ConfirmDialog の `confirmIcon={Trash2}` が Icon ラッパー経由で `aria-hidden` 自動付与
- `Icon` ラッパーで size=16 / aria-hidden が全 11 箇所機械的に保証
- BTN_SM_CLASS の h-7 admin 例外維持
- ADR-005 で initial focus を panel に任せる判断は WAI-ARIA alertdialog 規範に完全準拠
- closable={!isPending} で削除中の Esc / overlay / × がブロック
- prefers-reduced-motion は motion-reduce で担保
- rule 1（生 router.invalidate() + WHY コメント）が ADR-004 通り保持

---

## Plan/ADR 整合性 + TypeScript / Hooks

### Blockers
なし

### Warnings

- **[W-P-001]** `closeDialog` で `setError(null)` を呼ぶため、summary 表示中に dialog 再オープン → Esc で summary が消える
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:58-62`
  - 理由: plan/ADR は summary 表示寿命を未規定。「再オープン → Esc で消える」は UX 退行。
  - 提案: `closeDialog` で `setError(null)` を呼ばない、または「draft クリアのみで error はトリガー開時にリセット」に変更。

- **[W-P-002]** TC-002 エッジケース 2/3 が SKIP のため ADR-002「3 経路を必ずマニュアルテスト」未充足
  - 場所: `.issue/308/manual-test/results/TC-002.md`
  - 提案: 修正後に「クライアント側 validation error 経路」が追加されるので、不一致時の dialog 残置・fieldErrors 表示は実機検証可能になる。system error は環境制約で SKIP 継続を progress.md に記録。

- **[W-P-003]** admin-user 自身の行に「管理者を解除」「一時停止」が表示される
  - 場所: `app/components/admin/UsersTable/index.tsx` `UserRow` 内
  - 提案: 本 Issue スコープ外（ボタン形態でなくロジック変更）。Phase 4 で別 Issue 起票。

### Notes
- rule 1 不変条件が ADR-004 通り正確に保持
- ADR-005 完璧遵守（focus 制御コード一切なし）
- ADR-001/002/003 通りの実装
- スコープ宣言遵守（他ファイル不変）
- TypeScript 型安全性 OK（new any/as なし、optional chain 正確）
- Hooks rules 遵守（依存配列漏れなし）
- lucide-react named import + Icon ラッパー経由統一

---

## Design Decisions

このラウンドで見つかった新たな設計判断:

- **クライアント側で `SerializedValidationError` を立てる判断**: ADR-005 で受容した「Enter 無反応」UX 退行に対して、W-A-002（WCAG 3.3.1）の観点から追加対応が必要と判明。クライアント早期 return で `setError({ kind: "validation", ... })` を行えば、validation エラー経路と統合的に SR / 視覚通知が機能する。ADR-006 として記録予定。
- **`closeDialog` で error を保持する判断**: summary 表示の寿命を「次のトリガー開」または「次の submit 成功」までと定義。`closeDialog` での error 自動クリアは廃止。ADR-006 と統合して記録。
