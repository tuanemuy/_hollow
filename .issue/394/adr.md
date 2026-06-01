# ADR — Issue #394: 保存ビューの「適用」導線 / 一覧UI整備

## ADR-001: 適用はクライアント `Link` 遷移で実現する（server function を追加しない）

### Status
Accepted

### Context
保存ビューの「適用」とは、そのビューの絞り込み条件（ViewQuery: ディレクトリ・タグ・キーワード・visibility・期間・表示モード）でノート一覧を開くこと。実現手段として (a) 新規 server function で ViewQuery を解決し URL を組み立てる、(b) クライアント側で ViewQuery → URL search params を変換してリンクを張る、(c) `viewId` のみを URL に載せてホーム loader に解決させる、の3案がある。

### Decision
(c) を採用。`/views` の各行に `<Link to="/" search={{ viewId: view.id }}>` を張り、ホーム loader（`app/routes/_app/index.tsx` の `renderHome`）が既存の `viewQueryToSearch` で ViewQuery を URL search へ展開・一覧へ反映する仕組みにそのまま乗せる。`NoteListToolbar.onSelectView` が既に同一メカニズム（`navigate({ to: "/", search: () => ({ viewId }) })`）で動作している。

### Consequences
- 良い点: 新規 server function / usecase / バリデーションを一切追加せず、確立済みの適用パスを再利用できる。tag 名解決（tagId→tagName）もホーム loader が `loadAllTags` で担うため、フロントは解決ロジックを持たない。
- トレードオフ: 「適用」の実体が `/views` の外（ホーム loader）にあるため、適用挙動の回帰は `listSelectors.test.ts` 側で担保される。`/views` 側のテストは「`viewId` を載せた Link を描画する」ことの確認に留まる。

---

## ADR-002: brokenConditions を持つビューも適用可能とし、警告を併記する

### Status
Accepted

### Context
`brokenConditions` は ViewQuery が参照する tag/directory/note が削除されたことを示すマーカー。壊れた条件を持つビューの適用挙動として (a) 適用を無効化する、(b) 警告して適用を許可する、(c) 壊れた条件を除外して適用する、が考えられる。

### Decision
(b) を採用。適用リンクは無効化せず、`brokenConditions.length > 0` のとき `role="alert"` の警告バナー（warning トークン）を行内に表示する。

### 理由
- 削除済み id で絞り込んでもホーム loader は例外を出さず、結果が 0 件になるだけ（壊れた参照の特別扱いは無い）。
- P20 デザインカンプの broken-banner は「このビューを開いても結果は空になります」と明記し、適用ボタンを壊れた行にも配置している。
- 壊れた条件の「修復」UI（`repairBrokenConditions`）は対応する server function が無く、本 Issue のスコープ外。

### Consequences
- 良い点: ユーザーは壊れたビューを開いて空結果の理由を理解でき、デザイン意図と整合する。
- トレードオフ: 「修復」導線は将来 Issue に委ねる。本 Issue では警告表示までに留める。

---

## ADR-003: P20 カンプの「編集/複製/修復」アクションは実装しない

### Status
Accepted

### Context
`spec/design/pages/P20-views.html` の `row-actions` には 適用 / 編集 / 複製 / 削除 と broken-banner の修復ボタンが描かれている。一方、既存の `action.ts` には rename / setDefault / delete のみが実装されており、複製・修復・任意条件編集に対応する usecase / server function は存在しない。

### Decision
本 Issue では「適用」リンクの追加と既存アクション（名前変更 / 既定設定 / 削除）のスタイル整備に留め、「複製」「修復」「条件編集」は実装しない。Issue 要件（適用導線・styling・broken 取り扱い明確化）にも含まれない。

### Consequences
- 良い点: スコープを Issue 要件に絞り、裏付けの無い UI を描かない。
- トレードオフ: カンプとの差分が残る。必要なら別 Issue で usecase ごと追加する。

---

## ADR-004: broken-banner の詳細文は削除済み参照名を出さず汎用文にする

### Status
Accepted

### Context
P20 カンプの broken-banner は「削除済みディレクトリ `Research / Papers` を参照しています」のように壊れた参照の人間可読名を表示している。一方 `SavedViewDTO.brokenConditions` は `{ kind, id, lastSeenAt }` のみを保持し、解決済みの表示名を持たない。名前を出すには削除済みエンティティの名前解決ロジック（新規）が必要になる。

### Decision
詳細文を「削除済みの参照（N 件）を含みます。このビューを開いても結果は空になる場合があります。」という汎用文にし、個別の参照名は出さない。`kind` 別件数の内訳は持つデータ（`brokenConditions` 配列の長さ）で表現する。

### Consequences
- 良い点: 既存データだけで実装でき、削除済みエンティティの名前解決という新規ロジック（スコープ外）を持ち込まない。警告の意図（壊れた条件があり結果が空になりうる）は十分伝わる。
- トレードオフ: カンプの「どの参照が壊れたか」という具体性は失われる。名前表示が必要なら、`brokenConditions` に `lastSeenName` 等を持たせる DTO 拡張を別 Issue で行う。

