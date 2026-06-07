# ADR — Issue #544: 領域5「公開・共有で読まれる体験」(P30/P31/P32/P33) のモック実装追従

本Issueはモック追従（既存 UI とモックの乖離を、Issue 範囲内で埋める）。新機能の発明はしない。
スコープ判定の SSOT は更新後モック（`spec/design/pages/P30-P33`）と `index.md` / `tokens.md`、
着手の手がかりは `.issue/500/followups.md` / `.issue/500/decisions-pending.md`。

---

## ADR-001: P31 バックリンク・関連ノートはバックエンド新設を伴うため本Issueのスコープ外とする

### Status
Accepted

### Context
P31 モック（`P31-public-note.html` 689-723行）は本文下に「バックリンク（公開ノート）」（`.backlink-list`）と
「同じ著者の他のノート」（`.related-grid` / `.related-card`）の 2 セクションを描く。実装 `PublicNoteDetail.tsx`
は本文 article のみを描画し、両セクションを持たない（`.issue/500/followups.md` 175-176行で「別Issue化候補=Yes」）。
`styles.ts` に `BACKLINKS` 定数はあるが未使用。

バックエンドを調査した結果:

- バックリンク用に `noteRepository.findReferrers` ポートと `getBacklinks` usecase は存在するが、
  `getBacklinks`（`app/core/application/note/getBacklinks.ts`）は **`actorUserId` 必須・所有者一致を強制する
  認証専用** usecase で、公開サーフェスからは使えない。公開バックリンクは「参照元のうち**公開ノートだけ**」に
  可視性フィルタを掛ける必要があり、新しい公開 usecase（可視性フィルタ込み）の新設が要る。
- 「同じ著者の他のノート」も、現在のノートを除外しつつ著者の公開ノートを数件引く新規クエリ/usecase が要る
  （`listUserPublicNotes` は流用できるが当該ノート除外・件数制限の調整が必要）。

### Decision
P31 のバックリンク・関連ノートの 2 セクションは、**ドメインポート/usecase の新設を伴うバックエンド変更**が
前提になるため、本Issue（モック追従 = UI 追従）のスコープを超える。本Issueでは扱わず、別Issue起票候補として
「含まれないもの」に明記する。`.issue/500/followups.md` も両項目を「別Issue化候補=Yes」と判定しており整合する。

### Consequences
- 良い点: 本Issueを UI 追従に集中させ、スコープ侵食（バックエンド大改修）を防ぐ。#541 の「バックエンド大改修が要る
  乖離は別Issue」の判断と同型。
- トレードオフ: P31 は本文 article のみのままで、モックとの乖離が残る。別Issueで解消する（起票時に
  「公開バックリンク usecase（可視性フィルタ）＋関連ノート usecase の新設 → PublicNoteDetail への 2 セクション追加」
  をスコープとする）。

---

## ADR-002: P32 フィルタードロワー（ファセット絞り込み）はバックエンド新設を伴うため本Issueのスコープ外とする

### Status
Accepted

### Context
P32 モック（`P32-public-search.html` 1015-1116行）は右スライドのフィルタードロワーを描く。中身は
ユーザー combobox（候補サジェスト）／タグ combobox（候補サジェスト）／期間 radio の 3 ファセット。
現実装 `PublicSearch.tsx` は検索フォーム + 結果リストのみで、ドロワー・combobox・期間 radio を持たない。

バックエンド調査:

- `searchPublicNotes` usecase（`app/core/application/search/searchPublicNotes.ts`）は **`tagNames` /
  `dateRange` / `username` を既に受け付ける**（UI から渡していないだけ）。よって「タグ・期間で絞る」こと自体は
  バックエンド変更なしで配線可能。
- 一方、モックの combobox は「ユーザー名/タグ名の一部を入力 → 候補サジェスト」を要求する（`facet-hint`「一部を
  入力すると候補が表示されます」）。この**サジェスト候補を返す usecase は存在しない**（タグは `listTags` が認証側
   owner-scoped で公開横断のタグサジェストではない、ユーザーサジェストは皆無）。combobox を忠実に作るには
  バックエンド新設（公開タグサジェスト / ユーザーサジェスト usecase）が要る。

### Decision
フィルタードロワー一式（特に combobox のサジェスト）は **バックエンド新設を伴う**ため、ドロワー UI 全体を本Issue
では作らない。`.issue/500/followups.md` 187行も「別Issue化候補=Yes」。本Issueは、**バックエンド変更なしで成立する
範囲**に絞る（後述 ADR-003 / ADR-004）。ドロワー（combobox サジェスト含む）の本格実装は別Issue起票候補とする。

