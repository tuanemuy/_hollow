# ADR — Issue #308: ボタン形態ガイドライン (#292) 適用: domain別の行アクション・フォーム送信ボタン

## ADR-001: TagActions の編集モードは §7.1 例外 (b)（primary=アイコン+ラベル / secondary=テキストのみ）、非編集モードはアイコン+ラベルで揃える

### Status
Proposed

### Context
TagActions の 5 ボタン（編集モード: 保存 / キャンセル、非編集モード: リネーム / 統合 / 削除）はテキストのみで、他の行アクション群（`TrashRowActions` / `NoteActions` / `IngestionJobRow`）が #292 で既にアイコン+ラベル化されている。「保存」「キャンセル」のような汎用語にアイコンを足すと §7.1「賑やかし禁止」境界に近い。選択肢:

- (A) 5 ボタン全部にアイコン+ラベル付与（一律一貫性）
- (B) 編集モード（保存/キャンセル）は spec §7.1 例外 (b)「primary=アイコン+ラベル / secondary=テキストのみ」、非編集モード（リネーム/統合/削除）は全アイコン+ラベル

### Decision
(B) を採用。
- 編集モード:
  - 「保存」(`data-primary`): `<Icon icon={Check} />` + 「保存」
  - 「キャンセル」: テキストのみ
- 非編集モード:
  - 「リネーム」: `<Icon icon={Pencil} />` + 「リネーム」
  - 「統合」: `<Icon icon={Merge} />` + 「統合」
  - 「削除」(`data-danger`): `<Icon icon={Trash2} />` + 「削除」

### Consequences
- 良い点:
  - spec §7.1 例外 (b) の例として明示された `ConfirmDialog` の「ゴミ箱へ」/「キャンセル」と編集モードのボタン構成が同型 — spec の意図に最も馴染む。**根拠**: `app/components/common/ConfirmDialog.tsx` の cancel 側 (`<button type="button" className={pillBtn}>キャンセル</button>`) はテキストのみで実装されており、confirm 側のみ `confirmIcon` を受け取る構造になっている
  - `IngestionJobRow.tsx` の `data-primary` + `Check`（保存系 CTA）が先行整合済 — 既存パターンと一致
  - 非編集モードは行アクションの首尾一貫性を確保
- トレードオフ:
  - (A) 全一律案より「形態の判断」が一段複雑になる
  - キャンセル系のアイコン（`X` 等）を採用しなくなる代わりに、spec の混在禁止例外 (b) を明示的に活用する判断を ADR で記録する責任が発生

### スコープ外の関連懸念

- `MergeTagDialog`（main 確認済 — `pillBtn` + `pillBtnPrimary` でアイコン未付与）は `ConfirmDialog` ではなく独自 Dialog 実装で、本 Issue の 3 領域（TagActions / AccountDeleteForm / UsersTable）に含まれない。視覚的には TagActions の「統合」ボタン押下で開くダイアログだが、ボタン形態の整合は #307 umbrella の別フォローアップで追跡する

---

## ADR-002: AccountDeleteForm の inline 確認 UI を共通 `ConfirmDialog` に置換し、`useActionState` を `useTransition` に書き換える

### Status
Proposed

### Context
AccountDeleteForm は破壊的アクションにもかかわらず、MVP 段階の独自 inline 確認 UI（`useState(confirmDialog)` + `<section role="dialog">`）と素の `<button>`（`pillBtn` / `BTN_PRIMARY` 未適用）で組まれている。spec §7.1 ガイドライン違反の主要箇所。

共通 `ConfirmDialog` への置換時に問題となるのは、`<form action={formAction}>` を `ConfirmDialog` の中に閉じ込めると外側 form と二重化するため、`useActionState` を引き回せない点。選択肢:

- (A) `ConfirmDialog` 化 + `useTransition` + `deleteAccount` 直接呼び出しに切り替える
- (B) `ConfirmDialog` を使わず、inline 確認 UI のままで `pillBtn` 系スタイルとアイコンだけ整える
- (C) 「ユーザー名一致確認入力付きの確認は別パターン」として例外維持し ADR に記録

