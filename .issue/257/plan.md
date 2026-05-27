# 実装計画 — Issue #257: アップロードモーダルのレスポンシブ改善（モバイル44px・二重スクロール・action bar 配置）

**Issue:** #257
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

PR #251（Issue #226）の design-review で検出されたレスポンシブ高優先度項目を解消する。

- **Resp-H1**: アップロードモーダル（`Dialog` panel + `IngestionPreviewForm`）の二重スクロール / sticky action bar の浮きを解消し、スクロールコンテナを 1 つに統一する
- **Resp-H2 + Critique H-4**: モバイル `min-h-[44px]` を pill ボタンスタイルで揃え、`UploadDialog` 系のボタンタッチターゲットを 44px 以上に揃える
- safe-area-inset 対応（iOS notch / Android nav bar）

## スコープ

### 含まれるもの
- `app/components/common/styles.ts` の `pillBtn` にモバイル `min-h-[44px]` を追加（`PILL_BTN` と揃える）— `pillBtnDanger` が `${pillBtn} ...` で拡張するため波及あり（意図どおり）
- `app/components/common/styles.ts` の `dialog` に `flex flex-col` を追加（panel を flex column コンテナ化）
- `app/core/presentation/head.ts` の viewport meta に `viewport-fit=cover` を追加（iOS Safari で `env(safe-area-inset-*)` を有効化する前提）
- `app/components/ingestion/IngestionPreviewForm.tsx` のレイアウトを「スクロール領域 + 固定 action bar」の flex column 構造に書き換え：
  - 本文プレビューの `max-h-[240px] overflow-y-auto` を撤廃（panel 内の単一スクロール領域に集約）
  - action bar を `sticky bottom-0` から `flex-shrink-0`（flex 最下端固定）に変更
  - action bar の `padding-bottom` に `max(1rem, env(safe-area-inset-bottom))` を適用
- 既存テスト（`__tests__/IngestionPreviewForm.test.tsx`, `__tests__/UploadDialog.test.tsx`, `__tests__/Dialog.test.tsx`）の調整
- structural regression test 1 本追加：`IngestionPreviewForm` の action bar が `sticky` クラスを持たないこと / 本文プレビューが `max-h-[240px]` クラスを持たないことの assertion

### 含まれないもの
- `pillBtn` (common/styles.ts) と `PILL_BTN` (layout/styles.ts) の**統合**（撤廃）。Issue 提案にあるが、`PILL_BTN` は 16 ファイル以上で参照されており影響範囲が広く、本 Issue の意図（44px 不揃いの解消）はモバイル `min-h` を片方に揃えるだけで達成できる。統合は別 Issue へ → **Phase 4 で本リポジトリに別 Issue を起票**
- `IngestionJobRow`（取り込みキューカード）の action bar / スクロール構造変更（モーダルではなくページ内コンテンツのため Issue 範囲外）
- `Dialog` API（props）の拡張（slot 化など）。`dialog` クラスへの `flex flex-col` 付与だけで足りる
- viewport-fit=cover を入れた影響で notch 領域に背景が露出する場合の本格対応（body 背景が `--color-bg` に統一されている現状で実用上問題ない想定）。Phase 2 で目視確認

## 調査結果

### 関連ファイル

- `app/components/common/Dialog.tsx` — モーダル wrapper（focus trap / portal / scroll lock）。panel に `dialog` クラスを適用し `max-h-[90vh] overflow-y-auto` でスクロールコンテナになっている
- `app/components/common/styles.ts` — `dialog` / `dialogBackdrop` / `dialogCloseButton` / `pillBtn` / `pillBtnPrimary` / `pillBtnDanger`
- `app/components/layout/styles.ts` — `PILL_BTN` / `ICON_BTN`（モバイル `min-w/min-h-[44px]` あり）
- `app/components/ingestion/IngestionPreviewForm.tsx` — 本文プレビュー（`max-h-[240px] overflow-y-auto`、audit が `max-h-[280px]` と書いているのは古い記述。現コードは 240px。本 Issue で撤廃するため結果に影響なし）と sticky bottom action bar を持つ
- `app/components/ingestion/UploadDialog.tsx` — `Dialog` の各 view を切り替える親。`IngestionPreviewForm` を `editing` 状態で描画する
- `app/core/presentation/head.ts:55` — viewport meta SSOT。現状 `width=device-width, initial-scale=1` のみで `viewport-fit=cover` 未指定 → iOS Safari で `env(safe-area-inset-*)` が常に 0 を返す

