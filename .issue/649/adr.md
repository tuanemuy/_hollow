# ADR — Issue #649: #626 確定デザインの実装反映

## ADR-001: ビュー切り替えドロップダウンは共通 Popover を `PopupRole: "listbox"` 拡張で実装する

### Status
Proposed

### Context
ADR-004（#626）はトリガーに `aria-haspopup="listbox"` を要求するが、共通 `usePopover` の `PopupRole` は `"dialog" | "menu"` のみ。選択肢:
1. `PopupRole` に `"listbox"` を追加し共通 `Popover` + `useRovingMenu`（`itemRole: "option"`）を再利用
2. `haspopup="menu"` + `menuitemradio` で流用（VisibilityPopover と同形）— モックの aria 契約（listbox）から逸れる
3. ViewSwitcher 専用のポップオーバーを自前実装 — 外側クリック/Esc/フォーカス返却の再実装で重複

### Decision
案1。確定モックの aria 契約を正とし、共通部品側を最小拡張する。listbox の項目は `role="option"` + `aria-selected`、キーボードは既存 roving フォーカスを流用。

### Consequences
- 良い点: モックの契約に忠実。ポップオーバー挙動（外側クリック・Esc・フォーカス管理）の重複実装なし。
- トレードオフ: 共通型の変更が dialog / menu 利用箇所の型に波及する（値の挙動は不変に保つ）。

---

## ADR-002: 見出し + 件数/操作の1行（page-meta-row）を1つの async Suspense 境界に統合する

### Status
Proposed

### Context
ADR-004 で見出しが「現在のビュー名」を表示するため savedViews に依存し、ADR-007 で件数（`owned.count`）と操作群が同一行になる。現状は見出し=同期、savedViews=ツールバー境界、件数=ノート一覧境界とデータ所属がバラバラ。スケルトンモック（`P10-home-skeleton.html`）は「見出しはビュー名取得に依存するためスケルトン」と明記し、見出しバー + meta-row を一体のプレースホルダで描いている。

選択肢:
1. 見出し + meta-row を1境界にし `Promise.all([loadSavedViewsByKind, loadOwnedNotes])` — スケルトンモックと1:1、行の左右が同時に現れる
2. 見出し境界と件数境界を分離（操作群は同期）— 行の左右が別タイミングで出現しレイアウトシフト感が出る。境界が増えるわりに `loadOwnedNotes` はデデュープで同一クエリにできる
3. 見出しを同期のまま viewId 時のみ汎用文言 — ADR-004（見出し = 現在のビュー名）に違反

### Decision
案1。meta-row と NotesSection の双方で `loadOwnedNotes` を await しても I/O を1回にするため、`OwnedNotesQuery` オブジェクトは同期の `HomePage` 本体で**1回だけ構築し、同一オブジェクト参照を両境界へ props で渡す**。React の `cache` は引数ごとに `Object.is`（参照同一性）でメモ化キーを取るため、構造的に等しい別オブジェクトリテラルを各境界で組み立てるとキャッシュミスして二重クエリになる — 参照共有がデデュープ成立の前提条件（「引数の完全一致」では不十分）。

### Consequences
- 良い点: スケルトンモックどおりの読み込み表現。境界数・アナウンス数が増えない。クエリ構築が1箇所に集約され、両境界の条件ズレも構造的に起きない。
- トレードオフ: 見出しの初回描画が savedViews + 件数クエリの解決まで遅れる（従来は即時）。一覧本体より軽いクエリのため許容。
- トレードオフ: 一覧クエリ（`loadOwnedNotes`）の失敗が、従来は影響外だった見出し + ViewSwitcher まで `SectionErrorBoundary` のフォールバックへ巻き込む。ビュー切り替えは「条件を変えてエラーから脱出する」導線でもあるが、`resetKey`（URL 変更でエラー境界がリセットされる）による回復経路が残るため許容する。
- トレードオフ: 見出し（`<h1>`）が async 境界の中へ移るため、フォールバック表示中およびエラーフォールバック時はページに `<h1>` が存在しない（従来は同期 `<h1>` が常時あった）。スケルトンモックどおりではあるが、見出しレベル構造が一時的に欠ける小さな a11y 後退として許容する。実装時の検討余地として、`<h1>` 枠だけ同期に残し中身（ビュー名 + トリガー）を Suspense 内にする案がある。

