# 実装計画 — Issue #461: refactor(ui): UIコントロールの寸法（高さ・余白・font-size・角丸）のばらつきを横断で見直す

**Issue:** #461
**作成日:** 2026-06-04
**複雑度:** 中〜大規模

---

## 目的

ボタン・入力欄・チップ・アイコンボタンなど UI コントロールの高さ・横余白・font-size・角丸が画面/コンポーネントごとにばらついている問題を横断で見直す。Tailwind 標準スケール外の任意値（`h-8` / `h-[30px]` / `text-[13px]` / `text-[15px]` / `gap-[5px]` 等）の散在を解消する。

「全部を1つの寸法に強制統一」ではなく、**意図的な差（auth/public の大きめ入力、admin の高密度など）と、なんとなく生まれた差を切り分けて整理**するのがゴール。#460（ボタン形態の方針見直し、CLOSED/MERGED済み）と歩調を合わせる。

## スコープ

### 含まれるもの

- presentation 層: `app/components/**/styles.ts` と各コンポーネント
- `app/styles/tokens.css` / `app/styles/index.css`（必要に応じたトークン化）
- `spec/design/tokens.md` / `spec/design/index.md`（規約への反映）
- 役割カテゴリ（主要ボタン/小型ボタン/アイコンボタン/入力欄/チップ/バッジ/テーブルセル）ごとの寸法棚卸しと、偶発的な差の統一

### 含まれないもの

- ドメイン層・アプリケーション層の変更（不変）
- 意図的な差（auth/public 大型入力 h-11/h-12、admin 高密度 pillBtnSm/テーブル）の強制統一
- ボタン形態の方針自体の見直し（#460 で完了済み）

## 寸法棚卸し表

| 役割カテゴリ | 現状の寸法 | あるべき寸法 | 判断 |
|---|---|---|---|
| **主要ボタン** | `pillBtn` h-9/px-4/text-sm、tall h-12/px-8/text-md | 現状維持（既に原型化・#460/#416で整備済み） | **統一済み・維持** |
| **小型ボタン** | `pillBtnSm` h-7/px-3/text-xs、`BULK_ACTION` h-8/px-3/text-[13px] | `BULK_ACTION` の独自 h-8/text-[13px] を解消し原型に寄せる | **統一** |
| **アイコンボタン（主要/ヘッダー）** | header `ICON_BTN`(layout/styles.ts) w-9 rounded-full、editor toolbar `EDITOR_TOOLBAR_BTN` w-9 **rounded-pill**、`MENU_BTN`(layout/styles.ts) w-9 rounded-md | w-9（36px）維持、角丸はボタン用途の **`rounded-pill`** へ寄せる | **角丸統一**（`rounded-full`→`rounded-pill`、寸法は維持。ADR-003） |
| **アイコンボタン（行アクション）** | dialog close w-8 rounded-full、tree action w-7 rounded-md | 役割差として残す（dialogは§7.1のデスクトップ32px容認例、tree w-7はサイドバー密度） | **意図的差を残す** |
| **アイコンボタン（補助）** | section add w-6 rounded-md、tree disclosure w-5 rounded、NoteCheckbox w-5 rounded-full | w-5/w-6維持（補助は小さくてよい） | **意図的差を残す** |
| **入力欄（標準フォーム）** | `fieldControl` **h未明示**/py-[10px]/text-sm | **h明示**（px-3/text-sm維持） | **統一**（高さ明示が起点） |
| **入力欄（admin）** | 3 Form `h-10`、UsersTable検索 `h-9` | **h-10に統一**（UsersTable検索のh-9を昇格） | **統一**（偶発差） |
| **入力欄（auth/public大型）** | auth h-11、gate h-11、search h-12 | 現状維持 | **意図的差を残す**（タッチ/ヒーロー強調） |
| **小型インライン入力/セレクト** | `FilterBar inputSm`(FilterBar.tsx:202-203) **h-[30px]**/px-2、`tag/TagActions.tsx:71` select **h-[30px]**/px-2.5 | `h-7`(28px) へ寄せ FilterBar の chip と密度統一（-2px） | **統一**（任意値 h-[30px] 解消） |
| **チップ** | `chip` h-7/gap-[5px]/text-xs、`FilterBar CHIP` **h-[30px]**/gap-[5px]/text-[13px] | `chip`原型(h-7)へ寄せる、gap-[5px]→`gap-1.5`、text-[13px]→text-sm置換 | **統一** |
| **バッジ** | `PUB_PILL` px-2/py-0.5/text-[11px] 等 | py標準化、text-[11px]は要判断 | **一部統一** |
| **テーブルセル** | `DATA_ROW` px-3/py-4 等 | 標準スペーシング内なので概ね維持 | **維持** |

