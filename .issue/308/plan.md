# 実装計画 — Issue #308: ボタン形態ガイドライン (#292) 適用: domain別の行アクション・フォーム送信ボタン

**Issue:** #308
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

#292 (PR #304, **main にマージ済**) で `spec/design/index.md` §7.1 に追加された「ボタン形態の使い分け」サブセクションを SSOT として、umbrella #307 のフォローアップとして以下 3 領域を整合させる。

1. `app/components/tag/TagActions.tsx` — 行アクション（リネーム/統合/削除/保存/キャンセル）
2. `app/components/identity/AccountDeleteForm/index.tsx` — 破壊的フォーム + 確認 UI
3. `app/components/admin/UsersTable/index.tsx` — admin 高密度行アクション

## 前提条件

- 本実装ブランチは **`origin/main` から派生させる** こと（現作業ブランチ `issue/299/router-invalidate-filter` は PR #304 マージ前の派生で、`ConfirmDialog.confirmIcon` prop や spec §7.1 ボタン形態節が含まれない）。Phase 2 の Step 1 で `git checkout main && git pull` 後にブランチを切る。
- main の `ConfirmDialog` には `confirmIcon?: LucideIcon` prop が既に追加済 (PR #304)。新規 API 拡張は本 Issue で不要。
- main の `TagActions` の `ConfirmDialog` 呼び出しには既に `confirmIcon={Trash2}` が付与済。本 Issue で追加するのは行アクション側ボタンへのアイコン付与のみ。

## スコープ

### 含まれるもの

- 上記 3 領域のボタン形態を §7.1 ガイドラインに整合させる
- 関連する設計判断を `.issue/308/adr.md` に記録
- マニュアルテスト 3 動線で視覚一貫性を確認

### 含まれないもの

- `app/components/identity/ProfileForm`、`SecurityForm` の MVP スタイル整備（同領域だが本 Issue スコープ外）
- ADR-005（admin の `h-7` タップ領域例外）の見直し — §3 例外は維持する
- spec §7.1 ガイドライン自体の変更
- `AccountDeleteForm/action.ts`（server fn）の変更
- `ConfirmDialog` 共通プリミティブの追加 API 拡張（`initialFocusRef` 等）— UX 改善は description 内 input への直接フォーカス制御で対応する
- 他の `ConfirmDialog` caller への波及確認（既に main で `confirmIcon` 付与済の TagActions 以外の caller の補修は別 Issue/別フォローアップで扱う）

## 実装ステップ

### 1. TagActions のアイコン+ラベル化

- **対象ファイル:** `app/components/tag/TagActions.tsx`
- **変更内容:**
  - `lucide-react` から `Pencil` / `Merge` / `Trash2` / `Check` を追加 import（`Trash2` は既に import 済 — 既存 import に合流）
  - `@/components/common/Icon` から `Icon` を import
  - 編集モードの 2 ボタン:
    - 「保存」(`data-primary`) の左に `<Icon icon={Check} />` を挿入
    - 「キャンセル」はテキストのみのまま（spec §7.1 例外 (b): primary=アイコン+ラベル / secondary=テキストのみの組合せ。`ConfirmDialog` の「ゴミ箱へ」/「キャンセル」と同型）
  - 非編集モードの 3 ボタン:
    - 「リネーム」の左に `<Icon icon={Pencil} />`
    - 「統合」の左に `<Icon icon={Merge} />`
    - 「削除」(`data-danger`) の左に `<Icon icon={Trash2} />`
  - 既存の `ConfirmDialog` の `confirmIcon={Trash2}` は main で既に付与済 — 触らない
- **理由:**
  - 非編集モードは全アクションが「実行系の行アクション」なので §7.1 既定の「アイコン+ラベル」に揃える（`TrashRowActions` / `NoteActions` / `IngestionJobRow` と同じパターン）
  - 編集モードは spec §7.1「同一ツールバー内では形態を揃える」原則と例外 (b)「primary=アイコン+ラベル / secondary=テキストのみ」を採用。`ConfirmDialog` 自体が同パターンで実装されているため整合性が高い
  - `PILL_BTN` は `inline-flex items-center gap-1.5` を内包済 — クラス追加は不要
- **アイコン選定:** `Pencil`（編集、`NoteActions` 既存）、`Merge`（統合、lucide 純正）、`Trash2`（削除）、`Check`（保存 CTA 慣用、`IngestionJobRow.tsx` の `data-primary` + `Check` の先行例と整合）

### 2. AccountDeleteForm を `ConfirmDialog` パターン + 既存スタイル + `Trash2` アイコンに揃える

- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更内容:**
  - 既存の `useActionState` + `useState(confirmDialog)` + inline `<section role="dialog">` を廃止
  - 共通 `@/components/common/ConfirmDialog` を呼び出す形に置換
  - 説明文 + ユーザー名一致確認 `<input>` + 不一致時の `<p role="alert">` を `description: React.ReactNode` として渡す（TagActions の `renderDeleteDescription` と同パターン）
  - **トリガーボタン**「続けて削除する」: `PILL_BTN`（`@/components/layout/styles`）+ `data-danger=""` + `<Icon icon={Trash2} />` を付与し、`onClick={() => setConfirmOpen(true)}` で確認ダイアログを開く
  - **ConfirmDialog の confirm 側**: `confirmLabel="アカウントを完全に削除する"` / `confirmIcon={Trash2}` / `isPending={isPending}` / `onConfirm={runDelete}`
  - 状態管理を `useActionState` → `useTransition` + `useState<SerializedError | null>` に書き換え。`runDelete` 内で `deleteAccount({ data: { confirmation: draft } })` を直接呼び出す
  - **rule 1 不変条件**: 成功時の `await router.invalidate()` は **`routerInvalidate(router)` に置換しない**。WHY コメント `// 過去訪問の cached _app match に残る旧 userDto を破棄するため _app も invalidate（rule 1）` も保持。後続の `router.navigate({ to: "/", search: HOME_SEARCH })` も既存挙動を維持
  - `canConfirm = draft === user.username` のクライアントガードは `onConfirm` 冒頭で `if (!canConfirm) return;` で実現（`ConfirmDialog` の confirm button に `disabled` を渡せない共通 API 制約への対応）
  - **エラー表示位置**:
    - `validation` kind かつ `fieldErrors.confirmation` あり → ダイアログ残置、description 内 input 直下の `<p role="alert">` で表示
    - `system` / `business` / `validation` の他フィールド → ダイアログを閉じて `displayError(error)` で section 内 `<p role="alert">` に summary を表示（TagActions と同じパターン）
  - **初期フォーカス**: ConfirmDialog の `role="alertdialog"` では WAI-ARIA 規範通り panel に初期フォーカスが当たる。`Dialog` (main 版 lines 296-329) は `[mounted, role]` deps の useEffect 内で `mounted=true` 後の rAF で **必ず `panel.focus()` を呼ぶ** 実装になっており、何らかの方法で input に focus を当てても次フレームで panel に上書きされる。callback ref パターンも rAF タイミングで奪われるため信頼できない。よって**初期 focus は panel に任せ、ユーザーは Tab キー 1 回で input に到達する** UX を受け入れる（WAI-ARIA alertdialog 契約に完全準拠、最小実装）。`useRef` / `useEffect` / callback ref / pendingFocus state はすべて不要
  - **UX 退行受容（不一致時の Enter 押下）+ 初期 focus が panel に当たる挙動の補助**: `ConfirmDialog` の submit ボタンは API 上 `disabled={isPending}` のみで、`canConfirm` で無効化できない。`onConfirm` 冒頭の early return では Enter 押下時に「無反応」になる。これに対し description 末尾に `<p className="text-xs text-ink-tertiary">ユーザー名が一致すると削除が実行されます。Tab キーで入力欄に移動できます。</p>` のヒントテキストを追加し、ユーザーが「なぜ動かないか」と「どう入力欄に到達するか」の両方を理解できるようにする（API 拡張なしの軽量対応）
  - 既存 `autoComplete="off"` / `autoCapitalize="off"` / `spellCheck={false}` / `maxLength={USERNAME_MAX}` / `aria-invalid` は維持
- **理由:**
  - Issue 本文が明示的に問題視している 3 点（ConfirmDialog 不使用 / Trash2 未付与 / pillBtn 系スタイル未適用）を一括で解消
  - 完了条件 ②③④ を満たす
  - `ConfirmDialog.description: React.ReactNode` がリッチ要素を許容し、TagActions が `renderDeleteDescription` で先行使用済のため技術正当性は確保

### 3. UsersTable のアイコン+ラベル化（admin 例外維持）

- **対象ファイル:** `app/components/admin/UsersTable/index.tsx`
- **変更内容:**
  - `lucide-react` から `Pause` / `Play` / `Shield` / `ShieldOff` を import
  - `@/components/common/Icon` から `Icon` を import
  - 「一時停止」「復帰」「管理者に昇格」「管理者を解除」各 `<button>` 内に `<Icon icon={...} />` をテキストの左に追加（`BTN_SM_CLASS` は `inline-flex items-center gap-1.5` を内包済のためクラス追加不要）
  - `BTN_SM_CLASS`（`h-7` admin 例外、spec §7.1 末尾「admin 行アクション例外」）は維持
- **理由:**
  - spec §7.1 末尾の admin 例外は §3 タップ領域 44×44px 要件の例外であって、§7.1 アイコン+ラベル原則の例外ではない
  - `app/components/admin/Jobs/index.tsx` が既に `BTN_SM_CLASS` + `<Icon>` の組合せで先行整合済 — admin 内の事実上の標準パターン
  - 「テキストのみで揃える」案は §7.1 のテキストのみ許容場面（タブ/セグメント、フィルタチップ、リンク的）に該当しない
- **アイコン選定:** `Pause`（一時停止）、`Play`（復帰）、`Shield`（管理者に昇格）、`ShieldOff`（管理者を解除）。
- **対象アクション範囲確認**: 現状の UsersTable は status `pending` / `deleted` 行にはアクションボタンを描画していない。本 Issue は既存 4 アクション（active→一時停止 / suspended→復帰 / member→管理者に昇格 / admin→管理者を解除）のみが対象。将来のメール再送等は別 Issue。

### 4. 整合性検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit`（既存テストのテキスト assertion 変更なしのため原則影響なし）
- `pnpm test:integration` は対象外（UI 層のみの変更、server fn 不変）

### 5. testing.md の作成

- `.issue/308/testing.md` に 3 動線 + cross-cutting の確認手順を記述（plan のテスト方針セクション参照）

## 設計判断

3 領域すべて「ガイドラインに整合させる（アイコン+ラベル化）」方針で揃える。詳細トレードオフは `.issue/308/adr.md` を参照（ADR-001〜005）。

## リスクと注意点

- **AccountDeleteForm の `useActionState` → `useTransition` 書き換え**: rule 1 の生 `router.invalidate()` 保持、`fieldErrors.confirmation` の表示位置、summary error の表示位置、canConfirm の `onConfirm` 内 early return ガード — 各要素を 1 つでも落とすと UX/a11y/不変条件のいずれかが壊れる。マニュアルテストで「ユーザー名不一致 → fieldErrors 表示」「一致 → ナビゲーション + AppShell 再評価」「サーバーエラー → summary 表示」の 3 経路を必ず確認
- **AccountDeleteForm の `routerInvalidate` ラッパ誤用**: 同ファイルディレクトリ内の他コンポーネント（TagActions / UsersTable / NoteActions 等）はすべて `routerInvalidate(router)` 経由で呼ばれている。コピペ起点で誤って置換しないよう、コード書き換え時に `router.invalidate()`（引数なし、生）であることを目視確認する
- **TagActions の「キャンセル」テキストのみ維持**: spec §7.1 例外 (b) の判断を ADR-001 で明記。レビュー時に「混在禁止違反」と誤って指摘されるリスクへの先行対応
- **TagActions の「保存」アイコン化**: `Check` アイコンは `IngestionJobRow.tsx` の `data-primary` + `Check` で先行例あり。`data-primary` 状態の accent 背景上で `currentColor` 継承の `Check` が十分なコントラストを持つことは検証済
- **a11y 退行**: `Icon` ラッパー経由で `aria-hidden` を自動付与、accessible name はテキスト側で担保。icon-only 化なし → 44×44 タップ領域 / `aria-label` 必須要件は本 Issue 対象外
- **`lucide-react` の barrel import**: 全ファイルで named import のみ使う（spec §7.1 既定）

## テスト方針

詳細は `.issue/308/testing.md` を参照。観点サマリ:

1. TagActions の編集・統合・削除動線でアイコン+ラベル形態と confirm 動作
2. AccountDeleteForm の ConfirmDialog 化と削除フロー全経路（不一致 / 一致 / エラー / Esc / overlay）と AppShell 再評価 (rule 1)
3. UsersTable の 4 アクション全種でアイコン+ラベル表示と機能継続
4. cross-cutting: `<Icon>` `size={16}` 統一・`prefers-reduced-motion` 対応

---

## レビュー履歴

### 3周目

**修正した点（問題点への対応）**:

- **[P-301 アーキ]** ADR-005 の callback ref + state flag パターンの順序問題: `Dialog` (main 版 lines 296-329) は `[mounted, role]` deps の useEffect 内で `mounted=true` 後の rAF で **必ず `panel.focus()` を呼ぶ** 実装。callback ref で input に focus を当てても次フレームで panel に上書きされ、「即 input カーソル」UX は事実上達成できない。**初期 focus は panel に任せ、Tab 1 回で input 到達する UX を受け入れる** (a) 案に書き換え。WAI-ARIA alertdialog 契約に完全準拠、`useRef` / `useEffect` / callback ref / pendingFocus state はすべて不要、最小実装。ADR-005 / plan §2 「初期フォーカス」セクションを書き直し、description 末尾ヒントテキストに「Tab キーで入力欄に移動できます」を追記

**取り込んだ改善提案**:

- **[S-301 アーキ]** ADR-005 Context に「`Dialog` の `[mounted, role]` deps + rAF 強制 panel.focus() 仕様」を実装由来の制約として明示。WAI-ARIA alertdialog 契約だけでなく実装事実を引用することで、将来の改修者が同じ罠に再挑戦しないようドキュメント化

**見送った提案とその理由**:

- **[S-302 アーキ 動的 alert 表示]** `onConfirm` early return 時に `<p role="alert">` を動的に出してスクリーンリーダ通知する案: 検討したが、description 末尾の静的ヒントテキスト + Tab 案内で意図は十分伝わると判断（不一致時 Enter 押下は破壊的操作ではないため、a11y 通知の重み付けは過剰）。ヒントテキストの常時可視で対応

### 2周目

**修正した点（問題点への対応）**:

- **[P-201 アーキ]** `Dialog` の 2 段階 mount（`if (!mounted) return null`）により、最初の `confirmOpen` true 化時点で portal 子（input）がまだ DOM に乗っていない問題: 単純な `useRef` + `useEffect([confirmOpen])` では `inputRef.current === null` で focus が当たらない。**callback ref + state flag** パターン (`pendingFocus` state を `useState(false)` で持ち、トリガーで `true`、callback ref が input 取得時に focus + reset) に書き換え。ADR-005 と plan §2 「初期フォーカス」セクションを書き直し
- **[P-202 アーキ]** `ConfirmDialog` の submit ボタンが `disabled={isPending}` のみで `canConfirm` を考慮できず、不一致時の Enter / クリックで「無反応」UX 退行が発生する問題: `ConfirmDialog` API 拡張はスコープ外維持。description 末尾に `<p>` ヒント「ユーザー名が一致すると削除が実行されます」を追加して、ユーザーが「なぜ動かないか」を理解できるよう補助。ADR-002 末尾に UX 退行受容と補助手段を明記
- **[P-203 アーキ]** rule 1 grep gate 自動化: testing.md のチェックリストに「`AccountDeleteForm/index.tsx` 内の `router.invalidate()` 行（裸呼び出し）と WHY コメントが残っていること」を grep で確認する項目を追加する旨を plan §5 と ADR-004 末尾に明記

**取り込んだ改善提案**:

- **[要件 S-201]** ADR-001 で「`ConfirmDialog` の現実装が例外 (b) を採用している」エビデンスとして `app/components/common/ConfirmDialog.tsx` のキャンセル側がテキストのみであるパスを参照に追記
- **[要件 S-202]** testing.md に「panel focus → input focus 上書き」順序が壊れるエッジケースを 1 ケース追加する旨を plan §5 で明記
- **[アーキ S-201]** ADR-002 末尾に `useId` 継続使用方針（input/label の id は AccountDeleteForm 側で保持、heading id は ConfirmDialog 内蔵 `titleId` に委ね）を 1 段落追記
- **[アーキ S-204]** ADR-002 末尾にトリガーボタンも `data-danger` で揃える意図（最終 confirm でユーザー名一致ガードが入るため一段目から強い視覚警告を出す方が安全）を 1 文追記

**見送った提案とその理由**:

- **[アーキ S-202 静的 guard test 追加]** unit test で source 文字列 assert は脆弱（lint:fix で簡単に壊れる、false positive リスク）。代わりに testing.md の grep チェック項目で対応（P-203 と統合）
- **[アーキ S-203 MergeTagDialog 整合]** `MergeTagDialog` の confirm/cancel は `pillBtn` + `pillBtnPrimary` でアイコン未付与（main 確認済）だが、これは ConfirmDialog ではなく独自 Dialog 実装で、本 Issue の 3 領域に含まれない。ADR-001 のリスク欄に「MergeTagDialog は本 Issue 対象外。別途 #307 umbrella フォローアップ or 個別 Issue で追跡」と明記して見送り
- **[アーキ P-202 案 b: `confirmDisabled?` prop 追加]** 共通 `ConfirmDialog` の API 拡張は本 Issue 意図を超える（前提条件で明示済）。description 内ヒント表示で UX 退行を補助する軽量案を採用

### 1周目

**修正した点（問題点への対応）**:

- **[P-001 両視点共通]** 「`ConfirmDialog` に `confirmIcon` prop が存在しない」前提エラー対応: 実調査の結果、現作業ブランチ (`issue/299/...`) は PR #304 マージ前の派生で当該 prop を含まない一方、`origin/main` には PR #304 がマージ済で `confirmIcon` / spec §7.1 ボタン形態節を含むことが確認できた。本計画は **main 基準** に書き直し、`前提条件` セクションを追加して「Phase 2 で main から派生する」旨を明記
- **[P-002 アーキ]** `router.invalidate()` rule 1 保持の明示: ステップ 2 と「リスクと注意点」の双方に「`routerInvalidate(router)` に置換しない、生 `router.invalidate()` と WHY コメントを保持する」と明記。
- **[P-003 アーキ]** validation / system / business エラー表示位置の決定: ステップ 2 に「validation kind かつ fieldErrors → dialog 残置 + description 内表示」「system / business / 他フィールド → dialog 閉じて section 内 summary 表示」を明示。
- **[P-004 アーキ]** ConfirmDialog 内 input の初期 focus: `role="alertdialog"` で `initialFocusRef` が無視されることを確認 → AccountDeleteForm 側で `useRef` + `useEffect` で input にフォーカスを当てる対応を明記。ConfirmDialog API は拡張しない（スコープ外）。
- **[P-005 要件 P-003]** testing.md 作成ステップ: 実装ステップ 5 として明示追加。
- **[S-001 canConfirm ガード]** `ConfirmDialog` の confirm button に `disabled` を渡せない API 制約に対応するため、`onConfirm` 冒頭で `if (!canConfirm) return;` で early return する旨を明記。
- **[main 状態の反映]** TagActions / UsersTable / AccountDeleteForm の main 最新コードを実調査し、TagActions の `ConfirmDialog` 既に `confirmIcon={Trash2}` 付与済の事実を反映。「ConfirmDialog 呼び出しに confirmIcon を補修」という記述を削除。

**取り込んだ改善提案**:

- **[S-002 アーキ]** UsersTable の対象アクション範囲を ADR/plan で明示: ステップ 3 末尾に「現状 4 アクションのみが対象、pending/deleted はアクション無し、メール再送等は別 Issue」と明記。
- **[S-003 アーキ]** `IngestionJobRow` の `data-primary` + `Check` 先行例を ADR-001 のエビデンスとして引用（リスク欄にも追記）。
- **[S-004 アーキ]** integration test 対象外を §4 で明示。

**見送った提案とその理由**:

- **[要件 S-002]** TagActions 編集モードを例外 (b)（混在）にする案: 採用 — 但し全 5 ボタン一律アイコン+ラベル案は不採用に変更。spec §7.1 の `ConfirmDialog` 「ゴミ箱へ」/「キャンセル」が同型の先行例で、編集モードの primary/secondary 関係に最も馴染むため。ADR-001 を書き直し。
- **[アーキ S-001 confirmDisabled prop 追加]** スコープ外。`onConfirm` 内 early return で同等のガードが可能で、共通プリミティブの API 拡張は本 Issue の意図を超える。
- **[アーキ S-002 lucide barrel import 確認]** plan の「リスクと注意点」に named import 原則を明記して対応。実装時に確認する。
