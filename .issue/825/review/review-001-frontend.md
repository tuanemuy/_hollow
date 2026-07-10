# PR #831 レビュー — Frontend 観点（Issue #825）

対象: P12 モバイルエディタの残 UX 改善（ツールバー圧縮 / ネイティブダイアログのカスタム UI 化）
レビュー日: 2026-07-10
対象ファイル: `WysiwygEditor.tsx` / `NoteEditor.tsx` / `LinkDialog.tsx` / `linkUri.ts` / `styles.ts`（editor）/ 各テスト / `spec/design/pages/mobile/P12-editor.html`

## 総評

計画（plan.md）と ADR-001/002/003 の設計方針にほぼ忠実に実装されている。特に最重要リスクだった「オーバーフロー `<Menu>` パネルの overflow クリップ」と「レール外配置による sticky 追従回帰」に対し、`editorToolbar` を `editorToolbarWrap`（sticky / role / 幅）と `editorToolbarRail`（非 sticky 内側スクローラ）へ分割し、`max-sm:flex-1` をモバイル限定に留め、`<Menu>` を `sm:hidden` ラッパーで包む — という確定形が正確に落とし込まれている。単一 `buttons` 配列 + `group` フラグによる「並び替えなし・可視性のみ breakpoint 分岐」も設計どおりで、AC-1/AC-2 の両立、renamed export のダングリング参照ゼロ、テストの広範な書き換え（#286/#696/#697 含む全 describe）も確認できた。

一方で、`LinkDialog` の URL 入力が `type="url"` になっており、`isAllowedLinkUri` が明示的に許可し、かつインラインエラー文言（「... / 相対 URL のみ」）が広告している**相対 / アンカー / クエリ URL がブラウザのネイティブ制約検証で submit ブロックされる**という機能上の矛盾がある。ここが唯一の Blocker。

---

### Frontend

#### Blockers

- **[B-001]** `LinkDialog` の URL 入力が `type="url"` で、相対 / アンカー / クエリ URL の挿入がブラウザにブロックされる
  - 場所: `app/components/note/editor/LinkDialog.tsx:82`（`<input type="url" ...>`）／ 検証ロジック `linkUri.ts:12`（`startsWith("/"|"#"|"?")` を許可）／ 文言 `LinkDialog.tsx:16-17`
  - 理由: `<input type="url">` は非空の値に対しネイティブ制約検証を行い、**絶対 URL（スキーム付き）でないと `:invalid`** になる。フォーム送信時に無効なコントロールがあると submit イベント自体が発火せず（ブラウザが検証バブルを出して中断）、`onSubmit` の `isAllowedLinkUri` 検証に到達しない。`isAllowedLinkUri` は `/foo` `#sec` `?q=x` を**明示的に true**とし、エラー文言も「相対 URL のみ」を許可対象として広告しているのに、UI 層（`type="url"`）がそれらの入力を送信できなくしている。TipTap 側 `isAllowedUri`（同じ `isAllowedLinkUri`）は相対リンクの表示を許すため、「貼り付けた相対リンクは表示できるがダイアログからは入力できない」という非対称も生じる。旧 `window.prompt`（プレーン文字列を返すため相対 URL 可）からの機能後退でもある。`mailto:`/`https:` は絶対 URL として通るので気付きにくく、manual-test（TC-4）も `https://` と `javascript:` しか試しておらず相対 URL を素通ししている。
  - 提案: `type="url"` を `type="text"` + `inputMode="url"`（ソフトキーボード最適化は維持）に変更し、スキーム検証は既存の `isAllowedLinkUri`（submit 時）に一本化する。あわせて相対 URL の回帰テストを `wysiwygEditorLinkDialog.test.tsx` に 1 本追加（`/notes/xxx` や `#section` を入力 → submit → ダイアログが閉じ `onSubmit` が呼ばれる）すると防止になる。

#### Warnings

- **[W-001]** リンク挿入後、フォーカスがエディタ本文ではなくツールバーの「リンク」ボタンへ戻る（旧 `window.prompt` からの微小な後退）
  - 場所: `WysiwygEditor.tsx:422-426`（`onLinkSubmit`）/ `428-432`（`onLinkRemove`）
  - 理由: `onLinkSubmit` は `editor.chain().focus()...run()` を実行してから `setLinkDialog(null)` する。`setLinkDialog(null)` による `LinkDialog` アンマウントで `Dialog` の focus 復帰 cleanup（`previousActiveRef.current.focus()`、`Dialog.tsx:220-225`）が走り、ダイアログを開く直前にアクティブだった「リンク」トリガーボタンへフォーカスを戻す。結果、直前に実行した `editor.focus()` が上書きされ、リンク挿入直後にキャレットがエディタから外れて連続入力が途切れる。旧 `window.prompt` は dismiss 後にエディタへフォーカスが残っていた。a11y 的には「トリガーへ復帰」は妥当な既定挙動でもあるため厳密な誤りではないが、書字面としては挿入直後に本文へ戻る方が自然。
  - 提案: 復帰先をエディタにしたい場合、`Dialog` の focus 復帰が走った後（例: `requestAnimationFrame` 経由 or アンマウント後の effect）に `editor.commands.focus()` を再実行する、あるいは挿入後にトリガーへ戻る挙動を許容するなら本コメントを N 扱いに降格して意図を JSDoc に明記する。少なくとも設計意図（どちらを正とするか）を残すこと。

