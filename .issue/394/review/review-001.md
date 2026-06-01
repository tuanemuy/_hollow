# PR Review #001 — feat(issue/394): 保存ビューの「適用」導線追加と一覧UI整備

**PR:** #403
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 2（要対応に採用）
- Warnings: 3（採用）/ 見送り多数（誤指摘・設計通り）
- Notes: 多数（適用メカニズム・型安全性・スタイル準拠を高評価）
- Verdict: **BLOCKED**（a11y 系の指摘を修正して再レビュー）

3視点（Frontend/UX・Styling/A11y・Correctness/Router）で並列レビュー。

---

## 採用した指摘（このPRで修正）

### Frontend / UX

- **[B-002]** 行内アクション（適用 Link / 名前変更・既定・削除ボタン）が同一文言の繰り返しで、SR がどのビューに対する操作か判別できない。
  - 場所: `index.tsx` 適用 Link 他、行内アクション
  - 提案: 各アクションに `aria-label={`${view.name}を…`}` を付与。
- **[B-003]** `viewIconWrap` のアイコンが `label`（表示モード名）を持つが、すぐ隣の `viewChips` の表示モードチップが同じ文言を読み上げるため二重冗長。
  - 場所: `index.tsx` viewIconWrap の `<Icon ... label={...} />`
  - 提案: アイコンは装飾扱いにして `label` を外す（チップ側が読み上げを担う）。
- **[W-001]** 名前変更のインライン編集に入っても入力欄へ自動フォーカスされず、キーボード操作の手数が増える。
  - 場所: `index.tsx` rename `<input>`
  - 提案: `autoFocus` を付与。

### Styling / A11y / Correctness（複数視点で重複指摘）

- **[B-004 / W-002]** 静的に描画される broken-banner が `role="alert"`（assertive ライブリージョン）を持つ。ライブリージョンはロード後の変化を通知する用途で、ロード時点の静的コンテンツには不適切。さらに行内の validation/server エラー `<p role="alert">`（こちらは動的で適切）と併存すると複数 alert になる。
  - 場所: `index.tsx` broken-banner
  - 提案: broken-banner の `role="alert"` を外す（可視テキスト + 警告配色 + DOM 順で十分知覚可能）。動的なエラー `<p role="alert">` は維持。
- **[W-003 / Correctness W-001]** `Page.tsx` の `kind` prop が `_kind` で未使用化されているが意図がコード上不明確（ルートは依然 `kind` を渡し、`?kind=` も存在）。
  - 場所: `Page.tsx`
  - 提案: 「`kind` は現状未使用。ページは個人/共有を常に両表示する（タブ切替はスコープ外）。後方互換のため prop は維持」と JSDoc で明記。

---

## 見送った指摘（誤指摘 / 設計通り）

- **[B-001]（icon サイズ ≥20 にすべき）** — P20 カンプの banner アイコンは `width=16`。Icon デフォルト16で一致。見送り。
- **[W-004]（viewRow hover が subtle / `bg-surface-hover` にすべき）** — 行のデフォルト背景は透明（ページ bg = `--color-bg` 白）で、`hover:bg-surface`（薄灰）は白→灰の可視変化。P20 カンプ `.view-row:hover { background: var(--color-surface) }` に一致。見送り。
- **[W-005]（適用 Link を isPending で disabled に）** — P20 でも適用は常時 active。ADR-002 の「壊れたビューも適用可」とも整合。設計通り、見送り。
- **[W-006]（テキスト付きボタンの Icon に label を付けない）** — 当該ボタン（保存/キャンセル/名前変更/既定/削除）はアイコン無しのテキストのみ。マーク類の Icon は既に label 無し。指摘が前提を誤っている。見送り。
- **[Styling W-001/W-003]（`text-warning/90` の opacity・コントラスト）** — P20 カンプの broken-detail は `opacity: 0.92`。本実装の `/90` はその意図を反映、レビュアー自身の試算でも AA（≈4.8:1）合格。見送り。

---

## Design Decisions

broken-banner の `role="alert"` 除去（静的コンテンツへのライブリージョン不使用）を adr.md ADR-005 として記録する。
