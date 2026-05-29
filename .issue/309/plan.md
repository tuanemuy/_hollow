# 実装計画 — Issue #309: ボタン形態ガイドライン (#292) 適用: 横断的・大規模適用 (WysiwygEditor / サイドバー / Landing-Auth SVG / auth icon-only)

**Issue:** #309
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

#292（PR #304）で `spec/design/index.md` §7.1 に追加した「ボタン形態の使い分け」ガイドラインを、横断的・大規模適用が必要な 4 領域に適用し、ガイドライン・`Icon` ラッパー方針との整合を取る。4 領域それぞれについて「対応した」または「対応不要と判断した（理由付き）」を記録する。

## スコープ

### 含まれるもの

- **領域1 (WysiwygEditor):** 書式ツールバーを icon-only 化（ユーザー確定: icon-only 採用）
- **領域2 (サイドバー):** テキストのみ維持 + ADR 記録（§7.1 テキストのみ適用例）
- **領域3 (Landing/Auth inline SVG):** LandingPage + auth サーフェス全体（AdminSignUpForm / LoginForm / VerifyEmail / EmailChangeConfirm 等）の装飾 inline SVG を `Icon` ラッパー経由に置換（ユーザー確定: auth 系 SVG 全部置換）
- **領域4 (auth icon-only a11y):** `REVEAL_BTN` のタップ領域 44×44px 化 + `title` 補助 + inline SVG の `Icon` 化（領域3で吸収）

### 含まれないもの

- 純装飾ドット（HERO_EYEBROW の小円、PREVIEW_BAR_DOT 等の CSS/SVG 円形装飾）の Icon 置換 — 線画系アイコンではなく、size 3 段階に丸めると見た目が崩れるため対象外
- 新しいデザイントークンの追加・色設計の変更
- Tiptap エディタの機能追加・ツールバー項目の増減
- サイドバーへのアイコン付与（領域2はテキストのみ維持）

## 実装ステップ

### 1. 領域4: `REVEAL_BTN` のタップ領域を 44px に拡大

- **対象ファイル:** `app/components/auth/styles.ts`
- **変更内容:** `REVEAL_BTN` に `max-sm:min-w-[44px] max-sm:min-h-[44px]` を追加（`w-9 h-9` のデスクトップ寸法は維持）
- **理由:** spec §3 の 44×44px をモバイルで満たす。ADR-003（Dialog 閉じる）・既存 `SECTION_ACTION_BUTTON`/`TREE_ACTION_BUTTON` と同パターンで一貫

### 2. 領域3/4: `AdminSignUpForm` の inline SVG を `Icon` 経由に置換 + icon-only ボタン補強

- **対象ファイル:** `app/components/auth/AdminSignUpForm/index.tsx`
- **変更内容:** `import { Eye, EyeOff, Info } from "lucide-react"`（named import）+ `import { Icon } from "@/components/common/Icon"` を追加。REVEAL_BTN 内の eye SVG を `<Icon icon={showToken ? EyeOff : Eye} size={20} />`（装飾扱い、accessible name は既存の `<button aria-label>` が担う）に置換。`<button>` に `title` を追加（SHOULD）。CALLOUT/FORM_ERROR の info SVG を `<Icon icon={Info} size={20} />`（装飾扱い）に置換
- **理由:** §7.1 import 規約・サイズ SSOT・a11y 契約に整合

### 3. 領域3: `LandingPage` の inline SVG を `Icon` 経由に置換

- **対象ファイル:** `app/components/landing/LandingPage.tsx`
- **変更内容:** lucide named import + `Icon` を import。stroke 系の意味あるアイコン SVG（プレビューサイドアイコン群、FEATURE_ICON 4 つ、TEASER_LINK chevron 等）を `<Icon icon={...} size={...} />` に置換。すべて装飾なので `label` 未指定（`aria-hidden`）。`size` は 16/20/24 の 3 段階に丸める。`w-*`/`h-*` は `Icon` に渡さず、コンテナ側レイアウトクラスは据え置き。純装飾ドット（HERO_EYEBROW の小円等）は CSS/SVG のまま残す
- **理由:** §7.1 import 規約・「色は currentColor 継承」「サイズ 3 段階」に整合。LandingPage は server component だが `Icon` ラッパーは `'use client'` を持たず server-component セーフ（確認済み）

### 4. 領域3: 他 auth ファイルの装飾 inline SVG 置換