### Dialog consumer 完全リスト

`grep -rn 'import { Dialog } from "@/components/common/Dialog"'` で正確に一致するもの：

- `app/components/common/ConfirmDialog.tsx`
- `app/components/ingestion/UploadDialog.tsx`
- `app/components/note/list/NotePickerDialog.tsx`
- `app/components/note/list/MoveNoteDialog.tsx`
- `app/components/note/list/SaveViewDialog.tsx`
- `app/components/note/list/BulkVisibilityDialog.tsx`
- `app/components/note/list/BulkExportDialog.tsx`
- `app/components/tag/MergeTagDialog.tsx`

`dialog` クラス変更は上記 8 つに波及する。`NoteDetail` / `FilterBar` / `AccountDeleteForm` は `Dialog` を直接使わず派生 Dialog component を経由するため二次的な consumer。

### Issue 記述と現コードの差分（**重要**）

Issue 本文の Resp-H2 は次のように書いている：

> `pillBtn`（common）はモバイルで `min-h-[44px]` を持つが、`PILL_BTN`（layout）は持たない。

しかし現コードは**逆**である：

- `app/components/common/styles.ts:13` の `pillBtn` には `min-h-[44px]` が無い（`h-9 px-4 ...`）
- `app/components/layout/styles.ts:20` の `PILL_BTN` には `max-sm:min-h-[44px]` がある

`UploadDialog` は `pillBtn`（common）を import しているため、モバイルで 36px のままという**症状自体は Issue の指摘どおり**。対応方針（pill ボタンスタイルの 44px 統一）は変わらない。「どちらに何が足りないか」だけ Issue 本文がねじれているので、現コードの実態に従い `pillBtn` 側に追加する。

### あるべきアーキテクチャ

- `CLAUDE.md` のスタイル節：utility-first、`data-*` ステート、token CSS variables、繰り返し utility は module-scope の string 定数に集約。`@apply` は使わない
- `Dialog` は汎用 primitive。slot 化せず、children に任意 layout を流せる（既存どおり）
- pill ボタンは 2 系統（`pillBtn`/`pillBtnPrimary`/`pillBtnDanger` と `PILL_BTN`）に分かれているが、本 Issue では撤廃せず「モバイル `min-h` だけ揃える」最小修正に留める

### 既存実装の状態

- `pillBtn`: `h-9 px-4 ...`（**`max-sm:min-h-[44px]` 無し**）— あるべき姿（モバイル 44px）から乖離 → 本 Issue で修正
- `PILL_BTN`: `h-9 px-4 ... max-sm:min-h-[44px]` — あるべき姿と一致
- `dialog`: `max-w-[480px] w-full max-h-[90vh] overflow-y-auto`（flex なし） — IngestionPreviewForm のような「スクロール領域 + 固定 footer」を表現できない → 本 Issue で `flex flex-col` 付与
- `IngestionPreviewForm` の本文プレビュー: `max-h-[240px] overflow-y-auto` — 二重スクロールの原因
- `IngestionPreviewForm` の action bar: `sticky bottom-0 -mx-6 -mb-6 ...` — panel スクロール時に「コンテンツの現在見えてる範囲の下端」に貼り付くため浮く
- viewport meta: `viewport-fit=cover` 未指定 — safe-area 対応の前提が欠落

### 依存関係

- `dialog` クラスの変更（`flex flex-col` 追加）は上記 Dialog consumer 8 つに波及。ただし `flex flex-col` は children を縦並びに配置する暗黙の挙動を明示するだけで、視覚的なレイアウトは変わらない（短い children は flex-col でも block と同じ縦並び。`mt-*` / `mb-*` の余白も flex item では margin collapse が起きないため、現状の `dialogActions` の `mt-4` 等は同じ余白を出す）
- `pillBtn` の `max-sm:min-h-[44px]` 追加は ConfirmDialog の action ボタン（`pillBtn` 直接 + `pillBtnDanger` 経由）や UploadDialog 内の全 pillBtn に波及。望ましい変更（モバイルタッチターゲット拡大）なので副作用は positive
- viewport `viewport-fit=cover` 追加は全ページに波及するが、body 背景が `--color-bg` で塗られている前提で notch 領域も同色になるため視覚的な regression は想定しない（Phase 2 で確認）

## 実装ステップ

