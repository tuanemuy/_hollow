# 実装計画 — Issue #499: ノート一覧のクリック領域が見出しのみで分かりづらい（行全体をクリック可能にする）

**Issue:** #499
**作成日:** 2026-06-06
**複雑度:** 中〜大規模

---

## 目的

ダッシュボードのノート一覧で、ListView（リスト）/ CalendarView（カレンダー）のノート詳細遷移リンクが見出しテキストにしか付いておらず、excerpt・タグ・更新日時・行余白をクリックしても反応しない。これを TileView / 公開側と同様に「行全体クリック可能」へ揃え、表示モード間の挙動の一貫性とクリックのしやすさを改善する。

## スコープ

### 含まれるもの
- ListView のクリック領域を行全体に拡張（選択モード時の挙動を維持）
- CalendarView のクリック領域を行全体に拡張（選択モード時の挙動を維持）
- hover の行ハイライト（`hover:bg-surface` 等）とクリック領域を一致させる
- アクセシブルネームが note.title になるよう配慮
- ListView / CalendarView のクリック挙動を直接検証するテストの追加
- TileView / 公開側との一貫性の確認（これらは変更しない）

### 完了条件（一貫性）
- ListView / CalendarView が「Link/button が grid セル（コンテナ）を占め、選択時は button 切替・チェックボックスはラッパー外」という TileView / 公開側と同型の構造に収斂していること。

### 含まれないもの
- TileView / 公開側 UserPublicTop の変更（既に行全体クリック可能で要件充足、回帰確認のみ）
- FilterBar の体裁（#497 で別対応）
- タグのリンク化など、現状スコープ外の機能追加

## 実装ステップ

### 1. ListView を行全体クリック可能にする

主リファレンスは公開側 `UserPublicTop` の `NOTE_ROW`（`<Link>` 自身が `grid grid-cols-[1fr_auto]` のコンテナで、本体 div と日時 div を直接の子セルにする横並び行）。ListView は構造的にこの行レイアウトに最も近い。選択モード時の `<button>` 切替だけ TileView から借りる。

- **対象ファイル:** `app/components/note/list/ListView.tsx`
- **変更内容（モード別に構造を確定する）:**
  - **`<li>` の役割:** リスト項目のラッパーとして `data-selected` / `data-mode` と hover/選択ハイライト（`transition-colors motion-reduce:transition-none hover:bg-surface data-[selected]:bg-accent-surface`）だけを持つ。`<ul>` 側の `divide-y divide-hairline` は維持。
  - **非選択モード:** `<li>` 直下に行全体を覆う `<Link>` を置き、**この Link 自身を grid コンテナにする**。
    ```
    <Link to="/notes/$noteId" params={{ noteId: note.id }} aria-label={note.title}
          className="grid grid-cols-[1fr_auto] items-start gap-4 px-3 py-5 max-sm:px-2 max-sm:py-4 max-sm:gap-3 text-inherit">
      <div className="min-w-0"> {/* 見出し / excerpt / タグ・visibility */} </div>
      <div className="...日時セル..."> {updatedAtDisplay} </div>
    </Link>
    ```
    padding・grid・`items-start` を Link に持たせることで、行の余白まで含めてクリック領域になり hover 範囲と一致する。`aria-label={note.title}` でアクセシブルネームを title に固定する（excerpt/タグ/日時がリンク内テキストに含まれる冗長化の吸収）。
  - **選択モード:** `<li>` を `grid grid-cols-[auto_1fr] items-start gap-4 px-3 py-5 ...`（チェックボックス列 | 本体列）にし、第1セルに `NoteCheckbox`、第2セルに `<button type="button" onClick={toggle}>` を置く。**button をさらに `grid grid-cols-[1fr_auto] items-start gap-4 w-full text-left text-inherit cursor-pointer` の二段 grid コンテナにし**、内側に本体 div と日時 div を置く。チェックボックスは button の外側（`<li>` 直下の別セル）なのでネスト・二重発火が構造的に発生しない。
  - 現行 47-49 行の「選択時は見出しを `<span>` に切替」分岐は button ラップに統合して不要化する。
  - padding をモードで Link/button いずれが持つか統一する（非選択=Link、選択=`<li>`＋内側 button は padding なし）。両モードで行の見た目（余白・hover 範囲）が一致することを実機確認する。