### Decision
(A) を採用。`useActionState` → `useTransition` + `useState<SerializedError | null>` に書き換え、`ConfirmDialog.description: React.ReactNode` の中にユーザー名一致確認の `<input>` / 説明文 / 不一致時の `<p role="alert">` を渡す。成功時の `await router.invalidate()` + `router.navigate("/", HOME_SEARCH)` は `startTransition` のコールバック内で同等に再現する。

### Consequences
- 良い点:
  - §7.1 + ADR-001 と完全に整合する
  - focus trap / Esc / overlay クリック / `aria-labelledby` / `aria-describedby` が共通 Dialog 経由で自動的に担保される
  - TagActions が既に `description: React.ReactNode` にリッチ要素（`<progressbar>` 等）を渡している先例があり、パターンとして既に確立済
- トレードオフ:
  - フォーム状態管理の構造変更が必要（`useActionState` ベースより手動の状態管理が増える）
  - ただし変更は UI 層に閉じ、`AccountDeleteForm/action.ts` server fn には触れない
  - 「ユーザー名不一致 → fieldErrors」「一致 → ナビゲーション」「サーバーエラー → summary」の 3 経路を必ずマニュアルテストする

### useId の継続使用方針

`useId()` は input の `htmlFor` / `id` ペア用に残す（label が description 内 input を参照するため）。一方 heading 側の id は `ConfirmDialog` 内蔵の `titleId` (`useId()` を内部で生成) に委ねる — `aria-labelledby` は ConfirmDialog 自身で組み立てるため、AccountDeleteForm 側で heading id を作る必要はなくなる。

### トリガーボタン「続けて削除する」の `data-danger` 段階表現

トリガーボタン (`<Icon icon={Trash2} /> + 「続けて削除する」`) は最終 confirm の前段ではあるが、`data-danger=""` で揃える。理由: 最終 confirm でユーザー名一致ガードが入るため、一段目から強い視覚警告を出す方が破壊性の認知を早める。`ConfirmDialog` 内の confirm ボタンも `pillBtnDanger` で同じ赤系トーンになるため、トリガー → 確定の段階で視覚トーンが揃う。

### UX 退行受容（不一致時の Enter 押下）

`ConfirmDialog` の submit ボタンは共通 API 上 `disabled={isPending}` のみで、`canConfirm` (ユーザー名一致) で無効化できない。`onConfirm` 冒頭の早期 return では Enter / クリック時に「無反応」状態になる。共通プリミティブの API 拡張（`confirmDisabled?: boolean`）は本 Issue スコープ外のため、AccountDeleteForm 側で description 末尾にヒントテキスト `<p className="text-xs text-ink-tertiary">ユーザー名が一致すると削除が実行されます</p>` を追加して、ユーザーが「なぜ動かないか」を理解できるよう補助する。受け入れる UX 退行は「不一致時に Enter を押しても何も起きない（ヒントテキストで意図を補助）」のみ。視覚的な disabled 表現は無い。

---

## ADR-003: UsersTable は admin の `h-7` 例外を維持しつつ §7.1 アイコン+ラベル原則に合流させる

### Status
Proposed

### Context
UsersTable はローカル `BTN_SM_CLASS`（`h-7`、spec §7.1 末尾「admin 行アクション例外」で §3 タップ領域 44×44px 要件の admin 例外）+ テキストのみ。Issue 本文では選択肢として:

- (A) admin 例外を維持しテキストのみで揃える（高密度テーブル + 管理者向け）
- (B) アイコン+ラベル化（`Pause` / `Play` / `Shield` / `ShieldOff` 等）

が並記されている。

### Decision
(B) を採用。`BTN_SM_CLASS`（`h-7`）はそのまま維持しつつ（admin 例外は §7.1 アイコン原則と独立）、各ボタンに `<Icon icon={...} />` をテキストの左に追加する。

対象は現状の 4 アクションのみ（active→一時停止 / suspended→復帰 / member→管理者に昇格 / admin→管理者を解除）。pending / deleted ステータス行のアクション追加（メール再送等）は本 Issue スコープ外。