---

## ADR-003: `title` 属性は全環境で常時レンダーする（デバイス条件付き出し分けはしない）

### Status
Proposed

### Context
#626 ADR-001/005/006 の契約は「`aria-label` 全環境必須 / `title` はデスクトップのみ必須・モバイルは省略可」。SSR + メディアクエリでは HTML 属性の幅別出し分けに合理的な手段がなく（JS での UA/タッチ判定は hydration 不整合・複雑化を招く）、タッチ環境に title が存在しても表示されないだけで無害。

### Decision
`title` を常時レンダーする。「モバイルは省略**可**」（禁止ではない）の解釈で契約を満たす。

### Consequences
- 良い点: 実装が単純で SSR 安全。デスクトップ要件は確実に満たす。
- トレードオフ: モバイルの DOM に不使用属性が残る（実害なし）。

---

## ADR-004: P30 実装の確定表現追従は #619 に委譲し、本 Issue では正モックのみ更新する

### Status
Proposed

### Context
Issue 本文は「P30 実装の追従は #619 との関係を確認のうえ調整」。#619（P30 をデザインモックに完全一致させる）は OPEN で、segmented 以外にもソート・期間フィルタ・プロフィール構造など P30 実装の乖離をまとめて扱う。本 Issue で `PublicTopControls.tsx` / `public/styles.ts` だけ先行変更すると、#619 の作業範囲と二重管理になる。

### Decision
本 Issue では `P30-user-public-top.html`（desktop / mobile）の表示モード segmented を確定表現へ更新するのみとし、実装追従は #619 に委ねる。#619 へ「segmented は #626 確定表現（アイコンのみ・ink 濃度差）に追従済みのモックが正」とコメントを残す。

### Consequences
- 良い点: モック（正）と Issue の責務が一致し、実装変更が1箇所（#619）に集約される。
- トレードオフ: #619 完了まで P30 実装と P10 実装の segmented 表現が一時的に分岐する（#626 ADR-001 が既に許容済み）。

---

## ADR-005: 検索時の見出しは検索文言を優先し、aria-label は「可視見出し — ビューを切り替え」で合成する

### Status
Accepted（レビュー B-001 / FE-W-002 反映で改訂）

### Context
ADR-004（#626）は見出し = 現在のビュー名 + 切り替えトリガーとするが、検索中（`isSearchActive(q)`）の見出し文言とビュー名表示の優先順位は確定モックで未定義。また検索時に `aria-label="ビューを切り替え: 現在 {ビュー名}"` のままにすると、可視テキスト（「「q」の検索結果」）と aria-label の「現在 …」が乖離する。

当初の決定（検索時は裸の「ビューを切り替え」に落とす）は、アクセシブルネームが可視テキストを一切含まなくなり WCAG 2.5.3 (Label in Name, Level A) に違反するためレビュー（B-001）で棄却された。「ビュー名を落とす」と「可視テキストを落とす」は別問題。

### Decision
- 見出しテキスト: 検索時は従来どおり「「q」の検索結果」を優先表示（トリガー機能 — ビュー選択で q を含まない検索へ遷移 — は維持）。
- aria-label 合成規則: 検索/非検索とも `{可視見出しテキスト} — ビューを切り替え`（例: 「「memo」の検索結果 — ビューを切り替え」「すべてのノート — ビューを切り替え」）。可視テキストを先頭に含める（2.5.3 充足）うえ、内容→操作の順になり SR の見出し一覧でもページ内容が先に読まれる（レビュー N-002 も同時解消）。
- いずれも `listSelectors.ts` のセレクタとして実装し、単体テストで固定する。