- **理由:** 公開側 `NOTE_ROW`（Link が grid コンテナ）の確立済みパターンに揃えつつ、選択モードの `<button>` 切替を TileView から借りることで、レイアウトを崩さず行全体クリックを実現する。

### 2. CalendarView を行全体クリック可能にする

- **対象ファイル:** `app/components/note/list/CalendarView.tsx`
- **変更内容:**
  - title のみの行で、選択時は `data-[mode]:grid-cols-[auto_1fr]`（チェックボックス | title）、非選択時は `grid-cols-[1fr]`。
  - 非選択時: title の `<Link className="text-sm text-ink hover:text-accent">` を、`grid-cols-[1fr]` の単一セルを占める `block` Link に変更し、`<li>` の padding を Link 側へ移す（`<li>` は `p-0`）。これで行全体（余白含む）がクリック領域になり hover 範囲と一致する。title がリンクテキストになるため `aria-label` 不要（行内に title 以外のテキスト要素はなく、日付見出しは `<li>` 外の `<h2>` のためアクセシブルネームは title のみになる）。
  - 選択時: title `<span>` を `<button type="button" onClick={toggle}>` に変更。チェックボックスは現状どおりグリッド第1セル（button の外側）に残し、button が第2セル（`1fr`）を占める。
  - hover ハイライト（`hover:bg-surface data-[selected]:bg-accent-surface`）・`rounded-sm` は `<li>` に残す。padding は Link/button 側へ移し、両モードで行の見た目が一致することを確認する。
- **理由:** ListView と同じ「Link/button が grid セルを占める」パターンで統一する。

### 3. クリック挙動のテスト追加

- **対象ファイル:** `app/components/note/list/__tests__/`（新規 or 既存 `NoteListViews.test.tsx` に倣った新規ファイル）
- **変更内容:** happy-dom + react-dom の既存 renderer パターンで、
  - ListView 非選択モード: 行本体ラッパーが note 詳細への `<a href>` として描画され、`aria-label` が note.title。
  - ListView 選択モード: ラッパーが `<button>` になり、クリックで選択トグルが dispatch される。チェックボックスクリックが二重発火しない。
  - CalendarView: 同様に非選択時リンク化 / 選択時 button 化。
  - `SelectionContext` の Provider で mode on/off を切り替えて検証する。`@tanstack/react-router` の `Link` は既存 `NoteListToolbar.test.tsx` のモックパターン（`Link` を `<a>` に展開し `to`/`params` を剥がす）を流用する。二重発火検証は `dispatch` をスパイし、チェックボックスクリック時に行トグルが追加で呼ばれないことを確認する。
- **理由:** 現状クリック領域を検証するテストが無いため、要件（行全体リンク化・選択モード切替・アクセシブルネーム）を回帰から守る。

### 4. 型・lint・整合確認

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。
- **理由:** CLAUDE.md の変更後手順に従う。

## 設計判断

- **案1（行全体を `<Link>`/`<button>` でラップ）を採用**。TileView が既にこの形で確立しており 3 ビューでパターンが揃う。タグは現状 `span`（非リンク）なので、行内のインタラクティブ要素は選択モード時のチェックボックスのみ。これをラッパー外に配置すればネスト・二重発火が構造的に発生しない。案2（stretched-link `::after`）は utility-first 方針下で絶対配置オーバーレイを別途要し、将来タグをリンク化する際の相性も悪い（Issue 本文の指摘どおり）ため不採用。
- 選択モード時の挙動は TileView と同一。`state.mode` が真のとき行ラッパーを `<button onClick={toggle}>` に切替、チェックボックスは表示継続。詳細は adr.md 参照。

## リスクと注意点