### Consequences
- 良い点:
  - admin 内で `app/components/admin/Jobs/index.tsx` が既に `BTN_SM_CLASS` + `<Icon>` の組合せで先行整合 — UsersTable をテキストのみで残すと admin 内唯一の不整合領域になる
  - §7.1 のテキストのみ許容場面（タブ/セグメント、フィルタチップ、リンク的ボタン）に管理者の実行アクションは該当しない
  - admin 例外は §3 タップ領域例外、本 ADR は §7.1 アイコン原則 — 二つは独立に扱える
- トレードオフ:
  - 行高さは変わらない（アイコン `size={16}` で `h-7` 内に収まる）が、行幅はわずかに増える可能性
  - レビューで「admin はテキストのみで揃える」案が再提起されれば再議論

---

## ADR-004: AccountDeleteForm の `router.invalidate()` は **生のまま** 維持し、`routerInvalidate` ラッパで置換しない（rule 1 不変条件の引き継ぎ）

### Status
Proposed

### Context
`useActionState` を `useTransition` に書き換える際、慣習でつい `routerInvalidate(router)` に置換してしまうリスクがある（他の `useTransition` 呼び出し: TagActions / TrashRowActions / Jobs / UsersTable はすべて `routerInvalidate` 経由）。

しかし AccountDeleteForm の `router.invalidate()` は `.issue/299/adr.md` ADR-003/005 で確立された **rule 1（認証状態遷移）** に該当し、生 `router.invalidate()` で `_app` も含めて invalidate する必要がある（過去訪問の cached `_app match` に残る旧 userDto を破棄するため）。

### Decision
書き換え後も `await router.invalidate()` を生のまま呼ぶ。WHY コメント `// 過去訪問の cached _app match に残る旧 userDto を破棄するため _app も invalidate（rule 1）` も必ず保持する。`routerInvalidate(router)` ラッパには絶対に置換しない。

### Consequences
- 良い点:
  - rule 1 不変条件が `useTransition` 書き換え後も保持される
  - WHY コメントを保持することで、将来の改修者が同じ間違いを繰り返さない
- トレードオフ:
  - 同ディレクトリの他コンポーネント（ProfileForm 等）と pattern が違う見た目になる
  - これは意図的な差異であり、ADR-004 と既存 WHY コメントの 2 重防御で意図を明示する

### testing.md でのチェック項目

`.issue/308/testing.md` のチェックリストに以下を追加して将来の自動リファクタによる誤置換を検出可能にする:

```bash
# rule 1 guard: AccountDeleteForm の生 router.invalidate() と WHY コメントが残っているか
grep -n "router.invalidate()" app/components/identity/AccountDeleteForm/index.tsx
grep -n "rule 1" app/components/identity/AccountDeleteForm/index.tsx
```

両方が 1 件以上ヒットすれば OK。リポジトリ全体への grep gate（CI レベル）は本 Issue スコープ外として #307 umbrella 配下の別フォローアップで検討する。

---

## ADR-005: AccountDeleteForm の ConfirmDialog では初期 focus は panel に任せ、Tab 1 回で input に到達する UX を受け入れる

### Status
Proposed

### Context
AccountDeleteForm では `ConfirmDialog` の description 内に `<input>` を置きユーザー名一致確認を行う。「ダイアログ開いて即 input にカーソル」が自然な UX だが、実装上の制約が複層的に存在する:

1. `ConfirmDialog` は `role="alertdialog"` を使う → `Dialog` の `initialFocusRef` prop が無視される（WAI-ARIA alertdialog 契約: panel が初期 focus を受ける）
2. `Dialog` (main 版) は `useState(false) → useEffect(() => setMounted(true))` の **2 段階 mount** を採用し、`mounted=true` になるまで children を一切描画しない（`if (!mounted) return null`）
3. `Dialog` (main 版 `Dialog.tsx` lines 296-329) は **`[mounted, role]` deps の useEffect 内で `mounted=true` 後の rAF で必ず `panel.focus()` を呼ぶ** 実装になっている

タイミング順序を厳密に追うと:

