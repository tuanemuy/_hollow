# PR Review #001 — feat(issue/256): upload dialog a11y (aria-labelledby / focus / SR announce)

**PR:** #274
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9（重複統合後は 7 件）
- Notes: 多数
- Verdict: **BLOCKED**（Warning 全件の修正を予定）

---

## Frontend / Component Design

### Blockers
なし

### Warnings

- **[W-FE-001]** `statusId` は生成されているがどこからも参照されない
  - 場所: `app/components/ingestion/UploadDialog.tsx:138, 369`
  - 理由: `const statusId = useId();` を `<div id={statusId} role="status">` に渡しているが、`aria-describedby` / `aria-controls` / `htmlFor` などからの参照がない。コードリーダーが「あとで配線するつもり?」と誤解する余地が大きい。`role="status" + aria-live="polite"` 自体が SR への通知メカニズムなので id 不要。
  - 提案: `statusId` 宣言と `id={statusId}` を削除。

- **[W-FE-002]** `Dialog.initialFocusRef` API が本リポジトリ内で配線ゼロ
  - 場所: `app/components/common/Dialog.tsx:52, 179, 299-330`
  - 理由: `UploadDialog` は ADR-004 で意図的に使わない契約。結果として本 PR で追加された新 API の利用者がゼロ。ADR-004 で「将来のため」と明文化済み・テスト固定済みではあるが、ADR Status を `Accepted` に上げて意図を明示するのが望ましい。
  - 提案: ADR-001 / ADR-004 の Status を `Proposed` → `Accepted` に更新する。コード変更は不要。

- **[W-FE-003]** `initialFocusRefRef` のミラー代入が render 中で行われている（ref オブジェクト不変の前提と矛盾）
  - 場所: `app/components/common/Dialog.tsx:299-300`
  - 理由: 同パターンの `closableRef` / `onCloseRef` は closure 値を effect 内から最新読みする目的だが、`initialFocusRef` は「ref オブジェクトは安定」が JSDoc 明示の前提。不変前提なのに毎 render 上書きするのは意図と実行コードの不一致。
  - 提案: `useRef(initialFocusRef)` で初期化のみに変更し、render 中の代入を削除。

### Notes
- **[N-FE-001]** `IngestionPreviewForm` の `titleInputRef ?? localTitleInputRef` パターンは適切
- **[N-FE-002]** `viewStatusText` の module-scope 純関数 + exhaustive switch は型レベル illegal-state 防止の好例
- **[N-FE-003]** `UploadingView` / `WaitingView` の局所 `aria-live` 削除で重複 announce 回避済み
- **[N-FE-004]** `useEffect([view.kind])` の依存配列が discriminant に絞られており、`job` 更新で再発火しない設計

---

## Accessibility

### Blockers
なし

### Warnings

- **[W-A11Y-001]** `statusId` が未参照（Frontend W-FE-001 と同一）
  - 場所: `app/components/ingestion/UploadDialog.tsx:138, 369`
  - 提案: 削除。

- **[W-A11Y-002]** `select` 戻り時の `role="status"` 空文字遷移時の SR 挙動懸念
  - 場所: `app/components/ingestion/UploadDialog.tsx:92-119` / `:369-371`
  - 理由: `waiting`/`uploading` から polling fatal error で `select` 戻りすると status の textContent が non-empty → "" に変化。SR バージョン差で「空白」と読み上げる実装がある。同時に `role="alert"` のエラーも発火し、競合の可能性。
  - 提案: 現状の常設 mount のまま据え置き、実機 SR (VoiceOver/NVDA) での検証は manual-test 結果（TC-edge-1）で代替。本 PR では追加修正なし、Notes として記録。

- **[W-A11Y-003]** `IngestionPreviewForm.preview === null` フォールバック時、editing view 突入で focus が input 不在のため不達
  - 場所: `app/components/ingestion/IngestionPreviewForm.tsx:211-217` + `app/components/ingestion/UploadDialog.tsx:144-148`
  - 理由: `preview === null` のときフォームは `<p role="alert">` のみで `titleInputRef.current === null`。focus effect が no-op で失敗、キーボードユーザーが focus 位置を見失う。
  - 提案: フォールバック段落に `tabIndex={-1}` 付与 + 上流 `previewMissingRef` を用意し、focus effect で input がなければ fallback 段落に focus を寄せる。または preview === null を editing view に到達させない state machine 修正。前者の方が変更影響が小さい。

### Notes
- **[N-A11Y-001]** `role="status"` と `aria-live="polite"` の二重宣言は冗長だが古い SR への保険として正当
- **[N-A11Y-002]** ADR-002 の follow-up Issue（型レベル排他制約）は本 PR のスコープ外で正解
- **[N-A11Y-003]** ネスト dialog の Tab focus trap 競合は既存リスク（本 PR 由来ではない）
- **[N-A11Y-004]** `IngestionPreviewForm` の `aria-busy={isPending}` 欠落は Issue #226 audit の Medium 級項目、本 PR スコープ外
- **[N-A11Y-005]** `<h2>` と status region の DOM 順は意図通り、`aria-labelledby` ターゲットが先

---

## Test

### Blockers
なし

### Warnings

