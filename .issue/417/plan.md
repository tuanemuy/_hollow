# 実装計画 — Issue #417: public 画面のボタン系統 (PILL_BTN / GATE_SUBMIT / SEARCH_FORM_BUTTON) を common へ統一する

**Issue:** #417
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

#336 ADR-002 で「public 画面に押下スケールアニメ・disabled ガード等の視覚/挙動変化が新規発生するのを避けるため」据え置いた public ボタン 3 系統を、common pill primitive（`pillBtn` / `pillBtnPrimary` / `pillBtnTall`）の合成へ寄せ、public ボタンの SSOT 化を完結させる。press feedback・disabled ガード等の追加は本 Issue が意図したゴールであり、レイアウト崩れ・色変化の非意図的回帰のみを避ける。

## スコープ

### 含まれるもの

- `app/components/public/styles.ts` の 3 定数を common 合成へ置換
  - `PILL_BTN` → `${pillBtn} ${pillBtnPrimary}`
  - `SEARCH_FORM_BUTTON` → `${pillBtn} ${pillBtnPrimary} absolute right-1.5 top-1.5`（+ 必要なら mobile min-h 打ち消し）
  - `GATE_SUBMIT` → `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full mt-2`
- consumer 側で primary variant を使う送信ボタンに `data-primary=""` を付与
  - `PublicSearch.tsx` の `SEARCH_FORM_BUTTON` ボタン
  - `ShareLinkGate/index.tsx` の `GATE_SUBMIT` ボタン
- `.issue/417/adr.md` に意図的視覚差分・設計判断を記録

### 含まれないもの

- common primitive 自体の変更（auth/note/tag 等 既存 consumer に波及させない）
- public に存在しない danger pill consumer 向けの `pillBtnDanger` append（YAGNI — #416 ADR-004 踏襲）
- authenticated app / auth surface への変更（本 Issue は public surface に閉じる）
- PILL_BTN consumer（全て `<Link>`）への `aria-disabled` 追加（現状 disabled な public Link は存在しない — #416 ADR-004 踏襲）

## 実装ステップ

### 1. `PILL_BTN` を common 合成へ置換

- **対象ファイル:** `app/components/public/styles.ts`（定義）
- **変更内容:** ファイル冒頭に `import { pillBtn, pillBtnPrimary, pillBtnTall } from "../common/styles";` を追加し、
  `export const PILL_BTN = \`${pillBtn} ${pillBtnPrimary}\`;`
- **理由:** 4 consumer のうち ErrorPage の 1 つが `data-primary=""` を使う。common は primary を base に内包せず別 append（`data-[primary]:` variant で base の `bg-surface` を後勝ち上書き）にしているため、`pillBtnPrimary` の append が必須。`data-primary` 無しの consumer では base surface 色がそのまま当たり、1 定数で全 consumer をカバーできる。consumer 側は `className={PILL_BTN}` のまま無変更（ErrorPage の `data-primary=""` も維持）。

### 2. `SEARCH_FORM_BUTTON` を common base + 配置 add-on へ置換

- **対象ファイル:** `app/components/public/styles.ts`（定義）/ `app/components/public/PublicSearch.tsx`（consumer）
- **変更内容:**
  - 定義: `export const SEARCH_FORM_BUTTON = \`${pillBtn} ${pillBtnPrimary} absolute right-1.5 top-1/2 -translate-y-1/2\`;`
  - consumer: `<button type="submit" className={SEARCH_FORM_BUTTON} data-primary="">`
- **マッピング:**
  - 旧 `h-9 px-4 rounded-pill bg-accent text-white text-sm font-medium` = `pillBtn`(h-9/px-4/rounded-pill/text-sm/font-medium) + `pillBtnPrimary`(accent 背景/white 文字)
  - 旧 `hover:bg-accent-hover` = `pillBtnPrimary` の `data-[primary]:hover:not-disabled:not-aria-disabled:bg-accent-hover`
  - レイアウト固有差分は `absolute right-1.5` ＋ **配置を旧 `top-1.5`（固定オフセット）から `top-1/2 -translate-y-1/2`（垂直中央寄せ）へ変更**。これにより base の `max-sm:min-h-[44px]` でボタンが 44px に膨らんでも `h-12`(48px) の input 内に中央配置で収まり（上下 2px 余白）、はみ出さない。中央寄せは同ファイルの `SEARCH_FORM_ICON`（`top-1/2 -translate-y-1/2`）で既に確立済みのパターン。
  - base 由来で新規付与される `inline-flex items-center gap-1.5 whitespace-nowrap transition-colors` は、テキスト単独ボタン（flex 子要素なし）のため視覚実害なし。
