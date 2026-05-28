# PR Review #001 — feat(issue/257): upload modal responsive fixes

**PR:** #270
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9
- Notes: 多数（後述）
- Verdict: **BLOCKED**（Warning 9 件をすべて対処してから APPROVED 判定）

---

## Frontend

### Blockers
なし

### Warnings

- **[W-F-001]** `pillBtn` の `max-sm:min-h-[44px]` がデスクトップ時の `h-9` と組み合わさったときの height 計算がブラウザ実装差で揺れる懸念
  - 場所: `app/components/common/styles.ts:13`
  - 理由: CSS 仕様上は `min-height` が `height` を上書きするため最終 44px に達する。ただし `inline-flex` / `<a>` 等で稀にブラウザ実装差が報告される
  - 提案: 必須ではない。現状で機能的には正しいため、ADR メモ追記のみで十分

- **[W-F-002]** `dialog` の panel が `viewport-fit=cover` 環境下で notch / Dynamic Island に重畳する可能性（IngestionPreviewForm 以外の Dialog consumer で顕在化）
  - 場所: `app/components/common/styles.ts:56`
  - 理由: `max-h-[90vh]` のままなので、横向き iPhone で panel 上端が status bar / notch 領域に被る可能性
  - 提案: `max-h-[calc(90vh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]` 等の調整は別 Issue として切り出すのが妥当

- **[W-F-003]** action bar の `py-4` + `pb-[max(1rem,env(safe-area-inset-bottom))]` が CSS cascade 出力順に依存している
  - 場所: `app/components/ingestion/IngestionPreviewForm.tsx:330`
  - 理由: 現状の Tailwind v4 では `pb-[...]` が `py-4` を上書きする出力順だが、将来仕様変更があると silent regression する
  - 提案: `py-4` を `pt-4` に変えて `pb-[...]` と独立宣言にする

### Notes
- **[N-F-001]** ADR-001 の判断と実コードの flex 配置が完全に整合
- **[N-F-002]** structural regression test が ADR-001 の運用ルールを CI で守るガード
- **[N-F-003]** `-mx-6 px-6` で panel padding 外までスクロール領域を広げる手法は視覚的整合性を高める良い設計
- **[N-F-004]** 他 7 つの Dialog consumer は `flex flex-col` 化で副作用なし
- **[N-F-005]** `pillBtn` への `max-sm:min-h-[44px]` 追加が `pillBtnDanger` にも自動波及する設計は意図どおり

---

## Accessibility / Responsive Design

### Blockers
なし

### Warnings

- **[W-A-001]** スクロール領域に `overscroll-behavior: contain` が未指定で、iOS Safari の momentum scroll が panel level に bleed-through する可能性
  - 場所: `app/components/ingestion/IngestionPreviewForm.tsx:223`
  - 理由: 長い本文 + 短いビューポート（iPhone SE 横向き 337px 等）で scroll boundary に達したとき、iOS Safari の慣性スクロールが panel の `overflow-y-auto` を rubber-band させる
  - 提案: scroll area に `overscroll-contain` を追加し scroll chain を form 内で閉じる

- **[W-A-002]** manual-test の editing view 検証 SKIP のまま PR が提出されており、44px 計測・safe-area 目視・action bar 浮き解消の確認責任が PR レビュアーに曖昧に転嫁されている
  - 場所: `.issue/257/manual-test/results/TC-002.md`
  - 理由: 静的検証では「class 文字列の存在」しか検証できず、レンダリング上 44px に到達しているか、`env(safe-area-inset-bottom)` が iOS で解決されるかは確認できていない
  - 提案: PR body の Test plan セクションに「マージ前条件」として DevTools レスポンシブモードでの 3 項目確認を明記する

