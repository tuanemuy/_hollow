# ADR — Issue #825: P12 モバイルエディタの残 UX 改善

## ADR-001: WYSIWYG ツールバー圧縮は「モバイル限定のオーバーフローメニュー」で行う

### Status
Proposed

### Context
WYSIWYG ツールバーは書式ボタン計 11 個（Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code + Link + Image）。390px 幅では横スクロールが必須で「全ボタンが一目で見えない」。Issue は「UI 圧縮 or オーバーフローメニュー化」を求めるが、スコープ外に「デスクトップレイアウトの変更」がある。検討した選択肢:

- (A) **モバイル限定オーバーフローメニュー**: 低頻度書式をモバイルでのみ `⋯` メニューに送り、デスクトップは全ボタンインラインのまま。可視性分岐は `max-sm:`/`sm:` の静的 breakpoint variant で行う。
- (B) **見出し統合ドロップダウンのみ**（モバイルモック `.tb-heading` 準拠）: H2/H3 を「見出し」ドロップダウンに集約。圧縮効果は 11→10 と小さく、かつデスクトップにも波及する。
- (C) **デスクトップ含む全環境でオーバーフロー化**: 一貫するがデスクトップで発見性が下がり、スコープ外の「デスクトップレイアウト変更」に該当。
- (D) **モバイルは横スクロール維持（現状）**: モックも `overflow-x: auto` を維持しているが、Issue の「一目で見えない」課題を解消しない。

制約として、本プロジェクトはモバイル対応を実行時 JS breakpoint 判定ではなく CSS variant で行う方針（`editorActions` ADR-003 等）。また `NoteActionsMenu` に確立済みのオーバーフローメニューパターン（`<Menu>`/`<MenuItem>` + `⋯`）がある。

### Decision
(A) を採用する。**単一の `buttons` 配列を維持**し、各要素に `group: "primary" | "overflow"` を付与する（現状 `buttons` 配列外でレンダーしている Link/Image も同じ宣言に集約して `group: "primary"`）。**元の DOM 並び順は保持**し、可視性だけを breakpoint で分岐させる（低頻度書式を並び替えずにモバイルでのみ隠す）。

- primary = Bold/Italic/UL/OL/Link/Image、overflow = Strike/H2/H3/Quote/Code。
- レール（`editorToolbar`）: 全ボタンを**元順のまま**描画し、overflow 要素に `max-sm:hidden`（= デスクトップのみ表示）を付与。デスクトップは並び順・見た目が完全に不変。モバイルは primary 6 個が元順で連続して残る。
- オーバーフロー機構（`⋯` トリガー + `<Menu>`、`NoteActionsMenu` 踏襲）は**レール（`overflow-x-auto` の両軸クリップコンテナ）の外側**に、`sm:hidden` コンテナで包んで配置する。`Menu`/`usePopover` はパネルを Portal ではなくインライン `absolute` 描画するため（実コード確認済み）、レール内に置くとクリップされて見えない。レール外配置で既存プリミティブ非改変のまま解消し、`sm:hidden` ラッパーでデスクトップでは Menu の `relative` ラッパーごと DOM から消して空ラッパーによる余白増も防ぐ。
- **レール外配置の確定形（sticky/幅/role の移設 — round 2 arch-risk P-001）**: レール外配置を素朴に実装すると `editorToolbar` の documented なヘッダー直下 sticky 追従（`sticky top-[calc(var(--header-height)+var(--space-2))] z-20`）が背の低い外側ラッパーに閉じ込められて回帰する。これを防ぐため option A（外側ラッパー方式）に一本化したうえで、次の 3 点を確定形とする:
  1. **sticky 移設**: `sticky top-… z-20` および `mb-4` を外側ラッパーへ移し、外側ラッパー自身を sticky 要素にする（ラッパーは overflow コンテナでないため Menu パネルをクリップしない）。内側のスクロールレール（`editorToolbar` = `overflow-x-auto`）は**非 sticky の内側スクローラに降格**する。追従を維持しつつクリップも回避できる。`editorToolbar` は本ファイル専用（`WysiwygEditor.tsx:550` の 1 箇所）なので styles.ts 側の分割で完結する。
  2. **幅**: レールの `max-sm:self-stretch` は flex-row の外側ラッパー内では cross 軸が垂直になり全幅化しないため、**`max-sm:flex-1 min-w-0`** に置換する（`⋯` を行末に固定しつつレールをモバイルで可変幅に埋める）。`flex-1` は必ず `max-sm:` 修飾でモバイル限定にすること — 無修飾の `flex-1` にすると、cross 軸 stretch で全幅になるデスクトップの外側ラッパー内でレールが main 軸いっぱいに grow し、現状の shrink-to-fit・左寄せ pill が全幅化して AC-2（デスクトップ 1px 不変）を壊す。**外側ラッパー・レールともデスクトップでは grow させない**（外側ラッパーは全幅の透明ラッパー、レールは既定 flex `0 1 auto` の shrink-to-fit・左寄せを保つ）。
  3. **role**: `role="toolbar" aria-label="書式"` はレールから**外側ラッパーへ移設**し、`⋯`（オーバーフロートリガー）を含めて 1 つのツールバーとして提示する。
  - なお併記していた option B（現 `editorToolbar` を維持し Menu ラッパーだけを `flex flex-col` 直下の別兄弟に出す案）は、兄弟がツールバー行の下に別行落ちして `⋯` が行末に付かず追従もしないため UX を満たさず、**採用しない**。