## 実装ステップ

### 1. `text-[13px]` を `text-sm` へ統合（新トークンは作らない — ADR-001）

- **対象ファイル:** 56箇所/32ファイル全て。原型定義（`common/styles.ts` fieldLabel/formError、`layout/styles.ts` FIELD_LABEL/FORM_ERROR、`public/styles.ts` 各定数）を先に直し、コンポーネント直書き分を続ける。
- **変更内容:** `text-[13px]` → `text-sm`。`--text-sm` は `clamp(12px, …, 13px)` で**デスクトップ実効値13px**＝視覚値維持。小画面では12pxへ fluid に縮む（既存 `public/styles.ts:59` の `max-sm:text-xs` と同挙動）。`text-[13px] max-sm:text-xs` のように小画面用 utility を手動併記している箇所は、`text-sm` 一本にして冗長な `max-sm:text-xs` を掃除する。
- **理由:** fluid タイポグラフィスケールが SSOT のため、固定px新トークンは思想に逆行（ADR-001）。`text-sm` 統合で任意値を完全排除しつつ視覚値を維持。

### 2. 置換後の小画面リグレッション確認（フォールバック判定）

- **変更内容:** ステップ1の置換後、目視で「小画面で13px→12pxに縮むことで可読性・レイアウトが崩れる箇所」がないか確認する。崩れる箇所が出た場合に限り、その箇所のみ固定トークン新設（ADR-001 のフォールバック (A)）を再検討。
- **理由:** ADR-001 の決定(B)の安全確認。基本は崩れない想定（既存に前例あり）。

### 3. `fieldControl` の高さ明示（textarea 合成を壊さない）

- **対象ファイル:** `app/components/common/styles.ts`（`fieldControl` 定義、164行目）
- **変更内容:** ADR-004 に従い、`py-[10px]` を標準スケール `py-2.5`(=10px・同値) に変換し、先頭に `h-10` を追加（`h-10 px-3 py-2.5 text-sm …`）。`fieldControl` は input だけでなく textarea/select/div field のベースにも合成されるため、**縦 padding は残す**（h-10 は input で height を確定し、textarea では合成側 `min-h-[*]` が上書きするので無害）。現状 input 実効高 ~42px から約2px縮む。テキスト/プレースホルダーの縦位置を目視確認し、崩れる場合のみ `h-11` へ。
- **理由:** Issue最重要指摘。入力欄統一の基準を作り、標準フォームの input 高を 40px に明示。任意値 `py-[10px]` も標準 `py-2.5` へ解消。textarea 合成ケース（`${fieldControl} ${fieldTextarea}` 等）を壊さない。

### 4. admin入力欄の高さ統一（共有プリミティブを含む）

- **対象ファイル:** `app/components/admin/UsersTable/index.tsx:40`、`app/components/layout/styles.ts`（`FIELD_INPUT`:100 / `FIELD_TEXTAREA`:103）
- **変更内容:** ユーザー検索入力の `h-9` → `h-10`。共有プリミティブ `FIELD_INPUT`（`py-2.5` h未明示、`CreateTagForm` 等が使用）に `h-10` を追加（`py-2.5` 維持）。`FIELD_TEXTAREA` は `py-2.5` 維持で高さは合成側 `min-h` に任せる。これで admin 入力高が 40px に真に統一（3 Form ローカル定数 / FIELD_INPUT / UsersTable検索 が全て h-10）。
- **理由:** 偶発的な `h-9` と、共有プリミティブの h未明示（~42px）を標準 `h-10` へ。ステップ3の標準フォームと合わせ 40px に収斂。

