# PR #831 レビュー — Accessibility / UX 観点（Issue #825）

対象: `app/components/note/editor/WysiwygEditor.tsx` / `LinkDialog.tsx` / `linkUri.ts` / `styles.ts` / `NoteEditor.tsx`、共通プリミティブ `Menu.tsx` / `Dialog.tsx` / `ConfirmDialog.tsx`
基準: plan.md AC-3（WAI-ARIA Menu 準拠・適用中状態の判別）、AC-7（`role="alert"` インライン）、adr.md ADR-001（MenuItem の `aria-pressed` 非対応トレードオフ）
判定方針: 「実害があるか」で Blocker / Warning を仕分け、理想論の過剰要求はしない。

---

## Accessibility / UX

### Blockers

- なし

主要フロー（オーバーフローメニューの roving/Esc/外側クリック/フォーカス復帰、未保存確認・リンク挿入ダイアログのフォーカストラップ・初期フォーカス・`role="alert"`、デスクトップ不変、タッチターゲット）はいずれも既存プリミティブに正しく委譲されており、操作不能に至る欠陥は見当たらない。

### Warnings

- **[W-001]** オーバーフローメニューの「適用中」チェックがスクリーンリーダーに一切伝わらない
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:667-669`（`<Icon icon={Check} className="text-accent" />`）
  - 理由: `Icon` は `label` 未指定だと `aria-hidden="true"` になる（`app/components/common/Icon.tsx:61-68` で確認）。したがって overflow メニュー項目（取り消し線/見出し2/見出し3/引用/インラインコード）の適用中状態は「視覚的なチェックのみ」で、SR ユーザーには項目名しか読まれない。これら 5 書式は**モバイルではこのメニューが唯一の到達経路**であり（レール側は `max-sm:hidden`＝a11y ツリーからも除外）、レール上の主要ボタンが持つ `aria-pressed` に相当する状態通知が SR ユーザーには完全に欠落する。トグル（例: 取り消し線）で「今 ON か OFF か」を判別できないのは実害。AC-3 は「視覚表示」に限定して定義され ADR-001 でトレードオフとして受容済みだが、a11y 実害の観点では格上げ相当。
  - 提案: `MenuItem` の `role="menuitemcheckbox"` 化（プリミティブ拡張）が本筋だが重い。最小コストでは Check アイコンに可読名を与える（`<Icon icon={Check} label="適用中" />` で `role="img"`+`aria-label` になる）か、視覚的に隠したテキスト（例: `<span className="sr-only">（適用中）</span>`）を項目末尾に添える。これだけで SR ユーザーが適用状態を判別できる。

- **[W-002]** `LinkDialog` の `type="url"` + フォーム `noValidate` 無しで、相対 URL がブラウザのネイティブ検証にブロックされる
  - 場所: `app/components/note/editor/LinkDialog.tsx:76`（`<form onSubmit={submit}>`、`noValidate` なし）/ `:80-92`（`<input type="url">`）
  - 理由: `type="url"` の入力は絶対 URL 以外で `typeMismatch` となり、submit 時にブラウザのネイティブ制約検証が発火して**送信自体が中止**され、`onSubmit`（`submit`）が実行されない。`isAllowedLinkUri` は `/`・`#`・`?` 始まりの相対/フラグメント/クエリ URL を**意図的に許可**している（`linkUri.ts:12-14`、TipTap `isAllowedUri` と共有）にもかかわらず、それらは LinkDialog からは挿入できず、代わりに設計外のネイティブ検証バブルが出る。`window.prompt` 時代は任意文字列を受けたので相対リンク挿入は退行。AC-7 が求める「ダイアログ内インライン `role="alert"` で一貫」という UI 一貫性の趣旨にも反する（相対 URL でだけネイティブ UI が混入）。manual-test（TC-4）は `https://` と `javascript:` のみ検証で相対 URL 未カバーのため見逃されている。
  - 提案: 検証を共有ガード `isAllowedLinkUri` に一本化する。`type="text" inputMode="url"`（モバイルの URL キーボードは維持）にするか、`<form noValidate onSubmit={submit}>` を付けてネイティブ検証を無効化し、インライン `role="alert"` を唯一のゲートにする。