### 1. `pillBtn` にモバイル `min-h-[44px]` を追加

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `pillBtn` の末尾に `max-sm:min-h-[44px]` を追加。`PILL_BTN` (layout) と揃える。`pillBtnDanger` が `${pillBtn} ...` で組まれているため自動で同じ変更が波及する（意図どおり）
- **理由:** Resp-H2 / Critique H-4。モバイルタッチターゲット推奨の 44px を達成

### 2. `dialog` クラスに `flex flex-col` を追加

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `dialog` の class string に `flex flex-col` を追加（既存の `relative` / `max-h-[90vh] overflow-y-auto` 等はそのまま）
- **理由:** panel を flex column コンテナ化し、子側で `flex-1 min-h-0 overflow-y-auto` を取れるようにする。長いコンテンツでも panel の `overflow-y-auto` が引き続き fallback として効くため、IngestionPreviewForm 以外の Dialog consumer の後方互換は維持される（詳細は ADR-001）

### 3. viewport meta に `viewport-fit=cover` を追加

- **対象ファイル:** `app/core/presentation/head.ts:55`
- **変更内容:** `{ name: "viewport", content: "width=device-width, initial-scale=1" }` を `{ name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" }` に変更
- **理由:** iOS Safari で `env(safe-area-inset-*)` を有効化する前提。これが無いと action bar 側の `pb-[max(1rem,env(safe-area-inset-bottom))]` は実機 iPhone で常に `1rem` になり、safe-area 対応が無効化される