- **[W-A-003]** Dialog title `<h2>` と form 内スクロール領域の間に視覚的な仕切りが無く、スクロール時の affordance が弱い
  - 場所: `app/components/ingestion/UploadDialog.tsx:317` + `IngestionPreviewForm.tsx:222-223`
  - 理由: スクロール開始時に title 直下のコンテンツが切れる視覚的シグナルが弱い
  - 提案: 別 Issue として scroll cue（影グラデーション）追加を切り出す

### Notes
- **[N-A-001]** `pillBtn` の `max-sm:min-h-[44px]` で WCAG 2.5.5 Target Size を満たすアプローチは正しい
- **[N-A-002]** Dialog の focus trap は flex column 化後も影響を受けない
- **[N-A-003]** viewport-fit=cover + safe-area-inset-bottom の組み合わせは堅実
- **[N-A-004]** Tailwind v4 のクラス順は出現順と完全一致するため `pb-[...]` で `py-4` の bottom を意図通り上書き
- **[N-A-005]** `flex flex-wrap justify-end gap-2` で i18n 伸長時も右寄せ wrap で崩れない
- **[N-A-006]** `prefers-reduced-motion` 対応は既存パターンを維持

---

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** structural regression test が「**復活を防ぐ**」方向の負側 assertion しか持たず、構造維持の正側を検証していない
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:472-485`
  - 理由: スクロール領域の `flex-1 min-h-0 overflow-y-auto` 自体が消えても、`flex-shrink-0` が消えても、テストは緑のまま通る
  - 提案: 正側 assertion を追加（scroll wrapper の存在、`flex-shrink-0` の存在）

- **[W-T-002]** `submit.parentElement` 直参照は構造リファクタで silent break する
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:475-476`
  - 理由: submit ボタンを wrapper で包んだ瞬間ズレるが、`not.toContain` 系なので偽陰性で見逃す
  - 提案: `closest("div.flex-shrink-0")` で構造的意図を明示する

- **[W-T-003]** `not.toContain("overflow-y-auto")` 単独 assertion は過剰
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:484`
  - 理由: `max-h-` 無しで `overflow-y-auto` を持つだけなら内部スクロールは発生しないため、これだけで false positive 化する
  - 提案: `not.toMatch(/max-h-\[\d+px\]/)` の正規表現に置換し意図を強める

### Notes
- **[N-T-001]** WHY コメントが秀逸。5 年後の読み手にも意図が伝わる
- **[N-T-002]** mock 戦略が既存パターンと完全一致
- **[N-T-003]** 2533 件 PASS。`document.body.querySelector` ベースの祖先非依存クエリが堅牢
- **[N-T-004]** Dialog.test / UploadDialog.test の調整不要判断は妥当
- **[N-T-005]** `pillBtn 44px` / `viewport-fit=cover` の自動テスト化見送りはコスト対効果で合理的

---

## Design Decisions

### このラウンドで見つかった設計判断

- **scope の切り出し**: `[W-F-002]`（Dialog panel の notch 重畳）と `[W-A-003]`（title と scroll の仕切り）は本 Issue の意図（Resp-H1 二重スクロール + Resp-H2 44px + safe-area-inset）の境界の外側にあり、対応すると本 Issue が肥大化する。Phase 4 で別 Issue 起票

- **`[W-F-001]` の扱い**: 現状で機能的に正しく、ブラウザ実装差は理論上の懸念のため修正せず ADR メモ（adr.md ADR-002 に追記）に残すだけで十分と判断

### 即時修正する Warnings

- [W-F-003]: `py-4` → `pt-4` 分離
- [W-A-001]: scroll area に `overscroll-contain` 追加
- [W-A-002]: PR body の Test plan セクション強化
- [W-T-001]: 正側 assertion 追加
- [W-T-002]: action bar 取得を `closest("[data-action-bar]")` ベースに（`data-action-bar=""` 付与）
- [W-T-003]: `overflow-y-auto` チェックを正規表現に置換

### 別 Issue 起票（Phase 4 で実施）

- [W-F-002]: Dialog panel の safe-area-inset 横向き対応
- [W-A-003]: Dialog scroll の affordance（scroll cue）