- T0: トリガー押下 → `setConfirmOpen(true)`
- T1 render: `DialogInner` 初回 (`mounted=false`) → `setMounted(true)` enqueue
- T2 render: `DialogInner` 2 回目 (`mounted=true`) → portal 子マウント、input が DOM に commit
- T2 commit 後: `useEffect([mounted, role])` 発火、rAF schedule
- T3 frame: rAF callback → **`panel.focus()` が無条件で呼ばれる**

このため、AccountDeleteForm 側でどんな方法（`useRef` + `useEffect`、callback ref + state flag、`requestAnimationFrame` polling 等）で input に focus を当てても、T3 で必ず panel に上書きされる。

選択肢:

- (a) **初期 focus は panel に任せ、Tab 1 回で input 到達する UX を受け入れる**（WAI-ARIA alertdialog 規範に完全準拠）
- (b) callback ref + 二段遅延 `requestAnimationFrame` + `setTimeout(0)` で T3 後に input.focus() を再実行する（Dialog の内部タイミングに依存する競合パッチで脆弱）
- (c) `ConfirmDialog`/`Dialog` の API 拡張（`forceInitialFocusRef?` / `role` 切替）— 本 Issue スコープ外

### Decision
(a) を採用。AccountDeleteForm では初期 focus に関する追加コード（`useRef` / `useEffect` / callback ref / `pendingFocus` state）はすべて不要。`<input>` には通常の `ref` も付けず、props (`maxLength` / `autoComplete` / `autoCapitalize` / `spellCheck` / `required` / `disabled` / `aria-invalid` / `name` / `value` / `onChange`) のみ。

description 末尾のヒントテキストに「ユーザー名が一致すると削除が実行されます。Tab キーで入力欄に移動できます。」を表示して、Tab 操作の必要性をユーザーに案内する。

### Consequences
- 良い点:
  - WAI-ARIA alertdialog 契約に完全準拠（panel が最初に focus を受け、screen reader が role/title/description を読み上げる）
  - `Dialog` の rAF タイミングに依存しない、最も堅牢な実装
  - 実装が最小（focus 制御の追加コード一切なし、共通 API 拡張なし）
  - 将来 `Dialog` 内部実装が変わっても影響を受けない
- トレードオフ:
  - 初手 Enter は無反応（focus が panel = `tabIndex={-1}` だが、`alertdialog` 内 form の submit は Enter で発火しうる。実機確認）。description ヒントテキスト「Tab キーで入力欄に移動できます」で意図を補助
  - キーボードユーザー視点: ダイアログを開いてからユーザー名入力を始めるまでに Tab キー操作が 1 回挟まる
- 検証ポイント:
  - マニュアルテストで「ダイアログを開いた直後 → Tab 1 回 → input にカーソル → ユーザー名を入力 → Enter で送信」の動線を確認
  - スクリーンリーダで「ダイアログを開いた直後に title + description が読み上げられる」を確認

### 将来の改修への引き継ぎ

もし「ダイアログを開いたら即 input にカーソル」UX を実現したくなった場合は、本 ADR の選択肢 (b)（脆弱）ではなく (c) の共通プリミティブ API 拡張を別 Issue で検討すること。具体的には:

- `ConfirmDialog` に `role?: "dialog" | "alertdialog"` を受けて `Dialog` に流す + `Dialog` の `role="dialog"` 分岐は既存のとおり `initialFocusRef` を尊重する
- または、`Dialog` に `forceInitialFocusRef?: React.RefObject<HTMLElement | null>` を追加して `role === "alertdialog"` でも明示的に上書きする

`Dialog` 内部の rAF panel focus はすべての alertdialog caller に作用するため、AccountDeleteForm 単独の callback ref / `requestAnimationFrame` polling では本質的に対処できない。共通プリミティブ側で扱うのが正攻法。

---

## ADR-006: AccountDeleteForm の状態管理とエラー a11y 通知の補強（PR レビュー Round 1 対応）

### Status
Proposed

### Context
PR #313 のレビュー Round 1 で、ADR-002 / ADR-005 をベースにした初期実装が a11y / UX 観点で複数の Warning を受けた。特に重要な軸:

