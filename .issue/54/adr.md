# ADR — Issue #54: Dialog 共通化

## ADR-001: Dialog の置き場は `app/components/common/`

### Status
Accepted

### Context
Issue 本文では `app/components/_shared/` が例示されているが、既存の `ConfirmDialog` は `app/components/common/` に配置済みで、Issue #13 ADR-005 として「全ドメインから依存可能な置き場として `common/` を採用」する経緯が記録されている。`_shared/` は現時点で未存在。

### Decision
新規 `Dialog` は `app/components/common/Dialog.tsx` に配置する。

### Consequences
- 良い点: 既存の cross-domain 置き場と一貫。ConfirmDialog と同居でディレクトリが分散しない
- トレードオフ: Issue 本文の例示と微妙にズレるが、本文末尾の「等」が逃げ道

---

## ADR-002: focus trap は自前実装

### Status
Accepted

### Context
focus-trap-react などの既存ライブラリもあるが、本 Issue の要件は標準的な focusable セレクタで 30〜50 行で書ける範囲。

### Decision
外部ライブラリは追加せず、`useEffect` + 標準 DOM API で自前実装する。focusable セレクタは `'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'`。

### Consequences
- 良い点: 依存追加なし、バンドルサイズへの影響ゼロ、挙動を完全把握
- トレードオフ: Shadow DOM、iframe 内フォーカス、`inert` 属性などのエッジケースには未対応（現状用途では問題なし）

---

## ADR-003: 背景クリックでダイアログを閉じない

### Status
Accepted

### Context
既存ダイアログ 6 件すべてが「キャンセルボタン」のみで閉じる挙動。フォーム入力中の誤クリックでデータ消失リスクもある。

### Decision
背景クリックでは閉じない。`onClose` はキャンセルボタンと Esc キーのみ。

### Consequences
- 良い点: 既存挙動と互換、誤操作リスク抑制
- トレードオフ: モーダル UI の慣例に反する。必要なら後付けで `closeOnBackdropClick?: boolean` 追加可能（YAGNI）

---

## ADR-004: `closable={false}` で Esc 無効化

### Status
Accepted

### Context
各ダイアログは `useTransition` で `isPending` を管理し、送信中はキャンセルボタンを `disabled` にする。Esc キーには `disabled` の概念がないため、Dialog 側で抑制機構が必要。

### Decision
`<Dialog>` に `closable?: boolean`（デフォルト `true`）プロップを追加し、`false` のとき Esc を無視する。各 XxxDialog の実装内部で `closable={!isPending}` を渡す。

### Consequences
- 良い点: 進行中のフォーム送信が Esc で中断されない
- トレードオフ: XxxDialog 内部で渡し忘れると進行中でも Esc で閉じてしまう。レビューでのチェックが必要

---

## ADR-005: Portal target は `document.body` 固定

### Status
Accepted

### Context
`createPortal` の target を `document.body` 直下にするか専用ノードにするかの選択。

### Decision
`document.body` を直接 target にする。

### Consequences
- 良い点: 追加メンテ不要、YAGNI 原則
- トレードオフ: 将来カスタマイズしたくなったら拡張が必要

---

## ADR-006: `AccountDeleteForm` はスコープ外

### Status
Accepted

### Context
`app/components/identity/AccountDeleteForm/index.tsx` は `<section role="dialog">` で実装された画面遷移型フォーム。Issue 本文の対象リストにも明示されていない。

### Decision
本 Issue では `AccountDeleteForm` を変更しない。`aria-modal` 以外の AT 隔離手段（兄弟 `aria-hidden` / `inert` 付与）もスコープ外とし、`aria-modal="true"` で十分とする。

### Consequences
- 良い点: スコープ拡大を回避
- トレードオフ: A11y 改善が全ダイアログには適用されない（別 Issue 候補）

---

## ADR-007: MergeTagDialog のローカル定数は Dialog 内部に集約される分のみ削除

### Status
Accepted（修正版）