### 5. アイコンボタンの角丸・段数整理

- **対象ファイル:** `layout/styles.ts`（`ICON_BTN`/`MENU_BTN`）、editor toolbar（`note/editor/WysiwygEditor.tsx` `EDITOR_TOOLBAR_BTN`）、`common/styles.ts`（`dialogCloseButton`）等
- **変更内容:** ボタン用途の icon-only ボタンの角丸を **`rounded-pill`** に統一（ADR-003。spec の token 用途定義 pill=ボタン に合わせる。`rounded-full`→`rounded-pill`、正方形なので視覚不変）。w-9/w-8/w-7/w-6/w-5 の5段は「主要=w-9 / 行アクション=w-8 / 補助=w-6・w-5」の役割として残し、`MENU_BTN`(layout/styles.ts) と `tree action` の `rounded-md` は角付き行アクションとして**現状維持**（円形へ寄せない）。
- **境界ルール（S-001）:** `rounded-full` のまま残すのは真円装飾に限定する — アバター容器（auth/public のアイコン容器 `w-14/w-[72px]`）、ドット、`NoteCheckbox`、chip 内の `×` 削除ボタン（`FilterBar` の `w-4 h-4 rounded-full`）。これらは「装飾円 or chip 付属要素」であり pill 寄せの対象外。pill へ寄せるのは独立した正方形 icon-only ボタン（`ICON_BTN`/`dialogCloseButton`/`EDITOR_TOOLBAR_BTN`）のみ。
- **理由:** 角丸混在の解消（spec 整合）。寸法は役割差として正当なものを残す。装飾円とボタンの境界を明示し実装のブレを防ぐ。

### 6. チップ・小型インライン入力の統一（原型を先に直す）

- **対象ファイル:** **3つの chip 原型**を定義名で特定 — `common/styles.ts` の `chip`、`layout/styles.ts` の `CHIP`、`note/list/styles.ts` の `CHIP_BASE`（grep の行番号はずれやすいので定義名ベースで）。続いて `note/list/FilterBar.tsx`（`CHIP`:11-12 / `inputSm`:202-203）、`app/components/tag/TagActions.tsx:71`（select）。
- **変更内容:** 先に3つの chip 原型（`chip`/`CHIP`/`CHIP_BASE`）の `gap-[5px]` → `gap-1.5` を**全て**直し（1つでも残すと「原型ごとに 5px/6px 混在」が再発）、その上で FilterBar の CHIP `h-[30px]` を chip 原型（h-7=28px）へ寄せる（-2px）。あわせて小型インライン入力/セレクトの `h-[30px]`（`FilterBar inputSm`、`tag/TagActions` select）も `h-7` へ寄せ、任意値 `h-[30px]` を解消（-2px）。`text-[13px]` はステップ1で `text-sm` に置換済み。**原型を先に直すことで中間不整合を避ける**（S-004）。
- **理由:** FilterBar独自寸法を原型へ集約。`h-[30px]` 任意値を全て解消。3原型併存に注意し原型起点の順序で中間状態の不整合を防ぐ。

### 7. gap/padding任意値の標準化（チップ系とバッジ系を分ける）

- **対象ファイル:** `gap-[5px]`（9ファイル）、`navItem` の `py-[7px]`、`px-[6px]`/`[9px]`/`[10px]` 等
- **変更内容:** **チップ系**の `gap-[5px]` → `gap-1.5`（+1px）。**バッジ系**（admin の `gap-[5px] px-[9px] py-[2px]` セット: `UsersTable`/`Metrics`/`Jobs` 等）は棚卸し表の「バッジ=要判断」に従い、`gap` と `px-[9px]/py-[2px]` の意図を確認してから個別判断（一律置換しない）。高さ明示で不要化できる縦paddingは撤去。micro-adjust系の `px-[*]` は意図を確認のうえ標準値へ寄せ、残すものは残す。
- **理由:** 標準スケールへの収斂。チップとバッジは役割が異なるため粒度を分ける。±1pxの視覚差が出るため目視確認とセット。

### 8. ドキュメント反映