### Consequences
- 良い点: 検索 UX を維持しつつ、可視テキストと aria-label の矛盾排除と Label in Name を両立。音声操作ユーザーが見えているテキストでトリガーを指名できる。
- トレードオフ: 検索中は現在どのビューにいるかが見出しから読めない（フィルタチップ等の文脈で補完される範囲として許容）。

---

## ADR-006: listbox パネルは `<h1>` の外（トリガーのみ h1 内）に置く

### Status
Accepted（実装時決定）

### Context
モックは `<h1 class="page-title"><button class="view-switcher">…</button></h1>` で、`<h1>` の中身はトリガーボタンのみ。共通 `Popover` はトリガーとパネルを1つのコンテナ `<div>` で包むため、素朴に `<h1>` の中へ Popover を置くとパネル `<div>`（flow content）が `<h1>`（phrasing content のみ許容）の中に入り HTML 仕様違反になる。

### Decision
`Popover` の `trigger` render prop の側で `<h1><button …/></h1>` を描き、パネルはコンテナ直下（h1 の兄弟）に出す。パネルには `text-sm font-regular tracking-normal leading-normal` を付けて見出しの書体継承を打ち切る。

### Consequences
- 良い点: モックの DOM 契約（h1 の中はトリガーのみ）と HTML 妥当性を両立。Popover の dismiss/フォーカス管理をそのまま再利用。
- トレードオフ: コンテナ `<div>` が見出しを包む分、HomePage 側の `mb-[10px]` は ViewSwitcher 内のラッパーへ移動した。

## ADR-007: ToolbarSkeleton は引き続き装飾のみ（`aria-hidden`）とし、読み込みアナウンスは FilterBar / NoteList の2つに据え置く

### Status
Accepted（実装時決定）

### Context
境界再構成で ToolbarSkeleton が「見出し + meta-row」を持つようになった。skeleton モック（`P10-home-skeleton.html`）は sk-header に `role="status"`（「ノート一覧を読み込み中」）を置くが、実装では NotesSection の `NoteListSkeleton` が同名のアナウンスを既に持っており、両方に置くと初回ロードで同内容が二重アナウンスされる。

### Decision
ToolbarSkeleton は従来どおり全体 `aria-hidden` の装飾のみとし、`role="status"` は `FilterBarSkeleton`（フィルタ）と `NoteListSkeleton`（ノート一覧）の2つに集約する。既存の `skeletonAria.test.tsx` の非対称契約（ToolbarSkeleton = decorative-only）を維持。

### Consequences
- 良い点: アナウンスの重複なし。既存テスト契約を変えずに済む。
- トレードオフ: 見出し境界の読み込みは SR にアナウンスされない（視覚的プレースホルダのみ）。一覧側のアナウンスで読み込み中であることは伝わる範囲として許容。
- 注記（レビュー FE-W-001）: スケルトンモック `P10-home-skeleton.html` の sk-header `role="status"` とは**意図的に乖離**する（実装方針を正とする — savedViews だけが遅いケースでも一覧/フィルタ側の status が読み込み中を伝える）。この非対称契約は `skeletonAria.test.tsx` で固定済み（ToolbarSkeleton = `aria-hidden` のみ / FilterBarSkeleton・NoteListSkeleton = 各1つの `role="status"`）。

---

## ADR-009: ツールバー境界のエラーフォールバックには静的 `<h1>` を含める

### Status
Accepted（レビュー A11y-W-001 反映）

### Context
ADR-002 で `<h1>`（ViewSwitcher）が async 境界の中へ移った結果、`loadSavedViewsByKind` / `loadOwnedNotes` の失敗時は `SectionErrorBoundary` のフォールバックに置き換わり、再試行まで `<h1>` が存在しないページになる（WCAG 2.4.6 / 1.3.1 の後退）。