overflow アクション定義はレール（デスクトップ表示用）とメニュー（モバイル用）で単一配列を再利用する。

なお本方式は設計 SSOT モック（`spec/design/pages/mobile/P12-editor.html`、現状は `.tb-heading` 見出しドロップダウン + `overflow-x: auto` 維持）と乖離するため、**同モックを overflow-menu 方式へ更新して乖離を清算する**（注記のみでの清算は不可 — plan.md AC-9 / step 10）。乖離を一時ファイルの本 ADR だけに残さない。

### Consequences
- 良い点: デスクトップは並び順を含め 1px も変わらない（スコープ順守）。モバイルは主要ボタンが一目で見え課題を直接解消。実行時 breakpoint 判定を持ち込まず既存 CSS variant 方針・既存 Menu プリミティブ・既存オーバーフローパターンに完全に乗る。新規 CSS 不要。
- トレードオフ: overflow ボタンは DOM 上、レール（`max-sm:hidden`）とメニュー（`sm:hidden` ラッパー内）に二重に出現する（描画は breakpoint で排他）。オーバーフロー機構をレール外に出すためツールバー行のレイアウトを外側ラッパーで分割する（`editorToolbar` をそのまま単独利用する当初案は撤回）。この分割に伴い sticky 追従・幅・`role="toolbar"` を外側ラッパーへ移設し、`editorToolbar` を「外側ラッパー（sticky）」と「内側レール（非 sticky スクローラ）」に styles.ts 上で分割する必要がある（上記確定形）。移設を怠るとヘッダー直下 sticky 追従が回帰する。`<MenuItem>` は `aria-pressed`/トグル semantics を持たないため、オーバーフロー内書式の「適用中」状態は children の視覚表示に留まり（メニューを開いた時点で判別）、レール上の主要ボタン（`aria-pressed` 保持）と厳密性が揃わない。トグル後にメニューが閉じる（`runAndClose`）。厳密なトグル semantics が必要になったら Menu プリミティブに checkbox 変種を足す拡張が要る（本 Issue では非採用）。
- どのボタンを primary/overflow に振るかは 390px の実収まりで最終調整する。`EDITOR_TOOLBAR_BTN` は実効 44px 角のため主要 6 + `⋯` = 7 枠は余裕をもって収まる見込みだが、収まらなければ主要をさらに削る。

---

## ADR-002: ネイティブダイアログ置換 — 未保存確認は既存 `ConfirmDialog`、リンク入力は新規 `LinkDialog`

### Status
Proposed

### Context
モバイルで UI 一貫性・a11y を損なうネイティブダイアログが 3 か所ある: 未保存確認 `window.confirm`（`NoteEditor.onModeChange`）、リンク URL 入力 `window.prompt`、非対応スキーム警告 `window.alert`（ともに `WysiwygEditor.onAddLink`）。既存資産として、装飾ロス確認は既に `ConfirmDialog` + 遅延遷移 state（`pendingWysiwygSwitch`）でカスタム化されており、`ConfirmDialog` の JSDoc は「`window.confirm` の置き換え」と明記している。`Dialog` プリミティブはフォーカストラップ・Esc・Portal・モバイルボトムシート化・grabber・safe-area を提供する。

論点は 2 つ:
1. 未保存確認を新規ダイアログにするか、既存 `ConfirmDialog` を流用するか。同期 `window.confirm` を非同期ダイアログにするには遷移を遅延させる必要がある。
2. リンク入力（テキスト入力を伴う）に汎用ダイアログが無い（`ConfirmDialog` は破壊的確認専用でテキスト入力欄を持たない）。