1. **W-F-001 / W-F-004**: 非 validation エラーで dialog 閉じた後、`draft` と `error` が残り、再オープン時に「ユーザー名入力済み + outer summary + dialog 内 input」の三重表示で安全装置（ユーザー名一致確認）の摩擦が失われる
2. **W-F-002**: validation エラー後、ユーザーが input を編集しても古い alert が次 submit まで残り、SR / 視覚双方で誤情報を提示し続ける
3. **W-A-001 / W-A-004**: input に `aria-describedby` がなく、fieldErrors や hint テキストへの SR 上のリンクが断絶。「ユーザー名（確認）」だけでは「どのユーザー名を入れるべきか」が SR ユーザーに伝わらない
4. **W-A-002**: 不一致時 Enter / クリックが無反応で、WCAG 3.3.1 Error Identification 違反相当。ADR-005 で受容した UX 退行のうち「破壊的でない操作」の論拠を超えて、SR / キーボードユーザーへの「動作しなかった」通知欠落は a11y 要件として独立に対処すべき
5. **W-P-001**: `closeDialog` での `setError(null)` が、Esc クローズ後の summary 表示寿命を意図せず短縮する

### Decision

以下の修正を AccountDeleteForm 側だけで完結させる（共通プリミティブ API 拡張なし、ADR-005 の「scope 外」原則維持）:

1. **トリガー「続けて削除する」開時に `setError(null); setDraft("")` を呼ぶ** — 再オープン時に pre-fill / outer summary 二重表示を解消（W-F-001 / W-F-004）
2. **input の `onChange` で `error?.kind === "validation"` のときだけ `setError(null)` を呼ぶ** — validation エラーは編集で即時クリア、system / business エラーは編集で消えない（W-F-002）
3. **`onConfirm` 早期 return パスで `SerializedValidationError` 相当の `setError({ kind: "validation", code: null, message: "ユーザー名が一致しません", fieldErrors: { confirmation: ["ユーザー名が一致しません"] } })` を立てる** — `<p role="alert">` 経路で SR / 視覚通知を発火（W-A-002）
4. **`useId()` を 2 つ追加して `hintId` / `errorId` を作り、input の `aria-describedby` で参照** — fieldErrors / hint と input の SR 上の関係を明示（W-A-001）
5. **`<label>` を「ユーザー名 `{user.username}` を入力」に変更** — accessible name 単独で「どの username を入れるか」を伝える（W-A-004）
6. **`closeDialog` から `setError(null)` を削除** — summary 表示寿命は「次のトリガー開」または「次の submit 成功」まで延長（W-P-001）
7. **TagActions / UsersTable / AccountDeleteForm の `<p role="alert">` summary に `aria-live="polite"` を追加** — 動的変化を SR が拾えるよう補強（W-A-005、最小変更）

### Consequences
- 良い点:
  - WCAG 3.3.1 Error Identification を満たす（W-A-002）
  - 破壊的アクションの安全装置（ユーザー名一致確認の摩擦）が再試行経路でも失われない（W-F-001）
  - SR ユーザーが input にフォーカス時にエラー文言・hint テキストが再読み上げされる（W-A-001 / W-A-004）
  - validation エラーがリアルタイム入力で消える（W-F-002）
  - summary 表示寿命が一貫する（W-P-001）
- トレードオフ:
  - クライアント側で `SerializedValidationError` を立てるため、`code: null` のリテラルが入る（server 由来でない validation error）。型 narrowing は `kind === "validation"` で正しく機能する
  - hint テキスト「Tab キーで入力欄に移動できます」は引き続き常時表示（W-F-003 は受容、初手 panel focus の状況でのみ意味があるが、消すと逆に「なぜ動かないか」がわからなくなる）
  - `aria-live="polite"` 追加は他 caller の挙動には影響しないが、role="alert" は元々 assertive 寄りなので併用すると一部 SR で読み上げ順が変わる可能性 — 受容
- スコープ外として継続:
  - W-A-003 (SR multi-read concern) — VoiceOver / NVDA 実機確認が必要、別 Issue 候補
  - W-A-006 (token contrast) — `spec/design/tokens.md` 追記、別 Issue
  - W-P-002 (system error 経路の SKIP) — `progress.md` に記録、別途検証手段が必要
  - W-P-003 (admin 自身の demote ボタン) — UsersTable のロジック変更、別 Issue
