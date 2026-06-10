# 実装計画 — Issue #633: モバイルボタンのサイズ整合性改善: 指針からpx値の明示を撤廃し、モック・実装を統一的に修正

**Issue:** #633
**作成日:** 2026-06-10
**複雑度:** 中〜大規模

---

## 目的

デザイン指針（`spec/design/index.md`）が「タッチで押し間違えない」という**意図**ではなく `44px` / `24px` という**具体 px 値**を SSOT として規定してしまっているため、その値が実装・モックの各所に直書きで散在し、ボタンと input・小型ボタン・横並び要素の間でサイズ不整合（desktop の 4px ずれ、モバイルでの膨張、床解除例外の増殖）を生んでいる。

これを次の3点で解消する:

1. 指針からサイズの明示を撤廃し、意図ベースの記述に改める。
2. モバイルボタンのサイズを全体で一貫した方針に統一する（実装）。
3. モック（`spec/design/pages/*.html` + `mobile/*.html`）を同一方針に揃え、実装と一致させる。

## スコープ

### 含まれるもの

- `spec/design/index.md` の §3 / §7.1 / 寸法ノーマライズ節 / 行225 から `24×24px` / `44×44px` / `max-sm:min-h-[44px]` 等の具体値・具体実装手段の明示を撤廃し、意図 + WCAG 二段（AA 2.5.8 / AAA 2.5.5）の参照のみに改める。
- `app/components/common/styles.ts` を中心に、ボタン実高を input(`h-10`=40px) と整合させ、タッチ床を共通定数に集約。
- 散在する `max-sm:min-h-[44px]` / `max-sm:min-w-[44px]` を共通定数参照へ置換（auth, layout, directory, note/list, note/editor, public, tag, view, publication）。
- 小型ボタンの「44px 床解除」例外を opt-in 反転（`pillBtnSmDense` 新設、`!important` 床回復の撤去）。
- モック HTML（desktop + mobile）の `min-height: 44px` / `height: 44px` 等を統一方針へ整え直す。

### 含まれないもの

- ボタン・input 以外のコンポーネントのサイズ見直し（役割差として残る `pillBtnTall` h-12、auth `h-11`、public ヒーロー h-12、admin 高密度 h-7 等の意図的差は据え置き）。
- `spec/design/drafts/*.html`（ドラフトは履歴成果物。改変しない）。
- `spec/design/review/*.md`（レビュー履歴。改変しない）。
- 新規デザイントークンの追加（既存スケールに収斂）。

## 確定した設計判断（ユーザー確認済み）

- **ボタン実高**: 案2 採用 — `pillBtn` を `h-9`(36px) → `h-10`(40px) に統一し input と揃える。
- **例外整理**: 案C 採用 — 小型ボタンの床解除をデフォルトから外し、admin 密度用に `pillBtnSmDense` を opt-in 新設。`!important` 床回復群を撤去する。

詳細・トレードオフは `.issue/633/adr.md` 参照。

## 実装ステップ

### 1. 指針の px 撤廃（`spec/design/index.md`）

> 注: §3・§7.1 は既に「意図は『タッチで押し間違えない』」「WCAG の二段で考える」という意図ベースの骨格で書かれている。本ステップはゼロからの書き換えではなく、**残存する具体 px 値（`24×24px` / `44×44px`）と実装手段の明示（`max-sm:min-h-[44px]` 等）を除去する差分作業**である。

- **対象ファイル:** `spec/design/index.md`
- **変更内容:**
  - §3「タッチターゲット」（行79）: `24 × 24px` / `44 × 44px` の数値と `max-sm:min-h-[44px]` の実装手段明示を削除。「譲れない床は WCAG 2.5.8 Target Size (Minimum) AA、望ましい目標は 2.5.5 Target Size (Enhanced) AAA。タッチ主体（モバイル / `pointer: coarse`）では目標を確保し、デスクトップ専用の密度優先 UI（admin 等）は床を許容する（AA 未満は不可）」という意図ベース＋条文参照に改める。
  - §3 行82「タッチ床44px」、行225「44px タップ領域の確保」の px 表現を意図表現に置換。
  - §7.1「タップ領域」（行177-189）: `24×24px` / `44×44px` の数値明示、および `max-sm:min-h-[44px]` / `data-[sm]:max-sm:min-h-0` / `w-8 h-8` の具体記述を撤廃。意図と二段の考え方のみ残し、実装手段は `common/styles.ts` の共通定数（`TOUCH_TARGET`）を SSOT として参照する形に改める。
  - 寸法ノーマライズ節（#461 由来）: 「input とボタンの標準高さを `h-10` に統一」へ改訂（旧: input 40 / ボタン 36 の二系統）。