### Decision
1. **未保存確認 = 既存 `ConfirmDialog` を流用**。`onModeChange` を「dirty なら `pendingUnsavedSwitch` を立てて return、確認後に遷移処理を実行」に再構成し、装飾ゲート + `setMode` の末尾を `proceedModeSwitch(nextMode)` に抽出して not-dirty パスと onConfirm パスで共有する。既存 `pendingWysiwygSwitch` と同型の遅延遷移パターンで揃える。未保存ダイアログ → （確認）→ 装飾ダイアログの順序と「二重プロンプトなし」を維持する。
2. **リンク入力 = `Dialog` ベースの新規 `LinkDialog`**。URL 入力（`fieldControl`）+ 挿入/更新 + 解除（リンク有り時）+ キャンセル。非対応スキームは `window.alert` ではなくダイアログ内インライン `role="alert"`（`formError`）で表示しダイアログを継続させる。TipTap 操作（`setLink`/`unsetLink`/`extendMarkRange`）は親 `WysiwygEditor` に残し、ダイアログは入力・検証・コールバックのみを担う。

### Consequences
- 良い点: 3 つのネイティブダイアログがすべてアプリ内ダイアログに統一され、モバイルではボトムシート、a11y（フォーカストラップ・Esc・`role`）も primitive に委譲される。未保存確認は新規コンポーネントを増やさず既存 `ConfirmDialog` の再利用で済む。装飾確認と実装パターンが揃い、エディタ内の確認 UI が一貫する。
- トレードオフ: `onModeChange` の同期 → 非同期化で、`window.confirm` をモックしていた `noteEditorModeChange.test.tsx` の広範な書き換えが必要。`ConfirmDialog` は破壊的配色固定（`pillBtnDanger`）だが「保存せず切り替え」は破棄的操作なので配色は妥当。リンク入力用に `LinkDialog` を 1 コンポーネント新設する（`ConfirmDialog` を汎用入力対応に拡張するより責務が明快）。ネイティブ置換はデスクトップにも及ぶが、既存 `dialog` スタイルが中央モーダルとして描画されるためレイアウト崩れは無く、UX 一貫性の向上に働く。

---

## ADR-003: 実装レベルの決定（#825 実装時に確定）

### Status
Accepted

### Context
ADR-001 / ADR-002 の方針を実装する過程で、いくつか非自明な実装判断が必要になった。後続のレビュアー・実装者のために記録する。

### Decision
1. **`LinkDialog` は条件マウント（mount == open）** — `NoteEditor` の未保存/装飾 `ConfirmDialog` が常時マウント + `open` prop 制御なのに対し、`LinkDialog` は URL 入力欄の内部 state（`url`）を毎回 `initialHref` で seed し直す必要がある。`WysiwygEditor` 側で `linkDialog !== null` のときだけレンダーし、`LinkDialog` 内は `<Dialog open>` 固定とすることで、開くたびに `useState(initialHref)` が正しい初期値で初期化される（リセット用 effect / `key` 付与が不要）。閉じるときは `setLinkDialog(null)` でアンマウントされ、`Dialog` の focus 復帰 cleanup がトリガーへ戻す。

2. **オーバーフロー `⋯` トリガーは `EDITOR_TOOLBAR_BTN` の chrome を流用** — `NoteActionsMenu` は `pillBtn pillBtnIcon` を使うが、ツールバー内の他ボタン（円形 44px タップ床）と視覚を揃えるため `⋯` も `EDITOR_TOOLBAR_BTN`（+ `data-[open]:bg-surface-hover`）を使う。`aria-label`/`title` は「その他の書式」。メニュー項目の「適用中」表現は `MenuItem` の children 末尾に `Check`（accent 色）を出す（`aria-pressed` は `menuitem` role で非対応のため — ADR-001 準拠）。

3. **`isAllowedLinkUri` を `linkUri.ts` に切り出し** — TipTap の `Link.configure({ isAllowedUri })` と `LinkDialog` の入力検証で同一のスキームガードを共有するため、`WysiwygEditor` 内のローカル関数を `app/components/note/editor/linkUri.ts` に移設し両者から import する。

4. **未保存ダイアログ確定後に HTML タブへ戻ると再度未保存ダイアログが出る** — `abortInFlight`（`autosaveDiscarded`）は `dirtyKeys` を保持する（#286 の意味論）ため、切替後もダーティなら次のモード切替で再び未保存ダイアログが開く。これは `window.confirm`（毎回同期確認）時代と同じ意味論で、回帰ではない。テストも各切替でダイアログを承認する形に更新した。

### Consequences
- `LinkDialog` の条件マウントは他ダイアログと制御方式が異なるが、テキスト入力を持つダイアログの seed 問題を最小コストで解決する。`Dialog` の `open` 契約は `LinkDialog` 内で常に true。
- `⋯` の chrome 流用によりツールバー内の視覚一貫性を保つ。`NoteActionsMenu` とはトリガー見た目のみ差異があり、Menu プリミティブ本体は共通。