### 4. `IngestionPreviewForm` のレイアウトを flex column 化

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`
- **変更内容:**
  1. `<form>` に `flex flex-1 flex-col min-h-0` を付与
  2. form 直下に 2 つの領域を作る：
     - スクロール領域: `flex-1 min-h-0 overflow-y-auto -mx-6 px-6`（既存の field 群をここに入れる）
     - action bar: `flex-shrink-0 -mx-6 -mb-6 flex flex-wrap justify-end gap-2 border-t border-hairline bg-bg px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]`
       - `mt-2` は撤去（border-t が仕切りを担うので追加余白は不要。デザイン的に border が浮かないようにするため）
  3. `READONLY_CONTENT` 定数から `max-h-[240px] overflow-y-auto` を削除
  4. action bar から `sticky bottom-0` を削除
- **理由:** Resp-H1。スクロールコンテナを panel 内の 1 つに統一し、action bar を flex 最下端で固定。これにより panel スクロール時の action bar 浮き挙動が解消される

### 5. テスト調整 + 構造 regression テスト追加

- **対象ファイル:**
  - `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx`
  - `app/components/common/__tests__/Dialog.test.tsx`（影響が出れば）
  - `app/components/ingestion/__tests__/UploadDialog.test.tsx`（影響が出れば）
- **変更内容:**
  - クラス名・構造変更で落ちるアサーションを修正
  - **追加**: `IngestionPreviewForm` の action bar に `sticky` クラスが含まれないこと / 本文プレビューに `max-h-[240px]` クラスが含まれないことの assertion 1 ファイル分
- **理由:** 構造変更でテストが落ちるなら整合させる。将来 sticky / max-h が誤って復活したときに CI で検出できるようにする

### 6. `.issue/257/testing.md` の作成（Phase 1 内で実施）

- **対象ファイル:** `.issue/257/testing.md`
- **変更内容:** manual-test の手順を記述。Step 5b の testing.md テンプレートに従い、以下を含める：
  - モバイル縦 375×667 / 414×896 / 横 667×375 でのアップロードモーダル `editing` 表示確認
  - action bar ボタンが 44px 以上（DevTools 計測）
  - 長い本文 HTML を持つジョブで、panel スクロールのみが効き、本文プレビュー内のスクロールが発生しない
  - action bar が常に panel 最下端に固定され、スクロール中も浮かない
  - iOS Safari (Simulator) で safe-area-inset-bottom が効くこと（home indicator と非重畳）
  - 他 Dialog consumer（ConfirmDialog / NotePickerDialog / MoveNoteDialog / SaveViewDialog / BulkVisibilityDialog / BulkExportDialog / MergeTagDialog）の見た目に regression が無いこと
- **理由:** Issue「やること」の「縦/横モバイル両方のスクリーンショット撮影で検証」を計画上の成果物として明文化

## 設計判断

詳細は `.issue/257/adr.md`

- **ADR-001**: `Dialog` の API は変えず `dialog` クラスに `flex flex-col` を付与する。panel の `overflow-y-auto` は維持（IngestionPreviewForm パスでは dead code 化、他 consumer ではフォールバック）
- **ADR-002**: `pillBtn` と `PILL_BTN` の統合は本 Issue では行わない（スコープ判断）
- **ADR-003**: safe-area-inset の有効化のため viewport meta に `viewport-fit=cover` を追加する

## リスクと注意点

- `dialog` クラスへの `flex flex-col` 追加で、Dialog consumer 8 つの見た目に微妙な差が出る可能性 → manual-test で全 consumer を最低 1 回開いて確認
- `min-h-0` を flex item に付けないと `overflow-y-auto` が効かない（flex item の min-height デフォルトが `auto` のため）→ 必ずスクロール領域に `min-h-0` を付ける
- `dialog` の `overflow-y-auto` は維持するが、IngestionPreviewForm パスでは dead code 化する。これは ADR-001 で明文化し「将来 consumer が新たに `overflow-y-auto` 子要素を作ったときに二重スクロールが復活しないよう、規約として `flex-1 min-h-0` パターンを使う」点を継承
- `viewport-fit=cover` を入れると、横向き時 notch 領域に背景が露出する可能性 → body 背景が `--color-bg` で統一されている現状で問題ない想定だが Phase 2 で目視確認
- 既存テストで `max-h-[240px]` や `sticky bottom-0` をスナップ的にチェックしている箇所があれば失敗する → Phase 2 で確認・修正

## テスト方針

- 自動テスト：既存ユニットテストが緑のまま維持。構造変更で落ちたものは整合させる。構造 regression テスト 1 本を追加
- manual-test：`.issue/257/testing.md` の手順に従い実機/エミュレータで確認

## レビュー履歴

### 1周目（2026-05-28）

**修正した点**:
- [P-001（視点1）] 実装ステップ 6 として `.issue/257/testing.md` 作成を明示し、検証項目（モバイル縦/横、44px 計測、本文スクロール無し、action bar 浮き無し、iOS safe-area、他 Dialog consumer regression）を列挙
- [P-002（視点1）] 依存関係セクションの Dialog consumer 一覧を正確化（`ConfirmDialog`, `UploadDialog`, `NotePickerDialog`, `MoveNoteDialog`, `SaveViewDialog`, `BulkVisibilityDialog`, `BulkExportDialog`, `MergeTagDialog` の 8 つ）
- [P-003（視点1）/ P-001（視点2）] viewport meta の `viewport-fit=cover` 追加を実装ステップ 3 として本 Issue スコープに含めた。ADR-003 として記録
- [P-002（視点2）] `dialog` の `overflow-y-auto` 維持と「IngestionPreviewForm パスでは dead code 化、他 consumer ではフォールバック」の挙動を ADR-001 の Consequences に明文化（並行で plan の「リスクと注意点」にも追記）

**取り込んだ改善提案**:
- [S-001（視点1）] audit の `max-h-[280px]` と実コード `max-h-[240px]` のズレを「調査結果」節に補足
- [S-002（視点1）] `pillBtn` / `PILL_BTN` 統合タスクを **Phase 4 で別 Issue として起票** することを「含まれないもの」に明記
- [S-001（視点2）] ADR-001 の Consequences に「flex item では margin collapse が起きない」「`mt-*`/`mb-*` の余白は flex column 化後も機能する」を追記
- [S-002（視点2）] 実装ステップ 4 から action bar の `mt-2` を撤去（border-t が仕切りを担うため）
- [S-003（視点2）] `pillBtnDanger` への波及を「依存関係」「実装ステップ 1」に明示
- [S-004（視点2）] 構造 regression テスト 1 本追加を実装ステップ 5 に追加

**見送った提案とその理由**:
- [S-003（視点1）] `data-testid`（`data-scroll-area=""` / `data-action-bar=""`）の追加 — DOM に意味付けする `data-*` は project convention でステート（`data-active=""` 等）用途。テスト用識別子としては既存 query (`role="alert"`, label テキスト, ボタンテキスト) で十分カバーでき、構造アサーションのほうが本質を捕える。`data-testid` を新規導入するなら別 Issue で project 全体規約として整備が望ましい
- [S-004（視点2）] `dialog` の `overflow-y-auto` 撤廃 — 8 consumer 全てに影響、特に長いコンテンツが入る consumer（BulkExportDialog 等）で切れるリスクが残る。ADR-001 の Consequences で「IngestionPreviewForm パスでは dead code 化」を明文化することで現状維持の判断を合理化した

### 2周目

両視点のレビュー反映で blocker 級は全て plan/ADR に取り込み済み。実装フェーズへ進む。