### Context
当初案では MergeTagDialog のローカル定数（`DIALOG_BACKDROP` / `DIALOG` / `DIALOG_TITLE` / `DIALOG_ACTIONS`）を `note/styles.ts` の SSOT に統合する方針だった。しかしレビューで「`tag/MergeTagDialog.tsx` から `note/styles.ts` への新規 import は cross-domain 依存の拡張」「フォーム部品（`FIELD_INPUT` 等）が統合範囲外なら ADR-007 の "スタイル分散の解消" は実態と不一致」との指摘。

### Decision
Dialog 内部に集約される `DIALOG_BACKDROP` / `DIALOG` は削除（Dialog が内部で持つ）。`DIALOG_TITLE` / `DIALOG_ACTIONS` はインラインで Tailwind utility 文字列を直書きする（cross-domain import を増やさない）。フォーム部品 (`FIELD_INPUT` / `FIELD_LABEL` / `FORM_ERROR` / `PILL_BTN`) は触らない。

### Consequences
- 良い点: cross-domain 依存を増やさず、Dialog の共通化メリットだけを享受
- トレードオフ: フォーム部品のスタイル分散は残る（別 Issue 候補）。`shadow-[0_16px_32px_rgba(0,0,0,0.15)]` → `shadow-lg` への変更でビジュアル差分は残る

---

## ADR-008: Dialog は panel スタイルも内包し、aria-modal は内部で固定付与

### Status
Accepted

### Context
当初案では Dialog が `dialogBackdrop` だけを内部適用し、callsite が `<form className={dialog}>` を書く設計だった。しかしレビューで「callsite が毎回 `dialog` を import する必要があり cross-domain 依存が拡散する」「`aria-modal` の付与責務が Dialog/callsite どちらか不明瞭」との指摘。

### Decision
- Dialog は backdrop と panel の 2 層 div を内部で持ち、`children` を panel 内側にレンダリングする。callsite は `<form onSubmit={...}>` だけを渡す
- `aria-modal="true"` は Dialog 内部で常に付与し、callsite からは渡せない（モーダル前提の wrapper）
- `dialog` / `dialogBackdrop` の cross-domain import は Dialog.tsx 1 ファイルに閉じ込める

### Consequences
- 良い点: callsite から `dialog`/`dialogBackdrop` の import が消える。aria-modal の付与漏れリスクなし
- トレードオフ: panel の class 名を callsite から変更できなくなる。必要になれば `panelClassName?` プロップで拡張可能（YAGNI）

---

## ADR-009: focus 復帰先のフォールバックなし

### Status
Accepted

### Context
Dialog close 時に `previousActive` へ focus を戻すが、トリガー要素が unmount されている場合（router.navigate、行削除など）のフォールバック先を決める必要がある。選択肢: (a) body へ明示的に focus、(b) 親リストの先頭、(c) 何もしない（ブラウザのデフォルト）。

### Decision
`previousActive instanceof HTMLElement && previousActive.isConnected` の両方が真のときだけ `focus()` を呼ぶ。それ以外は何もしない（ブラウザのデフォルト = body にフォーカスが落ちる）。

### Consequences
- 良い点: 実装が単純、予期しない先へのフォーカス移動なし
- トレードオフ: Confirm で行削除 → 元の行が消えた場合、フォーカスが body に落ちる。AT 観点ではやや弱いが、現状の挙動からの後退ではない

---

## ADR-011: `aria-modal` の biome 警告を suppress コメントで抑制

### Status
Accepted

### Context
biome の `lint/a11y/useAriaPropsSupportedByRole` は、`<div>` に `aria-modal` を付けるとき `role` の静的値からサポート可否を判定する。Dialog では `role` を props 経由の動的値で渡すため、biome は警告を出す。実際には `role` の型は `"dialog" | "alertdialog"` に限定されており、どちらも `aria-modal` をサポートする。

### Decision
panel の `<div>` 直前に `// biome-ignore lint/a11y/useAriaPropsSupportedByRole: ...` の suppression コメントを置く。動的 role でも型が両方とも対応 role に限定されている旨を明示。

### Consequences
- 良い点: lint エラーを回避しつつ Dialog の柔軟性（role 切替）を維持
- トレードオフ: suppression コメント 1 行が増える。biome 側で動的 role の静的解析が改善されれば撤去可能