- **対象ファイル:** `app/components/auth/LoginForm/index.tsx`、`VerifyEmail/index.tsx`、`EmailChangeConfirm/index.tsx`、その他 auth サーフェスで inline SVG を持つコンポーネント
- **変更内容:** CALLOUT/STATUS_ICON/FORM_ERROR 内の装飾 inline SVG を `Icon` 経由（`Info`/`CheckCircle`/`XCircle`/`AlertCircle`/`ChevronRight` 等、`size={20}` または STATUS_ICON は `size={24}`）に置換。すべて装飾扱い（`aria-hidden`）
- **理由:** ユーザー確定により auth サーフェス全体の inline SVG を統一。完了条件「auth 系の inline SVG → Icon 置換」を徹底

### 5. 領域1: WysiwygEditor 書式ツールバーの icon-only 化

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:** `import { Bold, Italic, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Code, Link2 } from "lucide-react"`（named import）+ `Icon` を import。各 `FormatButton` / Link ボタンの中身を `<Icon icon={...} size={20} />` に置換。既存の `aria-label`（`ariaLabel`）は維持し、`<button>` に `title` を追加（SHOULD）。`aria-pressed` トグルは維持。pillBtn の横長 pill が icon-only に不自然なら正方形寄り（`px` 調整）にする。`max-sm:min-h-[44px]` は既存維持し、44px タップ領域を確認
- **理由:** spec §7.1「高密度ツールバーはアイコンのみが第一候補」「同一ツールバー内では形態を揃える」に整合（ユーザー確定: icon-only 採用）。各機能は別意味のため icon-only MUST「同種を並置しない」には抵触しない

### 6. ADR / 記録

- **対象ファイル:** `.issue/309/adr.md`
- **変更内容:** 領域1（icon-only 化採用）、領域2（テキストのみ維持）、領域3 スコープ（auth 全体置換）、領域4 の実態乖離（password reveal は実在せず Setup Token トグルのみ）を記録
- **理由:** Issue 完了条件「4 領域それぞれについて対応/対応不要が記録されている」を満たす

### 7. 品質ゲート

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。lucide import が named import であり barrel import（`import * as`）が無いことを grep で再確認。`Icon` に `w-*`/`h-*`/`size-*` が渡っていないことを確認
- **理由:** CLAUDE.md の必須手順、Issue 完了条件（barrel import 禁止）

## 設計判断

詳細は `.issue/309/adr.md` を参照。

- **領域1:** icon-only 化を採用（ユーザー確定）。spec §7.1 第一候補かつ高密度ツールバー
- **領域2:** テキストのみ維持。§7.1「サイドバーのセクションタイトルにアイコンを使わない」＋賑やかし禁止原則に整合
- **領域3:** auth サーフェス全体の装飾 inline SVG を置換（ユーザー確定）。純装飾ドットは対象外
- **領域4:** password reveal の実態は AdminSignUpForm の Setup Token トグル 1 件のみ。Issue の「全 auth password reveal」前提と乖離するため過剰対応を避ける

## リスクと注意点

- **視覚回帰:** lucide のアイコン形状は既存ハンドコード SVG と完全一致しない。特に LandingPage は SEO 重要画面。マニュアルテストでスクリーンショット比較
- **WysiwygEditor icon-only 化:** `aria-pressed` トグルの視覚状態（`data-primary`）が icon-only でも判別可能か、pill 形状が適切かを検証
- **barrel import の混入:** `import * as Icons from "lucide-react"` を書かない。完了条件であり grep で再確認
- **`Icon` に寸法ユーティリティを渡さない:** `w-*`/`h-*`/`size-*` は禁止（SSOT は `size` prop）
- **server-component セーフ:** LandingPage は server component。`Icon` が `'use client'` を持たないことは確認済みだが、置換後も維持されるか注意

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す
- 既存 `app/components/common/__tests__/Icon.test.tsx` が緑であること
- マニュアルテスト（manual-test スキル / agent-browser）で主要動線を確認:
  - Landing `/`（未認証）: アイコン描画・レイアウト・`aria-hidden` 維持
  - AdminSignUpForm `/admin/signup`: Setup Token トグルの Eye/EyeOff 切替・モバイル幅 44×44px・`aria-label`/`title`
  - WysiwygEditor: 各書式ボタンのアイコン・`aria-label`・`aria-pressed` トグル・44px タップ領域
  - 他 auth 画面: 装飾アイコン描画・レイアウト崩れなし
- DevTools で lucide import が named（barrel でない）こと、`Icon` に `w-*`/`h-*` が渡っていないことを確認

## アイコンマッピング表（既存 inline SVG → lucide + size）

レビューで「形状が完全一致しない」「中間サイズのスナップ先が曖昧」と指摘されたため、置換対応を明示する。size は §7.1 の 3 段階（16 インライン / 20 アイコンのみ・ダイアログアイキャッチ / 24 空状態アイキャッチ）に丸める。`strokeWidth` は `Icon` 固定の 1.5 になる（現状 1.6〜2.0 から変化）。