- **対象ファイル:** `spec/design/tokens.md`（新トークン）、`spec/design/index.md`（§7.1にアイコンボタン段数・入力欄高さ方針の棚卸し結果を追記）
- **変更内容:** SSOTミラーとして規約に結果を残す。
- **理由:** Issue進め方5。

## 設計判断

詳細は `adr.md` を参照。

- **`text-[13px]` の解消（ADR-001）** — 新トークンは作らず `text-sm` へ統合する。fluid タイポグラフィスケールが SSOT のため固定px新トークンは思想に逆行。既存 `public/styles.ts:59` の `max-sm:text-xs` 前例が裏付け。崩れる箇所のみフォールバックで固定トークン再検討。
- **`text-[15px]` はトークン化しない（ADR-002）** — 4箇所のみ（public 大型入力2＋PAGE_SUBTITLE＋IngestionJobRow）。public 大型入力は意図的、残り2つは `text-md` 寄せ可否を個別判断。
- **アイコンボタンの段数・角丸（ADR-003）** — 物理的に3値へ強制統一せず役割3カテゴリへ整理。角丸はボタン用途の `rounded-pill` へ寄せる（spec の token 用途定義 pill=ボタンに従う。`rounded-full`→`rounded-pill`、視覚不変）。
- **`fieldControl` の高さ（ADR-004）** — `h-10`(40px) に明示。admin と揃え 40px に収斂。現状実効高 ~42px から約2px縮むため目視確認。

## リスクと注意点

- **意図的差の誤潰し:** auth/public大型入力（h-11/h-12）・admin高密度を機械的に統一すると §7.1 の設計意図を壊す。棚卸し表の「意図的差を残す」行は変更対象から除外。
- **視覚リグレッション:** `gap-[5px]→gap-1.5`(+1px)、`h-[30px]→h-7`(-2px)、`fieldControl` 高さ明示（テキスト/プレースホルダー縦位置に影響しうる）は各画面目視必須。
- **トークン命名の後戻りコスト:** 命名確定後の改名は56箇所の再置換。命名はステップ1でレビュー確定してから一括置換へ。
- **`@theme inline` と `tokens.md` の同期漏れ:** 新トークンは `tokens.css`/`index.css`/`tokens.md` の3点を必ず揃える。管理画面上書き対象（typography scaleは上書き対象外）には含めない。
- **スコープ厳守:** presentation層＋tokens＋spec/designのみ。ドメイン/アプリ層は不変。

## テスト方針

- `pnpm typecheck` → `pnpm lint:fix` → `pnpm format` を変更後に実行。
- 目視確認（画面別）:
  - **ホーム/FilterBar:** チップ高さ・gap、フィルタ入力の縦位置、BulkActionBarのボタン高さ/text
  - **標準フォーム:** `fieldControl` 高さ明示後の入力欄・プレースホルダー縦中央
  - **admin各Form/UsersTable:** 入力欄h-10統一後の整合、テーブル密度
  - **auth/public:** 大型入力（h-11/h-12）が**変わっていない**こと（意図的差の維持確認）
  - **アイコンボタン群:** 角丸統一後に円形が崩れていないか、タッチ床（max-sm:min-h-[44px]）が残っているか
- `text-[13px]` 置換は「デスクトップ実効値13px維持」が前提なので、置換前後でフォントサイズが変わらないことをスポット確認。小画面で12pxへ縮む挙動が崩れを起こさないことも確認。

## レビュー履歴

### 1周目
**修正した点（要件カバレッジ視点 P / アーキ・リスク視点 P）**:
- [P-001 両視点] plan.md ステップ1〜2と ADR-001 の矛盾を解消。ステップ1を「`text-sm` へ統合（新トークンは作らない）」、ステップ2を「小画面リグレッション確認」に一本化。棚卸し表・設計判断セクションも ADR-001(B) に統一。
- [P-002 アーキ] アイコンボタン角丸の寄せ先を `rounded-full` → **`rounded-pill`** に反転。spec の token 用途定義（pill=ボタン、full=アバター/ドット）に従う方向へ ADR-003・棚卸し表・ステップ5 を修正。