- **[W-002]** URL 入力欄とインラインエラーが `aria-describedby` で関連付けられていない
  - 場所: `LinkDialog.tsx:80-97`（`<input aria-invalid=...>` と `<p role="alert">`）
  - 理由: エラーは `role="alert"` により出現時に一度読み上げられるが、入力欄自身と `aria-describedby` で結び付いていないため、エラー表示後に入力欄へフォーカスを戻した際にスクリーンリーダーがエラー内容を関連情報として再提示できない。AC-7 は `role="alert"` 表示までは満たすが、フィールド ↔ メッセージの関連付けまで行うと再入力時の a11y がより堅牢になる。
  - 提案: エラー `<p>` に `id`（`useId` 由来）を付与し、入力に `aria-describedby={error !== null ? errorId : undefined}` を渡す。`aria-invalid` は既に条件付与済みなので追加コストは小さい。

#### Notes

- **[N-001]** 単一 `buttons` 配列 + `group: "primary" | "overflow"` フラグ方式（`WysiwygEditor.tsx:444-548`）が設計どおり実装されており、Link/Image も同配列に統合、元の DOM 順（Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code/Link/Image）を保持したまま `max-sm:hidden`（レール）と `sm:hidden`（メニュー）で可視性のみを排他分岐している。AC-1（モバイル primary 6 個 + `⋯`）と AC-2（デスクトップ 11 個・並び順不変）を並び替えなしで両立できており、責務分離・データ単一化ともに良好。

- **[N-002]** レール外配置の確定形（ADR-001）が正確。`styles.ts` で `editorToolbar` を `editorToolbarWrap`（`sticky top-… z-20 mb-4` + `role="toolbar"` 保持先 + `self-start`/`max-sm:self-stretch`）と `editorToolbarRail`（非 sticky、`max-sm:flex-1 min-w-0` はモバイル限定修飾）へ分割し、`<Menu>` を `sm:hidden` ラッパーで包んでデスクトップで DOM ごと消している（`display:none` は flex item から外れるため `gap-[2px]` の phantom 余白も出ない）。sticky を非クリップの外側ラッパーへ移設した点でヘッダー直下追従の回帰も回避（manual-test TC-2 で top=72px 一定を実測）。JSDoc に「`flex-1` を `max-sm:` に留める理由」「rail は overflow クリップコンテナだから Menu を外に出す」旨が残されており、後続実装者への説明責任も果たしている。

- **[N-003]** `⋯` トリガーの chrome（`EDITOR_TOOLBAR_OVERFLOW_TRIGGER = EDITOR_TOOLBAR_BTN + data-[open]:bg-surface-hover`）、メニュー項目の適用中表現（`btn.isActive?.()` → `Check`（accent））、`data-open={overflowOpen || undefined}` / `data-primary={... || undefined}` / `data-danger=""` の属性規約（ADR-003）、`Menu`/`Dialog`/`ConfirmDialog`/`fieldControl`/`formError`/`dialogActions` 等の共通プリミティブ・スタイル定数流用はいずれも規約準拠。新規 CSS / `@apply` の追加なし。utility-first と design token 方針を守れている。

- **[N-004]** `LinkDialog` の条件マウント（mount == open、ADR-003-1）で `useState(initialHref)` の seed 問題を reset effect / `key` なしで解決している点、TipTap 操作（`setLink`/`unsetLink`/`extendMarkRange`）を親に残しダイアログは入力・検証・コールバックのみを担う責務分離、フォーム submit の `event.stopPropagation()`（親 NoteEditor `<form>` への伝播抑止、manual-test TC-edge1 で確認）はいずれも設計どおりで良い。

- **[N-005]** SSOT モック `spec/design/pages/mobile/P12-editor.html` が overflow-menu 方式へ更新されている（AC-9 の「注記のみ不可・更新必須」を満たす）。`.tb-heading` + `overflow-x:auto` を撤去し `.tb-overflow`/`.tb-menu`/`.tb-menu-item` を追加。ただしモック側 toolbar は `aria-label="書式設定"`、実装は `aria-label="書式"` という文言差が残る（#825 以前からの既存差分でスコープ外だが、モックを SSOT として更新した今 揃えておくと次のレビュアーが迷わない）。ブロッカーではない。

---

## 補足: AC 別 Frontend 充足状況

- AC-1（390px で primary + `⋯` が横スクロールなし）: 充足。実測 scrollWidth=clientWidth=358（TC-1）。
- AC-2（デスクトップ 11 ボタン・並び順・`⋯` 非描画で 1px 不変）: 充足。`sm:hidden` で Menu ラッパーごと DOM から消え phantom gap なし（TC-desktop）。
- AC-3（WAI-ARIA Menu / 適用中表示）: 充足（roving/Esc/外側クリック/フォーカス復帰は primitive 委譲、`Check` 表示は実装確認済み。※メニュー内適用中の決定的検証は選択位置依存で manual では副次確認）。
- AC-4/AC-5（未保存確認 `ConfirmDialog` + 遅延遷移、装飾ゲート順序・二重プロンプトなし）: 充足。`proceedModeSwitch` に `surface === "edit"` スコープを内包（`NoteEditor.tsx:294`）、`confirmUnsavedSwitch` が clear + `proceedModeSwitch` を同一ハンドラでバッチ。
- AC-6（`LinkDialog` で URL 入力・挿入・解除）: **B-001 により相対 URL 系が不達**。絶対 URL / 解除は充足。
- AC-7（非対応スキームがインライン `role="alert"`・ダイアログ継続）: 充足（`javascript:` 等の絶対スキームは submit 到達しインライン表示。ただし相対 URL は B-001 で submit 前にブロックされ、この経路に乗らない）。
- AC-8（typecheck/lint/format + test）: テストは新 UI に更新済み（本レビューでは静的確認のみ。実行結果は別途）。
- AC-9（SSOT モック更新）: 充足（N-005）。