### 「期間」ファセットだけはバックエンド不要だが、それでも見送る根拠
ドロワー内3ファセットのうち「期間」radio（`P32-public-search.html` 1083-1106行: 過去7日/30日/1年/すべて）は
combobox と違いサジェスト不要で、`searchPublicNotes` が既に受ける `dateRange` に配線するだけ（`validateSearch` に
`period` を足し、`PublicSearch.tsx` の `dateRange: null` を計算値に差し替え）でバックエンド変更ゼロで動く。
それでも本Issueでは見送る。理由は2点:
1. **件数表示に集計が要る:** モックの期間 radio は各期間の `facet-count`（3/12/28/31 件, 1090-1104行）を表示する。
   これを忠実に追従するには期間別ヒット件数の集計 usecase が要り、結局バックエンド新設になる。件数を出さずに
   radio だけ足すのはモック（件数付き）への中途半端な追従。
2. **ドロワー一体設計:** 期間 radio は combobox 2ファセットと同じドロワー（1015-1116行）の中に同居する UI で、
   期間だけを単独でどこかに切り出すのは不自然。ドロワー全体（combobox サジェスト含む）を別Issueで一括実装する
   ときに期間も併せて配線するのが筋。

### Consequences
- 良い点: サジェスト用バックエンドの設計（公開タグ/ユーザーの集計・候補ソート・件数表示）という大きめの作業を
  本Issueに巻き込まない。期間ファセットも「件数集計 + ドロワー一体」の観点で一貫して別Issueへ。
- トレードオフ: P32 のドロワーは残課題。ただし `searchPublicNotes` が `tagNames`/`dateRange` を既に持つため、
  別Issueでドロワーを足す土台はある。

---

## ADR-003: P30 のフィルター chip・表示モード・ソートは「機能を伴わない UI 模倣」を避け、対応バックエンドが無い分は本Issueでは追従しない

### Status
Accepted

### Context
P30 モック（`P30-user-public-top.html` 556-592行）は user-tools にフィルター chip 群（すべて / #タグ群 /
「タグを追加」/「期間」）、表示モードセグメント（リスト / タイル / カレンダー）、ソートボタン（公開日順）を描く。
現実装 `UserPublicTop.tsx` は検索 input とノート一覧のみ。`.issue/500/followups.md` 168-169行は両者を
「別Issue化候補=Yes」。

`listUserPublicNotes` usecase は `username` / `page` / `limit` のみを受け、**タグ絞り込み・並び替え・表示モードの
引数を持たない**。chip でタグ絞り込みを動かす、ソートを切り替える、には usecase 拡張（タグフィルタ引数・ソート
引数）と、タイル/カレンダー表示モードのコンポーネント実装が要る。表示モード・ソートは認証側 P10 では存在するが
公開側 usecase には無い。

### Decision
P30 のフィルター chip 群・表示モードセグメント・ソートボタンは、**動く機能の裏付け（usecase 拡張・表示モード
コンポーネント）が無く、見た目だけ置くと「押しても何も起きない飾り」になる**ため本Issueでは追従しない。
index.md §4「タッチデバイスでは…重要な操作はクリック/タップで完結し」、CLAUDE.md「未実装機能を約束する UI に
しない」（#541 ADR-005 と同方針）に従い、機能の伴わない UI 模倣は避ける。別Issue起票候補とする。

公開トップ（P30）で本Issueが扱うのは、**バックエンド不要で成立する乖離**に限る（後述 plan.md 参照）。

### Consequences
- 良い点: 飾りの UI を増やさず、スコープを UI 追従の実体あるものに保つ。
- トレードオフ: P30 の chip/表示モード/ソートは残課題（別Issue）。

---

## ADR-004: P30 公開トップヘッダーの全幅検索（header-search）を PublicLayout の既存実装に追従させる

### Status
Proposed（実装時に最終確認）

### Context
P30 モックのヘッダーは中央に `header-search`（プレースホルダ「公開ノートを検索」, `max-width:380px`）を持つ
（`P30-user-public-top.html` 521-524行）。実装 `PublicLayout.tsx` は既に `PUBLIC_HEADER_SEARCH` で同じヘッダー
検索を描いており（`hideHeaderSearch` を渡さない限り表示）、`UserPublicTop` は `PublicLayout` を素で使うため
**ヘッダー検索は既に出ている**。つまりこの点はモックと実装が一致済み。

一方 P30 の user-tools 内のユーザー絞り込み検索（`user-search` プレースホルダ「このユーザーの公開ノートを検索」,
`P30-user-public-top.html` 550-554行）も実装済み（`USER_SEARCH` / `USER_SEARCH_INPUT`）。