**取り込んだ改善提案**:
- [S-001 カバレッジ] ADR-002 の `text-[15px]` 内訳を実コードに合わせて訂正（IngestionJobRow を追加、auth は text-md で対象外と明記）。
- [S-003 カバレッジ] ステップ5 の対象ファイルを `common/styles.ts` → 正しい `layout/styles.ts`（ICON_BTN/MENU_BTN）へ訂正。
- [S-002 カバレッジ / S-004 アーキ] ステップ7 でチップ系とバッジ系を分離。ステップ6 を「原型 chip を先に直す」順序へ修正し中間不整合を回避。
- [S-001/S-002 アーキ] ADR-001 に既存 `public/styles.ts:59` の `max-sm:text-xs` 前例を根拠追加。冗長な `max-sm:text-xs` の掃除をステップ1に明記。
- [S-003 アーキ] `fieldControl` の高さ目標値を ADR-004 として明文化（`h-10`、~42px から約2px縮む点を記録）。

**見送った提案とその理由**:
- なし（全て本Issueスコープ内の妥当な指摘として反映）。

### 2周目
**修正した点（アーキ・リスク視点が3件の要修正を検出。カバレッジ視点は問題点ゼロ）**:
- [P-001 アーキ] `fieldControl` が textarea/select/div field のベースにも合成される事実を反映。当初の「py-[10px] 撤去して h-10」案は textarea で縦padding が消え破綻するため、ADR-004 を「`h-10` 追加＋縦padding（py-2.5）維持」に修正。ステップ3も同方針へ更新。
- [P-002 アーキ] 共有プリミティブ `FIELD_INPUT`/`FIELD_TEXTAREA`(layout/styles.ts、py-2.5 で h未明示) がステップ4から漏れていた問題を解消。ステップ4の対象に追加し、admin 入力高 40px 統一を真に達成。ADR-004 にも記載。
- [P-003 アーキ] `h-[30px]` の非チップ2箇所（`FilterBar inputSm`、`TagActions` select）がどのステップにも未分類だった問題を解消。棚卸し表に「小型インライン入力/セレクト」行を追加し、ステップ6で `h-7` へ寄せる対象に含めた。

**取り込んだ改善提案**:
- [S-001 アーキ] アイコンボタンの `rounded-full` 維持/`rounded-pill` 寄せの境界ルール（装飾円・chip内×ボタンは full 維持、独立 icon ボタンのみ pill 寄せ）をステップ5に明記。
- [S-001 カバレッジ] `MENU_BTN`(rounded-md) は角付き行アクションとして現状維持であることをステップ5に明示。
- [S-002 カバレッジ] textarea 高さの目視確認をテスト方針の射程に含む旨を反映（ADR-004 の textarea 挙動確認）。

**見送った提案とその理由**:
- [S-002 アーキ] 行番号表記の統一（164 vs 165）— 軽微な表記ゆれ。実装に影響しないため定義行（164）に寄せる軽微訂正のみ反映。

### 3周目
**最終確認（アーキ・リスク視点）**: 2周目で検出した3件のP（P-001 textarea合成破綻 / P-002 共有プリミティブ漏れ / P-003 非チップ h-[30px] 未分類）が、いずれも実コードの挙動（`box-sizing:border-box` グローバル適用、min-height が height に勝つ CSS 仕様）に照らして**論理的に正しく解消されている**ことを確認。要修正は残らず、軽微なファイルパス/行番号の誤記のみ引き継ぎ事項として指摘された。

**修正した点**:
- `tag/TagActions.tsx`（誤: `note/list/TagActions.tsx`）へパス訂正。
- chip 原型が3つ併存（`chip` / `CHIP` / `CHIP_BASE`）する点をステップ6に明記し、`gap-[5px]→gap-1.5` を3定義すべてに適用する旨を追加（S-001）。
- grep 行番号がずれやすいため、定義名ベースで特定する方針をステップ6に明記。

**取り込んだ改善提案**:
- [S-002] FilterBar の chip 内 `×` 削除ボタン（`w-4 h-4 rounded-full`）を pill 寄せ対象から除外する目視確認を、ステップ5の境界ルールとして既に反映済み。

**終了**: 3周目で要修正ゼロ（軽微な誤記訂正のみ）。計画は実装可能・スコープ整合と判定し、レビューループを終了する。