### Notes

- **[N-001]** `LinkDialog` のエラーが入力欄と関連付けられていない
  - 場所: `app/components/note/editor/LinkDialog.tsx:80-97`
  - 内容: エラー `<p role="alert">` は出現時に 1 回アナウンスされる（AC-7 は充足）が、`aria-describedby` で入力欄に紐づいていない。`aria-invalid` は付くものの、エラー後に入力欄へフォーカスを戻した SR ユーザーはエラー本文を参照できない。`ConfirmDialog` は error を `aria-describedby` に織り込んでいる（`ConfirmDialog.tsx:96-103`）ので、同様に `id` を振って `aria-describedby={error ? errId : undefined}` にすると一貫し発見性が上がる。

- **[N-002]** overflow メニュー項目のタップ床がエディタ内基準（44px）を下回る
  - 場所: `app/components/common/styles.ts` `menuItem`（`px-3 py-2`、`min-h` なし）→ モバイルで実効約 36px
  - 内容: エディタのツールバーボタン（`TOUCH_TARGET_SQUARE`＝44px）・ダイアログボタン・`fieldControl`（いずれも `TOUCH_TARGET`＝44px）が 44px を厳守しているのに対し、overflow メニュー項目は約 36px。WCAG 2.5.8（AA, 24px）は満たすが、モバイルで 5 書式に到達する主要導線がプロジェクト内の他所より小さいのは一貫性の欠如。共有プリミティブ（`NoteActionsMenu` 等と共通）ゆえ本 PR 固有ではないが、モバイルでメニューを主導線化した本 Issue で顕在化する。必要なら `menuItem` に `max-sm:min-h-[44px]` を検討。

- **[N-003]** `role="toolbar"` に roving tabindex（矢印キー移動・単一タブストップ）が未実装
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:605`（外側ラッパー `role="toolbar"`）
  - 内容: WAI-ARIA Toolbar パターンは矢印キーでの項目移動＋タブストップ 1 個を推奨するが、本ツールバーは全ボタンが個別タブストップ。ただしこれは `role` をレールから外側ラッパーへ移設しただけで本 PR が新たに導入した挙動ではなく、全ボタンが Tab で到達可能なため実害はない。完全性のため記録に留める。

---

## 良い点（確認済み）

- overflow `<Menu>` を `overflow-x-auto` レールの**外側**の非クリップ sticky ラッパーに出し、`role="toolbar"`/sticky/幅を移設した設計は ADR-001 の確定形どおりで、パネルのクリップ回避・ヘッダー直下追従（TC-2 で座標計測 PASS）・デスクトップ不変（TC-desktop で `⋯` 非描画を確認）を成立させている。
- Menu プリミティブへの委譲により roving tabindex・Esc/外側クリック dismiss・トリガーへのフォーカス復帰（`closeAndRestoreFocus`→`triggerRef.focus()`）が保証される（TC-edge2 で確認）。overflow ボタンはモバイル `max-sm:hidden`・デスクトップ `sm:hidden` で排他描画され、a11y ツリーへの二重露出もない。
- `LinkDialog` は `initialFocusRef` で URL 入力へ初期フォーカス、`ariaLabelledBy` で可視 `<h2>` と名前を連動、`role="alert"` インラインエラーでダイアログ継続（AC-7 の趣旨を満たす。ただし W-002 の相対 URL 経路は例外）、submit の `stopPropagation` で親フォーム波及を抑止（TC-edge1 で確認）。TipTap 操作を親に残す責務分離も守られている。
- 未保存確認は `ConfirmDialog`（`role="alertdialog"`）で、`proceedModeSwitch` 抽出時も装飾ゲートの `surface === "edit"` スコープを維持し、未保存→装飾の順序・二重プロンプト回避を保っている（AC-4/AC-5）。
- `disabled`（`isDisabled`）が主要ボタン・overflow トリガー・各 MenuItem に一貫伝播。ダイアログ/フィールド/ツールバーのタッチターゲットは 44px を厳守（N-002 のメニュー項目を除く）。