- **理由:** accent ボタンは primary variant として表現するのが SSOT。`bg-accent` を素 utility で append すると base `bg-surface` に生成 CSS 順で負ける（#273 ADR-003 の罠）。`data-[primary]:` variant 経由なら確実に勝つ。base の `max-sm:min-h-[44px]` を素 utility（`min-h-0`）で打ち消すのは**縮小方向のため生成 CSS 順で base に負ける**（#416 ADR-005）ので採らず、配置の中央寄せ化で構造的に解決する。

### 3. `GATE_SUBMIT` を common 合成へ置換

- **対象ファイル:** `app/components/public/styles.ts`（定義）/ `app/components/public/ShareLinkGate/index.tsx`（consumer）
- **変更内容:**
  - 定義: `export const GATE_SUBMIT = \`${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full mt-2\`;`
  - consumer: `<button type="submit" className={GATE_SUBMIT} data-primary="" disabled={isPending || isLocked}>`
- **マッピング:**
  - 旧 `w-full rounded-pill bg-accent text-white font-medium` = `pillBtn` + `pillBtnPrimary` + `w-full`
  - 旧 `h-11` / `text-[15px]` → `pillBtnTall`（`h-12 px-8 text-md justify-center`）。auth `BTN_PRIMARY = ${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full` と完全一致の構図（auth `INPUT` も `h-11` で送信ボタンは `h-12`、本 gate と同じ「input h-11 + submit h-12」パターンが #416 で既に確立・マージ済み）。
  - 旧 `hover:not-disabled:bg-accent-hover` = `pillBtnPrimary` の `data-[primary]:hover:not-disabled:not-aria-disabled:bg-accent-hover`
  - 旧 `disabled:opacity-60 disabled:cursor-not-allowed` → base `pillBtn` の `disabled:opacity-55 disabled:cursor-not-allowed`（60→55 の軽微な意図的変化 — #416 ADR-002 と同じ）
  - 固有差分 `mt-2`（size/variant と非競合）を末尾に残す
- **理由:** GATE_SUBMIT は auth `BTN_PRIMARY` と機能的に同型の full-width accent 送信ボタン。auth の先例に揃えるのが SSOT。

### 4. 生成 CSS の後勝ち確認

- **対象ファイル:** （ビルド成果物の確認）
- **変更内容:** `pnpm build` 後の生成 CSS で `data-[primary]:bg-accent` が base `bg-surface` に勝つこと、`pillBtnTall` の `h-12/px-8/text-md`（拡大方向）が base に勝つことを確認。
- **理由:** variant 後勝ち・size add-on の成立は生成 CSS 順依存（#273 ADR-003 / #416 ADR-005）。auth で実証済みだが public 文脈でも確認する。

## 設計判断

詳細は `.issue/417/adr.md` を参照。

- **ADR-001:** GATE_SUBMIT を `pillBtnTall`（h-12）へ寄せる（auth BTN_PRIMARY と統一）。input h-11 + submit h-12 は auth #416 で確立済みパターン。
- **ADR-002:** press scale / disabled ガードの新規付与を意図的差分として受容（#273 ADR-001 / #416 ADR-002,003 の統一方針踏襲）。
- **ADR-003:** danger variant・consumer 側 aria-disabled は追加しない（public に該当 consumer 無し — YAGNI、#416 ADR-004 踏襲）。
- **ADR-004:** SEARCH_FORM_BUTTON の `max-sm:min-h-[44px]` 回帰対策（ブラウザ検証で判断）。

## リスクと注意点