- **理由:** Issue ゴール「指針はサイズ値を明示せず意図のみ示す」。4箇所が相互参照しているため一括で意図ベースに揃える。

### 2. 共通定数の導入とボタン実高統一（`app/components/common/styles.ts`）

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:**
  - タッチ床を共通定数として定義: `TOUCH_TARGET = "max-sm:min-h-[44px]"`、`TOUCH_TARGET_SQUARE = "max-sm:min-w-[44px] max-sm:min-h-[44px]"`（値の SSOT 化）。
  - `pillBtn`（行22）: `h-9` → `h-10`、直書き床を `TOUCH_TARGET` 参照に。
  - `pillBtnIcon`（行164-165）: 正方形維持のため `data-[icon]:w-9` → `data-[icon]:w-10`（`pillBtn` が `h-10` になるため）。床を `TOUCH_TARGET` の `min-w` 側参照に。
  - `pillBtnSm`（行139-140）: `data-[sm]:max-sm:min-h-0`（床解除）を**外す**。残す部分は `data-[sm]:h-7 data-[sm]:px-3 data-[sm]:text-xs`。これにより小型ボタンはデフォルトでモバイル44床（base `pillBtn` の `TOUCH_TARGET`）を持つ。
  - 新設 `pillBtnSmDense`: `pillBtnSm` のサイズ変種に**加えて** `data-[sm]:max-sm:min-h-0`（床解除）を含む admin 密度用 opt-in 変種。確定文字列・data 属性契約は ADR-003 を参照（消費側は `data-sm=""` を維持する必要がある）。床解除トークン `data-[sm]:max-sm:min-h-0` の所在を `pillBtnSmDense` 1箇所に集約する。
  - `fieldControl`（行228-229）: `h-10` 据え置き、直書き床を `TOUCH_TARGET` 参照に。
  - `dialogCloseButton`（行283-284）: 直書き床を `TOUCH_TARGET_SQUARE` 参照に。
  - `pillBtnTall`（行107 h-12）: 床以上で inert、据え置き。
  - JSDoc のコメントを新方針に合わせて更新（44px 直値への言及を意図表現＋定数参照へ）。
- **理由:** desktop 4px ずれ解消、値の SSOT 集約、床解除例外の opt-in 反転。

### 3. 各ボタンコンポーネントへの方針適用（実装側）

> 行番号は実装時にずれる前提。対象はシンボル名基準で扱う。実装着手前に `max-sm:min-h-\[44px\]` / `max-sm:min-w-\[44px\]` / `data-\[sm\]:max-sm:min-h-0` と `pillBtnSm` 消費箇所を grep で棚卸しし、漏れを潰す。

**3a. 直書きタッチ床の定数参照化**（シンボル基準）:
  - `auth/styles.ts`（パスワード表示トグル）
  - `layout/styles.ts`（`HEADER_ICON_BTN` / ハンバーガー）
  - `directory/styles.ts`（行アクション / caret）
  - `note/list/styles.ts`（ディレクトリピル系）
  - `note/list/BulkActionBar.tsx`
  - `note/list/NoteCheckbox.tsx`
  - `note/editor/WysiwygEditor.tsx`（ツールバー）
  - `public/styles.ts`（**実コードで床を持つのは `shareTab` 系の1箇所のみ**。コメント行の `max-sm:min-h-[44px]` 言及は JSDoc 更新として扱う）
  - `tag/styles.ts`（タブ / アクション）
  - `view/SavedViewsList/styles.ts`
  - `publication/styles.ts`（`w-7 h-7` アクション）
  - 変更内容: 直書き `max-sm:min-h-[44px]` / `max-sm:min-w-[44px]` を `TOUCH_TARGET` / `TOUCH_TARGET_SQUARE`（`common/styles.ts` からの import）に置換。

