# 実装計画 — Issue #446: admin に残る surface ローカルボタン定義を common pill へ統一（#336 フォローアップ）

**Issue:** #446
**作成日:** 2026-06-04
**複雑度:** 小規模（機械的リファクタ・設計判断は #442/#416/#273 の ADR で既決）

---

## 目的

umbrella #336（UI ボタン・リンク統一）のフォローアップ。#442（PR #445）で common に素 `pillBtn`（surface base, h-9）と `pillBtnSm`（`data-[sm]:` 駆動の h-7 small）の受け皿が揃ったため、これらで寄せられるのに #442 の named scope 外として据え置いた admin の surface ローカルボタン定義 4 つを回収し、admin 全体のボタン SSOT 化を完了させる。

## スコープ

### 含まれるもの

- `app/components/admin/UsersTable/index.tsx` — `BTN_SM_CLASS`（4 call site）を削除し `` `${pillBtn} ${pillBtnSm}` `` + `data-sm=""` へ
- `app/components/admin/Jobs/index.tsx` — `BTN_SM_CLASS`（UsersTable と文字列完全同一・**5 call site**）を削除し同上。※Issue 本文は「4 call site」だが #329（backfill ボタン）マージ後の現状は 5 箇所
- `app/components/admin/LLMSettingsForm/index.tsx` — `BTN_CLASS`（1 call site）を削除し素の `pillBtn` へ
- `app/routes/admin/route.tsx` — `ADMIN_BTN_CLASS`（`<Link>` 2 call site）を削除し素の `pillBtn` へ

### 含まれないもの

- danger/primary variant への変更（対象はすべて surface pill。色変更なし）
- common `styles.ts` への変更（`pillBtn` / `pillBtnSm` は #442 で新設済み・そのまま利用）
- 上記 4 ファイル以外のローカルボタン定義（TAG_BASE など別系統の primitive は対象外）

## 既存パターン（#442 PR #445 と同型）

#442 は DesignTokensForm / PromptsForm でローカル定数を削除し、各 call site に `` className={`${pillBtn} ${pillBtnGhostDanger}`} `` を**直接インライン**展開、`data-ghost-danger=""` を付与した。本 Issue もこの確立パターンに揃える（ローカル const を再導入しない）。

## 視覚同値性の根拠（#442 と同論点）

`BTN_SM_CLASS`（h-7 surface small）/ `BTN_CLASS` / `ADMIN_BTN_CLASS`（h-9 surface）はいずれも `pillBtn`（surface base）と視覚一致する。寄せによる差分は:

- **落ちる:** `duration-[var(--duration-fast)]` / `ease-[var(--ease-standard)]` の明示指定 → #442 ADR-005 で許容済み（`transition-colors` のデフォルト挙動に回帰するのみ）
- **増える（gain）:** `active:scale-[0.985]` 押下フィードバック / `aria-disabled:*`（`<Link>` の disabled 表現用） / `max-sm:min-h-[44px]`（モバイルタップ下限）。small は `pillBtnSm` の `max-sm:min-h-0` でモバイル下限を打ち消す（#442 ADR-004 の意図どおり）
- **hover ガード:** `hover:not-disabled:` → `hover:not-disabled:not-aria-disabled:`。対象 `<button>` は aria-disabled 不使用のため挙動不変。`<Link>`（admin/route）は anchor なので aria-disabled 対応はむしろ正の改善
- **gap:** 旧定義・`pillBtn` ともに `gap-1.5`。`pillBtnSm` は gap 非上書き → アイコン付きボタンの間隔不変

## 実装ステップ

### 1. UsersTable: BTN_SM_CLASS → `${pillBtn} ${pillBtnSm}`

- **対象ファイル:** `app/components/admin/UsersTable/index.tsx`
- **変更内容:**
  - `@/components/common/styles` から `pillBtn, pillBtnSm` を import 追加
  - `const BTN_SM_CLASS = ...`（line 36-37）を削除
  - 4 call site（164/175/186/197）の `className={BTN_SM_CLASS}` を `` className={`${pillBtn} ${pillBtnSm}`} `` + `data-sm=""` へ
- **理由:** surface small の SSOT 化

### 2. Jobs: BTN_SM_CLASS → `${pillBtn} ${pillBtnSm}`

- **対象ファイル:** `app/components/admin/Jobs/index.tsx`
- **変更内容:** ステップ 1 と同じ。call site は 5 箇所（236/322/435/502/585）
- **理由:** UsersTable と文字列完全同一の重複定義を共通 variant へ集約

### 3. LLMSettingsForm: BTN_CLASS → `pillBtn`

- **対象ファイル:** `app/components/admin/LLMSettingsForm/index.tsx`
- **変更内容:**
  - 既存 import（`pillBtn, pillBtnPrimary`）はそのまま（追加 import 不要）
  - `const BTN_CLASS = ...`（line 49-50）を削除
  - 1 call site（399）の `className={BTN_CLASS}` を `className={pillBtn}` へ
- **理由:** h-9 surface の SSOT 化

### 4. admin/route: ADMIN_BTN_CLASS → `pillBtn`

- **対象ファイル:** `app/routes/admin/route.tsx`
- **変更内容:**
  - `@/components/common/styles` から `pillBtn` を import 追加
  - `const ADMIN_BTN_CLASS = ...`（line 42-43）を削除
  - 2 `<Link>` call site（68/86）の `className={ADMIN_BTN_CLASS}` を `className={pillBtn}` へ
- **理由:** h-9 surface（anchor）の SSOT 化。anchor への適用で `aria-disabled` 対応が正に効く

## 設計判断

新規の設計判断なし。すべて先行 Issue の ADR を踏襲:

- 縮小 size を素 utility でなく `data-[sm]:` variant にする理由 → #416 ADR-005 / #442 ADR-003
- `max-sm:min-h-0` でモバイルタップ下限を打ち消す → #442 ADR-004
- duration/ease 明示落ちの許容 → #442 ADR-005

## リスクと注意点

- **視覚回帰:** 生成 CSS の byte-offset で `data-[sm]:` 系が base utility に後勝ちすることを確認（#442 と同じ検証）。`pnpm build` 後の CSS で `h-7`/`px-3`/`text-xs` が `h-9`/`px-4`/`text-sm` より後方にあること。
- **call site 数の差異:** Issue 本文は Jobs を「4 call site」とするが、#329 マージ後の現状は 5。全 5 箇所を漏れなく置換する。
- **`data-sm` 属性付与漏れ:** `pillBtnSm` は `data-[sm]:` 駆動なので、属性を付け忘れると small サイズが効かず h-9 のまま表示される。全 small call site に `data-sm=""` を付与する。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` でコード健全性確認
- `pnpm build` の生成 CSS で variant 後勝ちを確認
- ブラウザで admin 各画面（ユーザー管理 / ジョブ / LLM 設定 / admin トップ）のボタン表示・hover・押下・disabled・small サイズが回帰していないことを確認