- **レイアウト崩れ:** ListView の `<li>` グリッド（見出し列 / 更新日時列 / 選択時チェックボックス列）を Link/button 側へ移植する際、grid-template・padding・`items-start`・`min-w-0`・overflow clamp を正確に移さないと崩れる。hover とクリック領域が完全一致することを実機確認する。
- **アクセシビリティ:** 行全体を `<Link>` にすると excerpt・タグ・日時までアクセシブルネームに含まれ冗長化するため、ListView は `aria-label={note.title}` でリンク名を固定する。
- **イベント競合:** タグは span でリンクではないため競合なし。選択モード時のチェックボックスはラッパー外配置＋`NoteCheckbox` 内 `stopPropagation` で二重発火を防止。PR #467 の Popover/Menu mousedown ガードは一覧アイテムに無関係。
- **カレンダーの小行:** `py-[6px]` で行高が低い。視覚ハイライト範囲とリンク範囲の一致を優先する。
- **選択モードの hover/クリック微差:** 選択時はトグルを内側 button に置くため、チェックボックス列（`auto`）の余白クリックは無反応（hover はする）。要件「行クリックで選択トグル」は満たすが、非選択モードのみ hover=クリック領域が厳密一致する点を意識する。
- **縦位置の移植:** ListView 日時セルの `self-start mt-[3px]` と内側コンテナの `items-start` はセットで現行の縦位置を作る。選択時に日時を内側 button の `[1fr_auto]` 第2セルへ移す際、`items-start` と `mt-[3px]` の両方を移植しないと 3px ずれる。
- **grid の align-items:** CalendarView の `items-center` は grid コンテナ（`<li>`）側のプロパティ。padding を Link へ移す際に `items-center` まで Link へ移すと効かなくなるため、`<li>` に残す。

## テスト方針

- 既存 `NoteListViews.test.tsx` は各ビューをモックしておりクリック領域は未検証。新規にビュー内クリック挙動テストを追加（ステップ3）。
- 手動確認: リスト/カレンダー/タイル各表示で、見出し以外（excerpt・タグ余白・更新日時・行余白）クリックで詳細遷移できる / hover ハイライト範囲とクリック範囲が一致 / 選択モード ON で行クリックが選択トグルになる / チェックボックス直接クリックも一度だけトグル / 公開側 `/u/$username` 行クリックが従来どおり（回帰）。

## レビュー履歴

### 1周目
**修正した点**:
- [P-001] ListView の「grid を `<li>` に残しつつ block Link で覆う」記述が grid レイアウト（`1fr_auto` の本体/日時セル）として矛盾していた → 公開側 `NOTE_ROW`（Link 自身が grid コンテナ）を主リファレンスに据え、実装ステップ1とモード別構造を確定。adr.md ADR-002 を追加。
- [P-002] 選択モード時のチェックボックスと 3 列 grid の同居が未設計だった → 「`<li>` を `[auto_1fr]` 外側 grid、内側 button を `[1fr_auto]` の二段 grid」に確定（ステップ1・ADR-002）。

**取り込んだ改善提案**:
- [S-001/arch] ListView の主リファレンスを公開側、選択切替を TileView と位置づけて adr に明記。
- [S-002/arch] CalendarView の padding/grid 配置を「Link/button が grid セルを占める」に一本化。
- [S-003/arch] テストの Link モックを `NoteListToolbar.test.tsx` パターン流用＋`dispatch` スパイで二重発火検証、と具体化。
- [S-001/req] CalendarView のアクセシブルネーム=title の根拠（日付見出しは `<li>` 外）を明記。
- [S-002/req] 「一貫性確認」の完了条件をスコープに明記。

**見送った提案とその理由**:
- なし。

### 2周目
両視点とも問題点ゼロで終了。改善提案（選択時チェックボックス列余白のクリック無反応 / ListView 日時の `mt-[3px]`・`items-start` 移植 / CalendarView の `items-center` をコンテナ側に残す / テスト範囲を ListView・CalendarView に限定）をリスク・実装ステップに反映。