| 箇所 | 既存 SVG | 現状px | → lucide | size |
|---|---|---|---|---|
| VerifyEmail/EmailChangeConfirm STATUS_ICON success | checkmark polyline | 36 | `Check` | 24 |
| 同 expired | circle+時計針 | 36 | `Clock` | 24 |
| 同 used/not_found/error | circle+!ドット | 36 | `AlertCircle` | 24 |
| EmailChangeConfirm success 内 warning callout | circle+!ドット | 18 | `AlertCircle` | 20 |
| AdminSignUpForm CALLOUT | circle+!ドット | 20 | `Info` | 20 |
| AdminSignUpForm FORM_ERROR | circle+!ドット | 18 | `AlertCircle` | 20 |
| AdminSignUpForm REVEAL_BTN | eye | 18 | `Eye`/`EyeOff`（トグル） | 20 |
| LoginForm FORM_ERROR | circle+!ドット | 18 | `AlertCircle` | 20 |
| LoginForm 未確認 CALLOUT | phone path | 18 | `MailWarning`（review-001 W-001: 既存の phone は誤用、メール確認文脈に合わせ修正） | 20 |
| LoginForm CALLOUT_ACTION | chevron | 11 | `ChevronRight` | 16 |
| LandingPage PREVIEW_SIDE すべてのノート | 4分割 grid | 16 | `LayoutGrid` | 16 |
| 同 最近更新 | clock | 16 | `Clock` | 16 |
| 同 お気に入り | star | 16 | `Star` | 16 |
| 同 Research/日記 | folder ×2 | 16 | `Folder` | 16 |
| LandingPage FEATURE アップロード | upload | 24 | `Upload` | 24 |
| 同 メタデータ | tag | 24 | `Tag` | 24 |
| 同 公開・共有 | globe | 24 | `Globe` | 24 |
| 同 エクスポート | download | 24 | `Download` | 24 |
| LandingPage TEASER_LINK | chevron | 14 | `ChevronRight` | 16 |
| WysiwygEditor Bold/Italic/Strike | テキスト | — | `Bold`/`Italic`/`Strikethrough` | 20 |
| 同 H2/H3 | テキスト | — | `Heading2`/`Heading3` | 20 |
| 同 UL/OL | テキスト | — | `List`/`ListOrdered` | 20 |
| 同 Quote/Code | テキスト | — | `Quote`/`Code` | 20 |
| 同 Link | テキスト | — | `Link2` | 20 |

**置換対象外（純装飾、ADR-004）:** HERO_EYEBROW の塗り円（11px `fill=currentColor`）、PREVIEW_BAR_DOT / PUB_DOT（CSS の塗り円）。線画系アイコンではないため Icon 化しない。

## レビュー履歴

### 1周目
**修正した点:**
- [要件P-001 / アーキ S-002] WysiwygEditor icon-only 化の 44px は高さだけでなく**幅**も必要。`pillBtn` の `px-4` を上書きできない（Tailwind の生成順で px-4 が勝つ）ため、共有 `pillBtn` を編集せず WysiwygEditor 内に正方形の専用スタイル `EDITOR_TOOLBAR_BTN`（`h-9 w-9 justify-center ... max-sm:min-w-[44px] max-sm:min-h-[44px]` + data-primary 状態）を定義する方針を Step5 で確定（ADR-001 / ADR-006 に記録）
- [アーキ P-001] STATUS_ICON は 36px だが `Icon` の最大は 24px。size=24（空状態アイキャッチ tier）で置換し、36→24 の縮小を許容することを ADR-006 に記録、リスク・マニュアルテストに追加
- [アーキ P-002] 中間サイズ（11/18/20px）のスナップ先を上記マッピング表で確定。`strokeWidth` が 1.5 固定になる点もリスクに明記
- [アーキ P-003] REVEAL_BTN の Eye→EyeOff トグル化はスコープ追加（現状は形状非トグル）。ADR-005 に追記
- [要件 S-001] WysiwygEditor 全 10 ボタンに `title`（ariaLabel と同文言）を付与する旨を Step5 に明示
- [要件 S-003] DirectorySidebarSection もテキストのみ維持の判断対象に含めることを ADR-002 に明記

**取り込んだ改善提案:**
- [アーキ S-001] LandingPage の既存 SVG → lucide 対応をマッピング表として記録（#292 ADR-006 の件数乖離記録と同精神）

**見送った提案とその理由:**
- なし（全提案を反映または記録）

### 2周目
未実施（1周目の指摘をすべて反映したため、実装フェーズに進む。残課題なし）