**3b. `pillBtnSm` 消費者の棚卸しと振り分け**（案C の波及）:
  - 床解除を base から外したことで、`data-sm` を持つ全ボタンがデフォルトでモバイル44床を獲得する。`pillBtnSm` 消費者を grep で全て洗い出し、次の方針で振り分ける:
    - **admin（密度優先）**: `admin/Jobs/index.tsx`、`admin/UsersTable/index.tsx`、`admin/DesignTokensForm/index.tsx` の行アクション → `pillBtnSmDense` に切り替え、`[&>button]:max-sm:min-h-[44px]!`（`!important` 床回復、ADR-007 由来）を撤去。
    - **非 admin（床獲得が正しい挙動）**: `identity/styles.ts`（`BTN_SM` / `BTN_SM_DANGER`、ProfileForm / SecurityForm が消費）、`publication/PublishSettings/index.tsx`（`pillBtn + pillBtnSm` のボタン群）→ `pillBtnSm` のまま据え置き。モバイルで 36→44 に膨張するが、これは案C が意図する正しい挙動。
  - **`publication/styles.ts` の `LINK_MINI_ROW`**: ラッパー側の `[&>button]:max-sm:min-h-[44px]`（`!important` なし、#589 ADR-007 が「`data-[sm]:max-sm:min-h-0` に負ける latent bug」と記録）は、案C で床解除トークンが消えることにより base 床が普通に効くようになり**不要化する**。撤去（または JSDoc を「base 床が効くため回復不要」へ更新）する。
- **理由:** 値の重複排除と「散在する床解除例外」の集約（Issue「例外の増殖」への対応）。LINK_MINI_ROW の潜在バグも本 Issue で自動解消する。

### 4. モック側の統一（`spec/design/pages/*.html` + `mobile/*.html`）

- **対象ファイル:** `spec/design/pages/*.html`（約49）+ `spec/design/pages/mobile/*.html`（約49）
- **変更内容（2段階に分ける）:**
  - **(a) グローバル mobile fix ブロックの統一**: 各モックの `@media (max-width: 639px)` 内のグローバル床指定を、`mobile/P10-home.html` の改良版（床対象を `.pill-btn` / `.icon-btn` / `a.pill-btn` / `[role=button]` に限定し、裸 `button`・チップ・チェックは個別指定。コメント付き）に全モックで統一。
  - **(b) 個別インライン指定の整理**: `.bulk-action` / `.token-input` / `.editing-close` 等のローカル `height: 44px` / `min-height: 44px` を、対象セレクタを列挙してから実装の統一方針（ボタン実高 40px + タッチ床は min-height で担保）に合わせて整える。一括 sed では非対称ファイル（後述）や blanket 版 / 限定版の混在で事故るため、(a)→(b) の順で進める。
  - **非対称ファイルの事前列挙**: desktop と mobile で basename が 1:1 でないファイル（`mobile/P13a-upload-modal.html` 等、desktop に対応なし）を実装前に `ls` で列挙し、個別に確認する。
- **理由:** モック↔実装一致、モック内の方針割れ（blanket 適用版 vs 限定版）の解消。

### 5. ADR の記録（`.issue/633/adr.md`）

- **対象ファイル:** `.issue/633/adr.md`（新規）
- **変更内容:** 統一方針の決定、desktop 4px ずれの解消、`data-[sm]:max-sm:min-h-0` 例外の opt-in 反転、`!important` 床回復の廃止を ADR 化。既存 #292(ADR-003/005) / #425(ADR-003) / #589(ADR-007) / #461 の判断を上書きする箇所を明示。
- **理由:** 指針改訂の根拠を残す。

## リスクと注意点