### Decision
`SectionErrorBoundary` に `fallbackHeading?: ReactNode` を追加し、ツールバー境界はエラーフォールバックの先頭に静的な `<h1>`（トリガー機能なし、`homeHeadingText(search.q)` — savedViews 不在のためビュー名はデフォルト「すべてのノート」/ 検索中は「「q」の検索結果」）を描画する。

### Consequences
- 良い点: エラー時も見出しレベル構造と SR の見出しナビゲーション起点が保たれる。検索中なら検索文脈も残る。
- トレードオフ: viewId 適用中のエラーでは保存ビュー名ではなく「すべてのノート」が表示される（ビュー名の解決自体が失敗している以上、不正確な名前を出すより安全側）。ローディング中（スケルトン表示中）の h1 不在は ADR-002 どおり許容のまま。

---

## ADR-010: disabled「ビューとして保存」は `aria-disabled` + クリック無効化にする

### Status
Accepted（レビュー A11y-W-003 反映）

### Context
ネイティブ `disabled` ボタンはフォーカス不能のため、キーボード/SR ユーザーは存在も「条件が設定されていません」という理由（`title` のみ）も知覚できない。タッチ環境では `title` ツールチップ自体が出ない。アイコンのみ化で可視の手掛かりも減っている。

### Decision
`disabled` を `aria-disabled="true"` + onClick ガード（無効時は何もしない）に置き換え、理由は `aria-describedby` で参照する `sr-only` テキスト（「条件が設定されていません」）として常時 SR に届くようにする。視覚は `pillBtn` 既存の `aria-disabled:opacity-disabled` / `aria-disabled:cursor-not-allowed` がそのまま効く。

### Consequences
- 良い点: フォーカス可能なままなので Tab 順で発見でき、理由が SR に読まれる。Menu の `aria-disabled` 流儀（#467）とも一貫。
- トレードオフ: フォーム送信等のネイティブ無効化は失われるが、このボタンはダイアログを開くだけなので onClick ガードで十分。

## ADR-008: saved view 0 件でも見出しトリガーは常時表示する

### Status
Accepted（実装時決定）

### Context
旧実装は保存ビューが 0 件のとき select 自体を隠していた。計画は「実装時にどちらでもよいが見出しテキスト・a11y 契約は崩さない」としていた。

### Decision
常時表示する（「すべてのノート」1 項目の listbox）。見出し=トリガーの恒常性（押せたり押せなかったりしない）と、ビュー保存直後に見出しの挙動が変わらない一貫性を優先。

### Consequences
- 良い点: 実装が単純で、savedViews の件数によって見出しの DOM/挙動が分岐しない。
- トレードオフ: 項目1つの listbox は情報量が薄い（保存ビューを作る前のユーザーに「ビュー」という概念の予告にはなる）。

## ADR-011: ViewSwitcher オプションのフォーカスは accent アウトライン（内側）で示す

### Status
Accepted（レビュー R2 A11y-W-001 反映）

### Context
共通 `menuItem` パターンを踏襲した `focus-visible:bg-surface` は白パネル上で約1.08:1 のコントラストしかなく、roving tabindex で移動中の現在位置が知覚できない（WCAG 2.4.7）。本 PR の新規コンポーネントである ViewSwitcher が同パターンを増殖させていた。

### Decision
`OPTION_ITEM` に既存のフォーカストークン（`focus-visible:outline-2 focus-visible:outline-accent`）を `-outline-offset-2` で内側に描いて追加する。共通 `menuItem`（`app/components/common/styles.ts`）は app 全体の整合に関わるため本 PR では変更せず、共通課題として別途扱う。

### Consequences
- 良い点: トリガー類と同じ accent 系インジケーターで一貫し、矢印キー移動中の位置が知覚可能になる。負オフセットによりパネル端でのアウトライン切れもない。
- トレードオフ: 既存メニュー（menuItem）とは一時的に表現が不揃いになる。共通パターン側の解消までの過渡的な差異として許容する。