### Decision
P30 ヘッダー検索・ユーザー検索は既に実装とモックが一致しているため、本Issueでは新規追従不要。突き合わせの結果
「乖離なし」と記録するに留める（過剰な再実装をしない）。

### Consequences
- 良い点: 既に合っている箇所を触らず、回帰リスクを増やさない。
- トレードオフ: なし。

---

## ADR-005: P33 共有リンク解錠体験は #510 確定方針により実装が既にモックと一致しており、本Issueの追従は最小限

### Status
Accepted

### Context
P33 モックには 3 状態（STATE1 パスワードゲート / STATE2 解錠成功 → P31 遷移 / STATE3 失効・削除）がある。
旧 `.issue/500/decisions-pending.md` では「STATE2 をゲート内インライン本文描画にするか P31 遷移にするか」
「expired/gone に CTA を出すか」が要判断だったが、**#510 が更新モックで方針を確定済み**:

- STATE2: モック 430-458行のコメントが「確定方針 (#510 横断#9): 解錠成功時はゲート内に本文をインライン描画せず、
  実装(ShareLinkGate)に合わせて公開ノート(P31)へ遷移する」と明記。実装 `ShareLinkGate/index.tsx` は
  `router.navigate({ to: "/notes/public/$noteId" })` で既に P31 へ遷移しており**モックと一致**。
- STATE3: モック 474-478行が「確定方針 (#510): expired/gone では『トップへ戻る』CTA を据え置く。…実装
  (ShareLinkGate)への CTA 追加は別Issue引き渡し」と明記。実装は現状 `isExpiredOrGone` 分岐でアイコン+タイトル+
  サブのみを出し、**CTA「トップへ戻る」を持たない**。これがモックとの明確な乖離。

### Decision
P33 で本Issueが埋める乖離は **STATE3 の「トップへ戻る」CTA 追加の 1 点**に絞る。STATE2 は既に一致しており触らない。
モック内のロックアウト警告（`.alert-warning`）は実装で `LOCKOUT` 定数による表示があるが、index.md §フィードバック
原則の `.alert` 案D（白地 + セマンティック枠）に揃っていない（現 `LOCKOUT` は塗りつぶし背景）。ただしモック自体は
共有ゲートで `.alert alert-warning`（案D）を使っており（`P33-share-link.html` 413-416行）、実装の `LOCKOUT` は
案D に未追従。これは index.md §「`.alert` の構造」の追従対象だが、`.alert` 共通基盤は #539（PR #547）で確立済み
のため、本Issueで `LOCKOUT` を `.alert alert-warning`（案D）相当へ寄せる軽微追従を行う（ADR-006）。

### Consequences
- 良い点: #510 が確定した方針に従い、迷いなく STATE3 CTA に絞れる。
- トレードオフ: STATE2 のインライン本文は意図的に作らない（モックも実装遷移方式を正としている）。

---

## ADR-006: P33 ロックアウト警告を共通 `.alert`（案D）に追従させる

### Status
Proposed（実装時に #539 の ALERT* 定数の所在を確認）

### Context
P33 モックのロックアウト警告は `.alert alert-warning`（案D = 白地 + セマンティックヘアライン枠 + アイコン +
見出し + 本文, `P33-share-link.html` 295-318行・413-416行）で描かれる。実装 `styles.ts` の `LOCKOUT`
（146-147行）は `bg-warning-surface border border-warning`（塗りつぶし背景）で案D に未追従。index.md は
「`.alert` の構造: 白地 + セマンティックカラーのヘアライン枠 + `--shadow-xs`。塗りつぶしは避ける」と定める。

### Decision
#539（PR #547）で確立した共通 `ALERT*` 定数（`app/components/common/styles.ts`）が利用可能なら、それを再利用して
`ShareLinkGate` のロックアウト表示を案D（白地 + 枠 + `ALERT_WARNING`）に寄せる。`role` は進行/案内なので
モック準拠で `role="status"` とする（モック 413行）。共通定数が当該文脈に合わなければ `styles.ts` の `LOCKOUT` を
案D 相当（白地 + `border-warning/30` 相当 + `shadow-xs`）へトークン経由で書き換える。**新規の `.alert` スタイル
定数は新設しない**（#539 で確定済み、#541 ADR と同方針）。実装時に `ALERT*` 定数の存在・形を確認してから決める。

### role の選択（#541 規約との意図的な差異）
ロックアウト警告の `role` は、モック 413行に従い `role="status"`（polite）とする。#541 plan は「error/warning は
`role="alert"`、info は `role="note"`」と整理しており、warning であるロックアウトは #541 流なら `alert` になる。
本Issueで意図的に違えるのは、ロックアウトが「assertive に割り込むべき警告」ではなく「あと N 分で再試行できる、
という polite な案内」だから。assertive な `alert` は SR の読み上げを中断させるため、案内には過剰。モック準拠
かつアクセシビリティ的にも `status` が適切。後続レビューでの「`alert` に揃えるべき」という揺り戻しを防ぐため
ここに記録する。

### 実装時確認の結果（事前調査済み）
`ALERT*` 共通定数は `app/components/common/styles.ts`（#539 由来）に実在を確認済み（`ALERT` 自体が
`bg-bg shadow-xs border border-[color-mix(...30%...)]` の案D 実装）。よって本ADRは**再利用一択で成立**し、
`LOCKOUT` ローカル書き換えのフォールバックは発火しない見込み。Status を Proposed のまま残すのは最終的な
クラス組み合わせを実装時に確定するため。

### Consequences
- 良い点: 公開ゲートのアラートが index.md のアラート原則（案D）に揃う。リテラル色を増やさずトークン経由。
- トレードオフ: #539 の `ALERT*` 定数が未マージ/未提供なら `LOCKOUT` のローカル書き換えに倒す（その場合も
  トークン経由で案D の見た目に寄せる）。実装時の事実確認に依存する。

---

## ADR-007: 公開側空状態（EMPTY_LIST / SEARCH_EMPTY）のアイコンは #284 所有につき本Issueでは触らない

### Status
Accepted

### Context
Issue #544 本文・index.md §7.1 ともに「公開側 `EMPTY_LIST` のアイコン付与は **#284 で行う**」と明記。
`.issue/500/decisions-pending.md` 横断#6 も「公開側 EMPTY_LIST/SEARCH_EMPTY はアイコン無しが意図的（#231
スコープ外）」とする。一方 P30/P32 モックは populated list のみを描き、空状態自体を図示していない。

### Decision
EMPTY_LIST / SEARCH_EMPTY のアイコン付与・空状態体裁の刷新は **#284 の所有**につき本Issueでは触らない。
「含まれないもの」に明記する。現状の素テキスト空状態はそのまま温存する。

### Consequences
- 良い点: #284 とのスコープ衝突を回避（#541 が #539/#284 等と衝突回避した方針と同型）。
- トレードオフ: 公開側空状態のアイコンは本Issueでは未対応のまま（#284 で解消）。

---

## ADR-008: ShareLinkGate を「ステートフルなコンテナ」と「純粋な表示ビュー」に分割する（実装時に追記）

### Status
Accepted（実装時に追加）

### Context
本Issueのテスト要件（plan.md ステップ5: 失効/削除 CTA・ロックアウト案D・パスワード不一致インライン回帰）は
すべて `ShareLinkGate` の `state.error` を分岐起点とする描画ロジックの検証である。しかし `ShareLinkGate` は
React 19 の `useActionState` + `<form action={formAction}>` で error state を生成しており、テストから error state を
作るには form submit を発火させる必要がある。

このリポジトリのテスト環境は happy-dom（jsdom / @testing-library 不在、vitest.config の environment は node）で、
React 19 のクライアント form action は submit 時に `action="javascript:throw …"` マーカーを介して React が
ネイティブ submit を横取りする方式のため、happy-dom 上では `form.requestSubmit()` も
`dispatchEvent(new Event("submit"))` も React のルートリスナーに届かず、action（reducer）が一度も呼ばれない
（calls=0 を実測で確認）。つまり「submit を起点に error state を作る」テストはこの環境では成立しない。

### Decision
`ShareLinkGate`（`useRouter` / `useServerFn` / `useActionState` を持つコンテナ）から、描画分岐だけを担う純粋な
`ShareLinkGateView`（`state` / `formAction` / `isPending` を props で受ける）を切り出して **export** する。
テストは `ShareLinkGateView` に `state.error` を直接渡し、`renderToStaticMarkup` で出力を検証する
（リポジトリ既存の RSC テスト手法＝`NoteDetail.test.tsx` 等と同型）。コンテナ側の reducer ロジック
（resolve → navigate / catch → extractSerializedError）は薄い配線のみで分岐を持たないため、ビューの分岐検証で
追従要件のカバレッジは満たせる。

### Consequences
- 良い点: happy-dom で不安定な form-action 駆動に依存せず、エラー分岐（CTA / 案D アラート / インライン）を
  決定的に検証できる。container/presentational の標準的な分割で可読性も上がる。
- トレードオフ: コンテナの reducer（resolve 成功 → navigate）はビューテストの対象外。ただしこれは外部依存
  （server fn / router）の薄い配線で、ブラウザ確認（manual-test）観点に委ねるのが妥当。
</content>
</invoke>
