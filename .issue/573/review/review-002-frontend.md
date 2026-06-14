# Round 2 Frontend レビュー — PR #742 (Issue #573 P24 アカウント削除強化)

**対象:** PR #742 / Frontend AC-3/5/6/7 + a11y・既存パターン・スタイル規律  
**レビュー日:** 2026-06-14  
**レビューアー:** Frontend Specialist (Round 2 / W-003 修正確認)  

---

## 結論サマリー

**W-003（BTN_DESTRUCTIVE の hex → error-hover/error-pressed トークン化）が未適用。** 

その他の Frontend AC 判定（多段確認 UI / 有効化ゲート / 虚偽表示禁止 / Page.tsx 構成 / a11y / 既存パターン）は PASS。ただし W-003 修正を入れるまで、スタイル規律（CLAUDE.md 「任意値・handwritten CSS なし」「トークン 3 箇所 SSOT」）に違反した状態が続くため、**Blocker 判定**。

---

## Blockers: 1

### [B-001] BTN_DESTRUCTIVE の hover/pressed 状態が hard-coded hex を使用 — トークン化が未適用（W-003）

**ファイル:** `app/components/identity/styles.ts:262-263`

**現在の実装:**
```typescript
export const BTN_DESTRUCTIVE =
  "inline-flex items-center gap-1.5 self-start h-11 px-6 rounded-pill bg-error text-white text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none hover:not-disabled:bg-[#b03535] active:not-disabled:bg-[#9a2e2e] disabled:bg-surface disabled:text-ink-tertiary disabled:cursor-not-allowed";
```

**問題:**
- `hover:not-disabled:bg-[#b03535]` → `var(--color-error-hover)` の hard-coded hex
- `active:not-disabled:bg-[#9a2e2e]` → `var(--color-error-pressed)` の hard-coded hex

**根拠:**
- CLAUDE.md: 「Utility-first only. Do not introduce ... handwritten CSS files」「Design tokens live in tokens.css (single source of truth, mirrored in spec/design/tokens.md). ... adding a new token means adding it to tokens.css and extending the @theme inline block」
- `app/styles/tokens.css` に `--color-error-hover: #b03535` / `--color-error-pressed: #9a2e2e` が追加済み（L28-29）
- `app/styles/index.css` の `@theme inline` に `--color-error-hover` / `--color-error-pressed` が追加済み（L31-32）
- `spec/design/tokens.md` に表として記載済み（semantic 色 table）
- **styles.ts は通常ユーティリティ参照のみで、任意値 `[#...]` を含まない**（既存パターン確認済み）

**修正方法:**
```typescript
export const BTN_DESTRUCTIVE =
  "inline-flex items-center gap-1.5 self-start h-11 px-6 rounded-pill bg-error text-white text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none hover:not-disabled:bg-[var(--color-error-hover)] active:not-disabled:bg-[var(--color-error-pressed)] disabled:bg-surface disabled:text-ink-tertiary disabled:cursor-not-allowed";
```

**影響:** スタイル規律違反。トークン SSOT が 3 箇所（tokens.css / index.css / spec/design/tokens.md）に分散し、styles.ts が追加の 4 番目の「actual color」になる。将来のリブランド時に修正漏れリスク。

---

## Warnings: 0

すべてのフロントエンド AC / a11y / 既存パターン / 動作確認が合格（ブラウザテストレポート・テストスイート・コード読み合わせ検証済み）。

---

## Notes: 3

### [N-001] Page.tsx の async server component + SectionErrorBoundary 構成が P22 準拠で適切

**ファイル:** `app/components/identity/AccountDeleteForm/Page.tsx:16-42`

**確認:**
- ✅ route loader は auth のみ（`requireCurrentUser` で保護）・集計 usecase 呼び出し無し
- ✅ `AccountDeleteSection` が async server component で `summarizeAccountDeletion` usecase 呼び出し
- ✅ `<Suspense fallback={<FormSkeleton>}>` + `<SectionErrorBoundary>` で集計エラー隔離
- ✅ コメント ("Auth stays in the route handler; the deletion impact aggregation streams ...") で意図が明確

**参照:** P22（SecurityForm）と同型構成。集計レイテンシの隔離・エラーハンドリング・stream rendering が適切に設計されている。

### [N-002] Action 層で `confirmWord` を破棄する実装が型 + コメント で担保されている（S-005）

**ファイル:** `app/components/identity/AccountDeleteForm/action.ts:16-26`

**確認:**
- ✅ schema では `z.literal('DELETE')` で transport validate（frontend gating の二重防御）
- ✅ action handler は data から `confirmWord` を**明示的に無視し** `confirmation` + `currentPassword` のみ転送
- ✅ コメント "confirmWord is validated at the transport boundary but deliberately not forwarded" で意図が明記

**型保証:** `DeleteAccountInput` 型が `confirmWord` フィールドを**含まない**ため、action が誤って usecase へ渡そうとすればコンパイル時エラー。

**テスト:** `index.test.tsx:207-223` で「server fn へ送るペイロードが { confirmation, currentPassword, confirmWord } である」を assert。action による破棄は型で保証される（existing harness に action-unit-test は無し）。