---

## ADR-012: `exactOptionalPropertyTypes` 対応で aria-* プロップを `| undefined` 明示

### Status
Accepted

### Context
プロジェクトの tsconfig は `exactOptionalPropertyTypes: true` を有効化している。`ConfirmDialog` 側で `ariaDescribedBy={description !== undefined ? descId : undefined}` のように `string | undefined` を渡すため、Dialog 側で `ariaDescribedBy?: string;` のままだと TS2375 エラーになる。

### Decision
`DialogProps` の `ariaLabel?` / `ariaLabelledBy?` / `ariaDescribedBy?` の型を `string | undefined` 明示に変更し、callsite から `undefined` を渡せるようにする。

### Consequences
- 良い点: callsite で条件付きに undefined を渡す既存パターン（ConfirmDialog）と互換
- トレードオフ: 型シグネチャがやや冗長になる（プロジェクト全体で `exactOptionalPropertyTypes` を採用している以上、不可避）

---

## ADR-013: Esc handler に IME composition ガードを入れる

### Status
Accepted

### Context
review-001 Robustness B-001 指摘。日本語入力プロダクトとして、IME 変換中の Esc キーは「IME 変換キャンセル」用途に使われるが、`document` レベルの keydown listener が無条件にダイアログを閉じると、ユーザーの入力フォーム状態が消失する。既存 6 ダイアログには Esc クローズ自体がなかったので、これは純粋な regression。

### Decision
Esc handler の冒頭で `if (event.isComposing || event.keyCode === 229) return;` を実行し、IME composition 中は handler を素通りさせる。

### Consequences
- 良い点: 日本語入力ユーザーが IME 変換キャンセル時に意図せずダイアログを閉じる事故を防ぐ
- トレードオフ: IME composition 検出は `event.isComposing`（Web Standards）に依存。一部の古いブラウザでは `keyCode === 229` のフォールバックが必要なため両方を見ている

---

## ADR-014: body scroll lock を module-scope の reference counter で管理

### Status
Accepted

### Context
当初は「単一ダイアログ同時表示前提」で `document.body.style.overflow` を直接操作していた。しかし `BulkActionBar` は複数の独立した `useState`（move / visibility / export / trash confirm）を持ち、誤って同時 open すると lock 状態が壊れる可能性がある（dialog A が `""` を保存して `hidden` セット → dialog B が `hidden` を保存して `hidden` セット → A unmount で `""` 復元 → B unmount で `hidden` 復元 → ページが永続スクロールロック）。review-001 W-Rob-001 指摘。

### Decision
`bodyScrollLockCount` / `bodyScrollLockPrevious` を module-scope に置き、最初の dialog が lock したときだけ overflow を保存・セット、最後の dialog が unmount したときだけ復元する。

### Consequences
- 良い点: 複数ダイアログが意図せず同時 open しても scroll lock が壊れない。防御コストは数行で済む
- トレードオフ: module-scope mutable state を導入する（テスト時にリセット必要だが、Dialog 単体テストは現状ない）

---

## ADR-010: `Dialog` / `DialogInner` の 2 階層構造

### Status
Accepted

### Context
`open === false` 時に何もレンダーしないモーダルは、ナイーブに実装すると hooks 順序違反や effect cleanup 漏れを起こしやすい。例えば `if (!open) return null;` を `useEffect` の前に書くと hooks 順序が変わってルール違反、後に書くと cleanup が走らない。

### Decision
外側 `Dialog` コンポーネントは `if (!open) return null;` のみを担当し、`open === true` のとき `<DialogInner>` をマウントする。`useEffect` / `useState` / `useRef` などの hooks は全て `DialogInner` 内で宣言する。これにより:
- `DialogInner` は open 遷移時に確実に mount/unmount され、effect cleanup が確実に走る
- hooks 順序違反の余地が消える
- `mounted` フラグも `DialogInner` のローカル state として安全に管理できる

### Consequences
- 良い点: 安全な実装パターン、テスト容易性
- トレードオフ: コンポーネントが 2 つになる。同じファイル内に閉じ込めれば可読性は損なわれない

---