- **CSS specificity の罠**: Tailwind v4 の生成 CSS ソース順依存（既存 ADR が繰り返し警告）。`!important` 撤去後に admin 行アクションが意図通り密度を保つか、小型ボタンがモバイルで44床を持つかをブラウザ実測で確認（ADR-007 は目視実測の前例あり）。
- **`h-9`→`h-10` の波及**: 全ピルボタン（ヘッダー・ツールバー・一括操作バー・ダイアログアクション等）の縦寸に効く。`pillBtnIcon` は `w-9`→`w-10` 化を忘れず正方形を維持（忘れると `h-10 w-9` の縦長になる）。`pillBtnSm`/`pillBtnTall` の add-on が `h-10` 前提で破綻しないか確認。
- **モック↔実装の対応漏れ**: 約98 HTML を漏れなく。非対称ファイル（`mobile/P13a-upload-modal.html` 等、desktop に対応なし）に注意。
- **admin 密度の扱い**: P40-47 はモバイル想定が薄い。`pillBtnSmDense` opt-in 漏れで admin 行アクションがモバイルで膨張しないよう、Jobs/UsersTable/DesignTokensForm の全アクション行を確認。
- **指針改訂の連鎖参照**: §3・§7.1・寸法ノーマライズ・行225 が相互参照。4箇所一括で意図ベースに揃える（1箇所だけ消すと残った数値と矛盾）。

## テスト方針

ブラウザ目視（manual-test）必須（specificity は実機でしか確証できない）。観点:

- モバイル幅（390px、320/430px境界）で `pillBtn` 実高が40 + タッチ床44min-h で描画されるか。
- input(`fieldControl` h-10) と隣接 `pillBtn` の下端が desktop で揃うか（4pxずれ解消）。
- 小型ボタン(`pillBtnSm`)がモバイルで44床を持ち、admin の `pillBtnSmDense` だけが密度を保つか（`!important` 撤去後の回帰確認）。
- `pillBtnIcon` がモバイルで44×44正方形を保つか。
- 各モックを 320〜430px で開き overflow=0、ボタン群の膨張・密度崩壊なし、同一 basename の desktop/mobile が方針一致。
- WCAG: 全タッチ要素 ≥24px（AA）、タッチ主体は44目標達成。
- typecheck / lint / format / 既存テストが通ること。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点**:
- P-A（pillBtnSm 非admin消費者漏れ）: Step 3 を 3a/3b に分割し、`identity/styles.ts`（BTN_SM/BTN_SM_DANGER）と `publication/PublishSettings` を「非admin = 新デフォルト床のまま据え置き（膨張は正しい挙動）」、admin のみ `pillBtnSmDense` 切替＋`!important`撤去、と明記。ADR-003 にも波及を記録。
- P-B（LINK_MINI_ROW 潜在バグ）: Step 3b に `publication/styles.ts` の `LINK_MINI_ROW` 床回復を案C適用後に撤去（不要化）する旨を追加。ADR-003 に #589 ADR-007 の latent bug が自動解消する旨を記録。
- P-C（pillBtnSmDense の data 属性契約未定義）: Step 2 と ADR-003 に確定文字列（`pillBtnSm` から床解除除去、`pillBtnSmDense` = サイズ変種＋床解除、消費側は `data-sm=""` 維持必須、specificity の勝敗根拠）を明記。
- P-D（public/styles.ts 行番号ずれ）: Step 3 全体をシンボル基準に変更。`public/styles.ts` は実コードで床を持つのは `shareTab` 系1箇所のみ、コメント言及は JSDoc 更新扱い、と訂正。
- S-A（spec が実装定数名を参照＝依存方向逆転）: ADR-001 を「指針本文に定数名を書かず『タッチ床を共通化』とだけ述べる」に修正。
- S-B（spec は既に意図ベース骨格あり）: Step 1 に「ゼロ書き換えではなく px・実装手段の除去差分」と注記。

**取り込んだ改善提案**:
- S-003（モック作業の2段階分割）: Step 4 を (a) グローバル fix 統一 → (b) 個別インライン整理 の順に分割し、非対称ファイルの事前列挙を追加。

**見送った提案とその理由**:
- なし（全指摘を反映）。

設計判断はユーザー確認済み（案2 / 案C）で確定しているため、1周で両視点の指摘を反映し終了とする。要件カバレッジ・アーキ整合とも、反映後は問題点ゼロの状態。