### [N-003] `formatBytes` の実装が妥当（presentation 責任を component に配置）

**ファイル:** `app/components/identity/AccountDeleteForm/index.tsx:54-63`

**確認:**
- ✅ DTO に `mediaTotalBytes` は `number`（raw bytes）
- ✅ component の `formatBytes` で UI 用に humanize（123456 B → "121 KB"）
- ✅ コメント "the raw byte total comes from the aggregation DTO and humanization is a presentation concern (#573). Mirrors the admin metrics helper"

**パターン:** 既存 admin metrics helper と同型の inline helper。DTO が意味的な値（bytes）を持ち、presentation が format を担う設計は correct。

---

## AC 項目別 詳細確認

| AC | 内容 | 判定 | 根拠 |
|---|---|---|---|
| AC-3 | 確認語 DELETE のみで有効化 + 大小文字厳密 | ✅ PASS | テスト TC-004・code L88「`wordDone = confirmWord === CONFIRM_WORD`」で厳密一致 |
| AC-5 | 多段確認 UI（step-num / checkbox / input / password） | ✅ PASS | code L175-283 / テスト TC-002 / モック準拠（配置・順序・ラベル） |
| AC-6 | 影響リスト実データ表示（件数・容量） | ✅ PASS | code L143-171 / テスト TC-001 / browser verify レポート合格 |
| AC-7 | 削除成功後ログアウト + 即時遷移 | ✅ PASS | code L120-121 / browser verify TC-006 合格 |

### a11y 検証

| 項目 | 確認 | 判定 |
|---|---|---|
| 🔤 Link labels | 全ボタン・入力に label/aria-invalid/aria-describedby | ✅ |
| 🎯 Focus mgmt | button disabled 状態が正しく反映 | ✅ |
| 📢 Alerts | form-level / field-level error が `role="alert"` | ✅ |
| ⌨️ Keyboard | click + enter で同一挙動（HTML button default） | ✅ |
| 🏷️ Fieldset | password field に `aria-describedby={helpId}`（補助文） | ✅ |

**ref:** L82-86（useId）で dynamic id 管理・L247-250 / L273-277（aria-invalid + FIELD_ERROR alert）/ L278-280（aria-describedby + 補足文）

### 既存パターン準拠

| パターン | 例 | PR 実装 | 判定 |
|---|---|---|---|
| Error alert | `ALERT` + `ALERT_ERROR` + icon/title/body | L137-173 | ✅ common/styles の ALERT 群を再利用 |
| Form error | `FIELD_ERROR` + `role="alert"` | L247-250, L273-277, L286-289 | ✅ SecurityForm / ProfileForm と同型 |
| Form action | `ACTION_ROW` + button/hint | L291-304 | ✅ DANGER_ACTION（P24 特有） + DANGER_NOTE 追加 |
| Server fn | `useServerFn(deleteAccountFn)` + error extract | L73, L123 | ✅ identity 層の既存パターン（clearAppShellCache #728 含む） |

---

## Styling 規律チェック

| 観点 | 確認 | 判定 | 備考 |
|---|---|---|---|
| 🎨 Tailwind utility-first | `className={CONFIRM_STEPS}` など module constant 参照 | ✅ | 任意値 `[...]` なし（BTN_DESTRUCTIVE を除く） |
| 📦 Token SSOT | tokens.css / index.css / spec/design/tokens.md 一致 | ❌ BTN_DESTRUCTIVE | error-hover/error-pressed が styles.ts に hard-coded hex として存在 |
| 🚫 Handwritten CSS | `@apply` / separate .css file なし | ✅ | styles.ts は module constant only |
| 📐 data-* attributes | checkbox / step-num に `data-done={...}` | ✅ | L177-178 / L198-199 / L221-222 |

---

## テスト等 既存検証結果（参考）

- ✅ ブラウザ検証 report.md: TC-001 ～ TC-006 全 PASS
- ✅ Unit test suite: index.test.tsx 11 テスト全 PASS（impact count / disabled gate / success nav / error handling）
- ✅ Integration test: identity.integration.test.ts で `summarizeAccountDeletion` 検証済み（D1 seed data）

---

## 対応内容

W-003 修正の再確認：

1. ✅ `app/styles/tokens.css:28-29` に `--color-error-hover: #b03535` / `--color-error-pressed: #9a2e2e` 追加済み
2. ✅ `app/styles/index.css:31-32` の `@theme inline` に両トークン追加済み
3. ✅ `spec/design/tokens.md` に表として記載済み
4. ❌ `app/components/identity/styles.ts:262-263` の BTN_DESTRUCTIVE が hard-coded hex のままで、トークン参照に変更されていない（W-003 修正が未適用）

---

## 結論

- **Blockers: 1** — BTN_DESTRUCTIVE の hard-coded hex → token 参照化が未実施
- **Warnings: 0**
- **Notes: 3** — Page 構成 / S-005 実装 / formatBytes 設計 が適切

**推奨:** B-001 を修正後、再レビュー OK。その他 AC・a11y・既存パターン・動作は合格。