- **【最重要】SEARCH_FORM_BUTTON の `max-sm:min-h-[44px]` による配置崩れ:** base `pillBtn` は `max-sm:min-h-[44px]` を持つ。`SEARCH_FORM_INPUT` は `h-12`(48px)。旧ボタンは `top-1.5`(6px) 固定オフセットで `min-h` 無し。モバイル幅でボタン高さが 44px に膨らむと固定オフセットのままでは 6+44=50px となり input 下端を 2px はみ出す。**対策は配置の垂直中央寄せ化（`top-1/2 -translate-y-1/2`）**: 44px を 48px 内に中央配置すれば上下 2px 余白で収まる（実装ステップ 2）。`max-sm:min-h-0` での打ち消しは縮小方向のため生成 CSS 順で base に負ける（#416 ADR-005）ので採らない。モバイル幅で実機検証する。
- **GATE_SUBMIT 高さ変化（h-11→h-12, 4px 増）:** gate フォームの縦リズムをブラウザ確認。auth に同型先例があるため許容範囲の想定。
- **primary variant の data 属性付け忘れ:** SEARCH_FORM_BUTTON / GATE_SUBMIT は consumer 側に `data-primary=""` 追加が必須。付け忘れると accent が出ず surface 灰色になる（#273 ADR-003 の既知挙動）。ErrorPage の既存 `data-primary=""` は PILL_BTN 経由でそのまま機能。
- **press scale が share gate / search 送信で出る:** 未認証ユーザーに新規押下アニメが見える。reduced-motion では無効。意図的差分として受容。

## テスト方針

public 画面は未認証で到達できるため、ログイン不要でブラウザ検証可能。

- PublicLayout ヘッダ「ログイン」pill（全 public ページ）: 色・hover・押下 scale
- ErrorPage: 「ホームへ戻る」(primary, `data-primary`) accent 維持・「検索ページを開く」(surface) 灰色維持・両者で押下 scale
- UserPublicTop: ページネーション「前へ/次へ」pill の見た目・押下
- PublicSearch: SEARCH_FORM_BUTTON「検索」が accent 維持・**input 内 absolute 配置が PC/モバイル幅で崩れない**こと（min-h 回帰の最重要確認）・hover/press。次ページ pill も確認
- ShareLinkGate: GATE_SUBMIT「閲覧する」accent 維持・disabled 時（送信中/ロック中）に opacity-55 + hover/press 抑止・高さと input の縦リズム
- reduced-motion で press scale が無効化されること
- `pnpm build` / `pnpm typecheck` / `pnpm lint` パス

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク の2視点並列）

**要件カバレッジ視点**: 問題点ゼロ。全 consumer（PublicLayout×1 / ErrorPage×2 / UserPublicTop×2 / PublicSearch×2 / ShareLinkGate×1）の扱いに漏れなし、スコープ外混入なしと確認。

**アーキ・リスク視点**: [P-001] を指摘 — ADR-004 のフォールバック `max-sm:min-h-0` は縮小方向（0 < 44px）のため #416 ADR-005 の制約どおり生成 CSS 順で base `max-sm:min-h-[44px]` に負ける（ビルド済み CSS 実測でも `.min-h-0` が先に出力）。打ち消しが機能しない。

**修正した点**:
- [P-001] への対応: SEARCH_FORM_BUTTON の回帰対策を `min-h-0` 打ち消し → **配置の垂直中央寄せ化（`top-1.5` → `top-1/2 -translate-y-1/2`）** に変更。CSS 順と戦わず、ボタン高さ（36/44px）に依存せず h-12 input 内に収まる構造的解決へ。同ファイル `SEARCH_FORM_ICON` の確立済みパターンを踏襲。実装ステップ2・リスク欄・ADR-004（Proposed→Accepted）に反映。

**取り込んだ改善提案**:
- [S-002/S-003] 等価性の追跡性向上: SEARCH_FORM_BUTTON に base 由来で付く `inline-flex/gap-1.5/whitespace-nowrap` がテキスト単独ボタンで無害な旨を実装ステップ2に明記。GATE_SUBMIT の `text-md` line-height 非ペア（#416 ADR-005 [W-001]）が中央寄せ単一行で無害な旨を ADR-001 に追記。

**見送った提案**:
- [S-001] PILL_BTN の「4 consumer」表記（occurrence 6 / component 4）の数え方明示 — テスト方針で個別ボタンを正しく列挙済みで実害なく、表記変更のみのため見送り。

### 終了
1周目で唯一のブロッカー [P-001] を解消。要件カバレッジ視点は当初から問題点ゼロ。両視点とも解決済みのため、レビューループを1周で終了。