- **[W-TEST-001]** テスト D（`moves focus to the title input when entering the editing view`）が happy-dom の child ref attach 順序に暗黙依存
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx:680-711`
  - 理由: React の effect 順序保証で「子 commit → 親 effect」を前提に動作しているが、将来 `<IngestionPreviewForm>` が lazy import / Suspense 境界配下に置かれた瞬間に静かに失敗。
  - 提案: 当該テストにコメントで「focus 効果は同 commit 内の親 effect で発火するため child input の ref attach に依存」と注釈。

- **[W-TEST-002]** multi-file テストでスピンループ `while (resolvers.length === 0) await Promise.resolve();` を使用、無限ループ risk
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx:516-555`
  - 理由: `submitFiles` の内部実装が将来 microtask を 1 つでも追加 / setTimeout 挟む形に変わると無限ループ→テストタイムアウトで停止。
  - 提案: 期待回数（5 回程度）の上限を設けるか、`await vi.runOnlyPendingTimersAsync()` + `await Promise.resolve()` の組み合わせで明示的にフラッシュ。

- **[W-TEST-003]** ステータス textContent の検証で `.toContain` を使用しており、契約のピン留め強度が緩い
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx:466-514` ほか
  - 理由: `viewStatusText(uploading, total=1)` は `"アップロード中"` を返すが `total>1` は `"N 件のファイルをアップロード中"`。`.toContain("アップロード中")` だと両方で合格してしまう。
  - 提案: `.toContain` を `.toBe` に変更してピン留め強度を上げる。

### Notes
- **[N-TEST-001]** plan.md ステップ 7 のケース A〜E + C' は全て網羅
- **[N-TEST-002]** `IngestionPreviewForm.test.tsx` の sentinel ボタン経由 focus 検証は rigorous
- **[N-TEST-003]** `Dialog.initialFocusRef` の 4 ケース（panel 内 / null / 外部 / alertdialog）すべて実装済み
- **[N-TEST-004]** 既存 6 Dialog の `ariaLabel` assert はゼロ、追従漏れなし

---

## Architecture / Consistency

### Blockers
なし

### Warnings

- **[W-ARCH-001]** `statusId` が未参照（Frontend / A11y と同一）
  - 提案: 削除。

- **[W-ARCH-002]** `viewStatusText` の default 句で `const _exhaustive: never = view; return _exhaustive;` は実行時に到達したら undefined を string として漏らすランタイム穴
  - 場所: `app/components/ingestion/UploadDialog.tsx:114-117`
  - 理由: 慣習的な exhaustive パターンだが「実行時 default に来たら never が返る = undefined」のリスク。CLAUDE.md の「Make illegal states unrepresentable at the type level」志向と弱く緊張。
  - 提案: `throw new Error("unreachable: " + JSON.stringify(view))` で実行時にも防御するか、`_exhaustive satisfies never` で戻り値を不要にする。前者を採用。

### Notes
- **[N-ARCH-001]** plan.md ステップ 1〜10 と ADR-001〜004 はすべて忠実に実装
- **[N-ARCH-002]** 7 つの Dialog 呼び出し元すべてで `useId() + ariaLabelledBy={titleId} + <h2 id={titleId}>` パターン統一、抜けなし
- **[N-ARCH-003]** Frontend のみの変更で hexagonal/DDD の各層に影響なし
- **[N-ARCH-004]** Tailwind utility-first 規約準拠、`sr-only` は既存箇所で使用済み
- **[N-ARCH-005]** CLAUDE.md の「Default to no comments; add only when WHY is non-obvious」方針に対しコメントは WHY 中心で適切
- **[N-ARCH-006]** スコープ外作業の混入なし、`含まれないもの` の項目はすべて見送られている

---

## Design Decisions

このラウンドで見つかった追加 ADR 相当の判断:

- **ADR-001 / ADR-004 の Status 更新** — `Proposed` → `Accepted` に上げる（W-FE-002 への対応として、`Dialog.initialFocusRef` を残す判断を確定させる）

---

## 修正方針

統合すると以下の 7 件を本ラウンドで修正する:

1. **statusId の削除** (W-FE-001 / W-A11Y-001 / W-ARCH-001) — `UploadDialog.tsx` から `const statusId = useId()` と `id={statusId}` を削除
2. **ADR Status 更新** (W-FE-002) — `.issue/256/adr.md` の ADR-001〜004 を `Proposed` → `Accepted` に
3. **initialFocusRefRef のミラー削除** (W-FE-003) — `useRef(initialFocusRef)` のみに変更
4. **preview === null フォールバック時の focus 退避** (W-A11Y-003) — `<p role="alert">` に `tabIndex={-1}` 付与 + ref を用意し、focus effect で fallback 経路追加
5. **テスト D へのコメント追加** (W-TEST-001) — 親子 effect 順序の暗黙前提を明示
6. **multi-file テストのスピンループ修正** (W-TEST-002) — 反復上限 or `vi.runOnlyPendingTimersAsync` で明示フラッシュ
7. **テストの `.toContain` → `.toBe`** (W-TEST-003) — ピン留め強度向上
8. **viewStatusText default 句** (W-ARCH-002) — `throw new Error("unreachable: ...")` で実行時防御

**据え置き / Notes 扱い** (W-A11Y-002): `select` 戻り時の SR 空文字遷移 — manual-test (TC-edge-1) で DOM 上は OK 確認済み、実機 SR 検証は本 PR では実施不可（人手依存）。Notes として記録するに留める。
