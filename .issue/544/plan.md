# 実装計画 — Issue #544: impl: 領域5「公開・共有で読まれる体験」(P30/P31/P32/P33) のモック実装追従（#514 子）

**Issue:** #544
**作成日:** 2026-06-07
**複雑度:** 小（モック⇄実装の突き合わせ結果、本Issueで埋めるのは少数の UI 乖離。大きな乖離はすべてバックエンド新設
を伴うため別Issueへ落とす）

---

## 概要

P30/P31/P32/P33 の各モック（SSOT）と現実装を 1 枚ずつ突き合わせた結果、モックに描かれていて実装に無い乖離の
**大半はドメインポート/usecase の新設を伴う**（公開バックリンク・関連ノート・フィルタードロワーの combobox
サジェスト・タグ/ソート絞り込み）ため、モック追従（= UI 追従）である本Issueのスコープを超える。これらは
`.issue/500/followups.md` でも「別Issue化候補=Yes」と判定済み。本Issueは **バックエンド変更なしで成立する UI
乖離のみ**を埋める。具体的には P33 失効状態の「トップへ戻る」CTA 追加と、P33 ロックアウト警告の `.alert` 案D 追従
の 2 点に集約される。スコープの切り方・「含まれないもの」の徹底は #541（領域2）に倣う。

---

## 調査結果

### 関連ファイル（モック ⇄ 実装 ⇄ ルートの対応）

| モック (SSOT) | コンポーネント実装 | ルート | スタイル |
|---|---|---|---|
| `spec/design/pages/P30-user-public-top.html` | `app/components/public/UserPublicTop.tsx` | `app/routes/u/$username/index.tsx` | `app/components/public/styles.ts` |
| `spec/design/pages/P31-public-note.html` | `app/components/public/PublicNoteDetail.tsx` | `app/routes/u/$username/$noteSlug.tsx`, `app/routes/notes/public/$noteId.tsx` | 同上 |
| `spec/design/pages/P32-public-search.html` | `app/components/public/PublicSearch.tsx` | `app/routes/search.tsx` | 同上 |
| `spec/design/pages/P33-share-link.html` | `app/components/public/ShareLinkGate/index.tsx`, `action.ts` | `app/routes/share/$token.tsx` | 同上 |

共通シェル: `app/components/public/PublicLayout.tsx`（ヘッダー検索・フッター・サインアップ/ログイン）。

### あるべきアーキテクチャ（CLAUDE.md / index.md / tokens.md）

- 公開シェル（index.md §2.4）: サイドバーを持たない単一カラム + 公開用ヘッダー（サインアップ/ログイン導線）。
  読み物としての集中を優先。`PublicLayout` がこれを満たす。
- デザイントークン経由で寸法・色を当て、リテラル px の新規持ち込みを避ける（Issue 本文 / styles.ts 既存方針）。
- アラートは index.md §フィードバック原則の `.alert` 案D（白地 + セマンティックヘアライン枠 + `--shadow-xs`、
  塗りつぶし背景は使わない）。共通基盤は #539（PR #547）で確立。
- 未実装機能を約束する UI にしない（#541 ADR-005 と同方針）。機能の裏付けが無い飾り UI は作らない。
- 検証は transport 境界（`validateSearch` / `inputValidator`）と VO 構築の二点。`serverData` は内部専用。
- 空状態アイコン: 公開側 `EMPTY_LIST` のアイコン付与は #284 所有（index.md §7.1）。

### 既存実装の状態（モック ⇄ 実装の乖離一覧）

凡例: 「埋める」= 本Issueで対応 / 「スコープ外」= 別Issue起票候補 / 「一致」= 乖離なし。

#### P30-user-public-top

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| ヘッダー検索 `header-search`（521-524行） | `PublicLayout.tsx` 45-63行（`PUBLIC_HEADER_SEARCH`） | なし（実装済み・表示中） | 一致（ADR-004） |
| user-tools ユーザー検索 `user-search`（550-554行） | `UserPublicTop.tsx` 117-137行（`USER_SEARCH`） | なし（実装済み） | 一致（ADR-004） |
| プロフィール hero（534-548行） | `UserPublicTop.tsx` 94-115行（`PROFILE_HERO`） | hero 構造は一致。**hero 文言の仮置き解消は #533 所有**（Issue 本文） | スコープ外（#533） |
| フィルター chip 群（すべて/#タグ/タグ追加/期間, 556-570行） | 実装なし | タグ絞り込み引数を `listUserPublicNotes` が持たない。機能裏付けが無い | **スコープ外**（ADR-003。followups 168行=Yes） |
| 表示モードセグメント（リスト/タイル/カレンダー, 572-586行） | 実装なし | 表示モードコンポーネント + usecase 拡張が必要 | **スコープ外**（ADR-003。followups 169行=Yes） |
| ソートボタン（公開日順, 588-591行） | 実装なし | usecase にソート引数が無い | **スコープ外**（ADR-003） |
| 空状態 EMPTY_LIST | `UserPublicTop.tsx` 141-143行（素テキスト） | モックは空状態を図示せず。アイコン付与は #284 | スコープ外（#284, ADR-007） |

→ **P30 は本Issueで埋める乖離なし**（一致 or 他Issue所有）。

#### P31-public-note

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| breadcrumb / author-mini / doc-title / meta-inline / pub-pill / 本文（556-678行） | `PublicNoteDetail.tsx` 41-110行 | 一致（構造・トークンとも） | 一致 |
| bottom-meta（タグ + 公開/更新日の再掲, 680-687行） | 実装なし | 末尾再掲。followups 177行=「別Issue化候補=No」（軽微） | スコープ外（軽微・No 判定） |
| バックリンクセクション（`.backlink-list`, 689-701行） | 実装なし（`BACKLINKS` 定数は未使用） | 公開バックリンク usecase（可視性フィルタ）の新設が必要 | **スコープ外**（ADR-001。followups 175行=Yes） |
| 関連ノートグリッド（`.related-grid`, 703-723行） | 実装なし | 著者の公開ノート（当該除外）クエリ/usecase の新設が必要 | **スコープ外**（ADR-001。followups 176行=Yes） |
| 本文 wikilink/hashtag 装飾（404-427行） | `index.css` 側責務（dangerouslySetInnerHTML） | §6 規約準拠でモック正 | スコープ外（followups 178行=No） |

→ **P31 は本Issueで埋める乖離なし**（実体ある乖離はすべてバックエンド新設前提＝ADR-001 でスコープ外）。

#### P32-public-search

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| hero 検索（861-869行, h1 + sub + 大型入力 + kbd） | `PublicSearch.tsx` 76-107行 | hero・大型検索は一致。`hero-sub`「このインスタンス全体の…横断検索」相当の説明文が実装に無い（モック 863行） | **要確認**（後述ステップ参照。文言追加は軽微・バックエンド不要） |
| filter-bar（件数 + フィルターボタン(バッジ) + ソート, 873-890行） | `PublicSearch.tsx` 109-127行（`SEARCH_SUMMARY` 件数のみ） | フィルターボタン/ソートはドロワー前提 | スコープ外（ADR-002。followups 185行=Yes） |
| アクティブフィルターチップ列（892-913行） | 実装なし | ファセット選択状態の表現。ドロワーと一体 | スコープ外（ADR-002。followups 186行=Yes） |
| フィルタードロワー（combobox + 期間 radio, 1015-1116行） | 実装なし | combobox サジェスト用バックエンド新設が必要 | **スコープ外**（ADR-002。followups 187行=Yes） |
| 検索結果の `<mark>` ハイライト（503-508行 + 結果内 mark） | `PublicSearch.tsx` 161-163行（プレーン） | ヒット語ハイライト。`snippet` がプレーン文字列で、ハイライト span を返すには SearchService/adapter の変更が要る可能性 | **要調査**（後述） |
| 結果スニペット 2 行 clamp（509-517行 `line-clamp:2`） | `styles.ts` `SEARCH_HIT_SNIPPET`（clamp 無し, 120-121行） | 軽微。followups 189行=「別Issue化候補=No」だが、トークン経由の純 CSS 追従でバックエンド不要 | **埋める候補**（軽微・低リスク） |
| レート制限（旧 `.rate-banner`） | 実装なし | **更新モックでは常設バナーをやめトースト化**（`P32-public-search.html` 184-185・1118-1133行）。トースト基盤は別Issue（モック注記） | スコープ外（トースト基盤・別Issue） |

→ P32 で本Issueが埋める候補は「スニペット 2 行 clamp」「hero-sub 説明文」程度の軽微追従。`<mark>` ハイライトは
要調査（バックエンド非依存で可能か判定。不可ならスコープ外）。

#### P33-share-link

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| STATE1 パスワードゲート（401-428行） | `ShareLinkGate/index.tsx` 79-141行 | 一致（アイコン・タイトル・フォーム・エラー） | 一致 |
| STATE2 解錠成功 → P31 遷移（430-458行） | 同 44-67行（`router.navigate` で P31 遷移） | **#510 確定方針で一致**（モック 433-435行コメント） | 一致（ADR-005） |
| STATE3 失効/削除の「トップへ戻る」CTA（476行） | 実装の `isExpiredOrGone` 分岐は CTA を持たない（同 88-103行） | **モックにあって実装に無い** | **埋める**（ADR-005） |
| ロックアウト警告 `.alert alert-warning`（案D, 413-416行） | `LOCKOUT` 定数は塗りつぶし背景（`styles.ts` 146-147行） | index.md `.alert` 案D（白地+枠）に未追従 | **埋める**（ADR-006） |

### 依存関係

- バックエンド変更: **本Issueの確定スコープ（P33 CTA / ロックアウト案D / P32 軽微追従）は不要**。
- `.alert` 共通定数（`ALERT*` / `app/components/common/styles.ts`）: #539（PR #547）由来。ロックアウト案D 追従で
  再利用したい。実装時に存在・形を確認（ADR-006）。なければ `LOCKOUT` のローカル書き換えに倒す。
- 他Issue所有（本Issューでは触らない）: #533（P30 hero 文言）/ #284（公開側空状態アイコン）/ トースト基盤
  （P32 レート制限）/ 本Iss別起票候補（P30 chip・表示モード・ソート / P31 バックリンク・関連ノート / P32 ドロワー）。

---

## スコープ

### 含まれるもの

1. **P33 STATE3（失効/削除）に「トップへ戻る」CTA を追加**（モック 476行）。`ShareLinkGate` の `isExpiredOrGone`
   分岐へ、ホームへ戻る導線を 1 つ追加する。
2. **P33 ロックアウト警告を `.alert` 案D に追従**（モック 413-416行 / index.md `.alert` 構造）。#539 の `ALERT*`
   定数を再利用、無理なら `LOCKOUT` をトークン経由で案D 相当へ。新規 `.alert` 定数は新設しない。
3. **P32 検索結果スニペットの 2 行 clamp 追従**（モック 509-517行）。`SEARCH_HIT_SNIPPET` に `line-clamp:2`
   相当をトークン/ユーティリティで付与（純 CSS、バックエンド非依存）。
4. **P32 hero-sub 説明文の追従**（モック 863行「このインスタンス全体の公開ノートから横断検索できます」）。実装の
   hero に説明文が無ければ追加（軽微・文言のみ）。※実装時に既存有無を再確認し、既にあれば対象外。
5. 上記の動作に関わる単体テスト追加 / 既存テストの整合更新。

### 含まれないもの（別Issue起票候補 / 他Issue所有）

- **P31 公開バックリンク・関連ノート**（ADR-001）→ 別Issue（公開バックリンク usecase〔可視性フィルタ〕＋著者の
  公開ノート usecase の新設 → `PublicNoteDetail` への 2 セクション追加）。
- **P32 フィルタードロワー一式（combobox サジェスト・アクティブチップ・フィルターボタン/ソート）**（ADR-002）→
  別Issue（公開タグ/ユーザーサジェスト usecase の新設が前提。`searchPublicNotes` は `tagNames`/`dateRange` を
  既に持つので配線土台はある）。
- **P30 フィルター chip 群・表示モードセグメント・ソートボタン**（ADR-003）→ 別Issue（`listUserPublicNotes` の
  タグフィルタ/ソート拡張 + タイル/カレンダー表示モード）。
- **P30 hero 文言の仮置き解消** → **#533 所有**。
- **公開側空状態（EMPTY_LIST / SEARCH_EMPTY）のアイコン付与** → **#284 所有**（ADR-007）。
- **P32 レート制限のトースト化** → グローバルトースト基盤の別Issue（更新モックがトースト方式に確定、基盤は別追従）。
- **P31 bottom-meta 末尾再掲**（followups=No, 軽微）→ 必要なら別Issue。本Iss ューでは扱わない。
- **P33 STATE2 のゲート内インライン本文描画** → #510 確定方針により**作らない**（P31 遷移が正）。
- **P32 `<mark>` ヒット語ハイライト** → 要調査の結果、`searchPublicNotes`/SearchService がハイライト span を
  返さない（プレーン snippet）なら**スコープ外**（バックエンド変更を伴うため。ステップ0で判定）。

---

## Issue「主な追従ポイント」4本柱に対するカバレッジ

Issue 本文が掲げる4本柱に対し、本Issueが実際にカバーする範囲を明示する（スコープの薄さを誤解しないため）。

| 本柱 | 本Issueのカバレッジ | 落とし先 |
|---|---|---|
| 公開側の検索・フィルタ強化（P30 / P32） | **一部のみ**（P32 スニペット2行clamp / hero-sub文言）。chip・表示モード・ソート・ドロワーは全てスコープ外 | ADR-002/003（別Issue） |
| 公開ノートの関連導線（P31 / P33） | **ゼロ追従**（バックリンク・関連ノートはバックエンド新設前提） | ADR-001（別Issue） |
| 共有リンク解錠体験（P33） | **本命**（STATE3 CTA 追加 + ロックアウト警告の案D 追従） | 本Issueで対応 |
| 空状態（EMPTY_LIST） | **ゼロ追従**（公開側アイコンは #284 所有） | #284 |

→ 4本柱のうち本Issueの本体は「共有リンク解錠体験」。他3本はバックエンド新設前提 or 他Issue所有のため、
バックエンド不要で成立する軽微な検索UI追従（P32）のみを併せて拾う。

---

## 実装ステップ

### 0. hero-sub の事実確認（着手前の確定）

- **`<mark>` ハイライトはプレーン確定済み（調査完了）:** `app/core/application/dto/search.ts:9` の
  `SearchHitDTO.snippet: string` と `toSearchHitDTO`（同 60行）の `hit.snippet as string`、ドメイン
  `SearchHit.snippet`（`SearchSnippet` プレーン値）より、snippet はハイライト span/offset を一切持たない
  プレーン文字列。`<mark>` 追従は SearchService/adapter 改修を伴う → **スコープ外で確定**（ステップ6で別Issue
  起票候補に記録）。着手前の再調査は不要。
- **hero-sub の確認:** `PublicSearch.tsx` の hero（`PublicSearch.tsx:76-107`、h1 直下が即フォーム）に説明文は
  無い。ただし類似文言「同じインスタンスの公開ノートを横断検索できます。」が**未検索時の空状態**内
  （`PublicSearch.tsx:135`）に既に存在する。ステップ4 はこの重複を踏まえて扱う。
- **理由:** モック追従はモックが正だが、バックエンド大改修を要する乖離は本Issueのスコープ外（Issue 原則）。
  `<mark>` はその典型で、調査済みのため確定扱いとする。

### 1. P33 失効/削除状態に「トップへ戻る」CTA を追加

- **対象ファイル:** `app/components/public/ShareLinkGate/index.tsx`
- **変更内容:** `isExpiredOrGone` が真のとき、`GATE_SUB` の下に「トップへ戻る」リンクを追加する。
  `<Link to="/" search={HOME_SEARCH}>`（`@/components/auth/links` の `HOME_SEARCH` を使用、`PublicLayout` の
  ログイン/サインアップと同じトップ導線）。スタイルは `GATE_SUBMIT`（`pillBtn + pillBtnTall + pillBtnPrimary`,
  全幅）を流用し、`data-primary=""` を付ける（`GATE_SUBMIT` は `data-primary` 前提のため必須）。モック 476行は
  full-width の primary CTA。
- **アイコン:** モック 476行はアイコン無し（素テキスト「トップへ戻る」）。index.md §7.1「空状態 CTA は
  アイコン+ラベルが向く」が、本 CTA は失効状態の単独 primary であり、モックに忠実にテキストのみで実装する
  （モック準拠を優先。アイコンを足すならモック逸脱の明示が要るため足さない）。
- **理由:** `.issue/500/decisions-pending.md` 横断・モック 474-478行コメントの #510 確定方針「expired/gone では
  CTA を据え置く。実装への CTA 追加は別Issue引き渡し」を本Iss ューで履行する。次の行動を提示でき UX が向上する。

### 2. P33 ロックアウト警告を `.alert` 案D に追従

- **対象ファイル:** `app/components/public/ShareLinkGate/index.tsx`（+ 必要なら `styles.ts`）
- **変更内容:** 現在 `LOCKOUT`（塗りつぶし背景）で出しているロックアウト警告（同 99-103行）を、index.md `.alert`
  案D（白地 + セマンティックヘアライン枠 + `--shadow-xs` + アイコン + 本文）に寄せる。
  - #539（PR #547）の共通 `ALERT*` 定数（`app/components/common/styles.ts`）が利用可能なら再利用
    （`ALERT + ALERT_WARNING` + `ALERT_ICON`〔Lucide 警告系 `size={20}` `aria-hidden`〕+ `ALERT_BODY`）。
  - 利用不可なら `styles.ts` の `LOCKOUT` を案D 相当（白地 `bg-bg` + `border` を `color-mix` の warning 30% 相当
    か `border-warning/30` 等トークン経由 + `shadow-xs`）へ書き換える。**リテラル px/色を新規持ち込まない。**
  - `role` はモック 413行に合わせ `role="status"`（進行/案内）に変更（現状 `role="alert"`）。ロックアウトは
    「あと N 分で再試行」の案内であり assertive より polite が適切（モック準拠）。**#541 plan は「warning は
    `role="alert"`」と整理したが、本件は warning でも「再試行可能時刻の polite な案内」のため意図的に
    `role="status"` とする（揺り戻し防止のため ADR-006 にも記録）。**
  - 文言は現行 `gateErrorMessage` の「試行回数の上限に達しました。しばらく時間をおいて再度お試しください。」を
    温存（実データの残り時間が無いため、モックの「あと 5 分」固定値は採らない。#541 ADR-005 と同じ「実在しない
    値を約束しない」方針）。
- **理由:** index.md「`.alert` 構造（案D = 白地・塗りつぶし回避）」への追従。共通基盤再利用でリテラル排除。

### 3. P32 検索結果スニペットの 2 行 clamp 追従

- **対象ファイル:** `app/components/public/styles.ts`（`SEARCH_HIT_SNIPPET`）
- **変更内容:** `SEARCH_HIT_SNIPPET` に 2 行 line-clamp を付与する。モック 509-517行は
  `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden`。同ファイル内の
  `NOTE_SNIPPET`（54行）が `[display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]` の
  確立済みパターンなので、同型で `clamp:2` を当てる。`leading` はモック 511行が `--leading-relaxed` なので、
  既存 `leading-normal` を**モック準拠で `leading-relaxed` に確定で合わせる**（純 CSS・低リスク）。
- **理由:** 純 CSS のモック追従。バックエンド非依存・低リスク。followups は「No（差は軽微）」だが、トークン経由で
  安全に閉じられるため埋める。

### 4. P32 hero-sub 説明文の追従

- **対象ファイル:** `app/components/public/PublicSearch.tsx`（+ `styles.ts` に `SEARCH_HERO_SUB` 追加）
- **変更内容:** hero の h1 直下に説明文「このインスタンス全体の公開ノートから横断検索できます」（モック 863行）を
  追加。スタイルはモック 257-261行（`text-sm text-ink-secondary mb-…`）相当を `styles.ts` に定数化して当てる
  （リテラル px を避けトークンユーティリティで）。
- **重複の扱い（重要）:** 類似文言「同じインスタンスの公開ノートを横断検索できます。」が**未検索時の空状態**
  （`PublicSearch.tsx:135`）に既に存在する。モックは hero（h1 直下・常時表示）に置くので、hero へ説明文を
  常設するなら**空状態側の同趣旨の一文は削る**（二重掲出を避ける）。空状態は「まだ検索していません」系の
  ガイダンスに役割を絞る。モック準拠で hero を SSOT とし、空状態文言と内容が衝突しないよう整理する。
- **理由:** モックにあって hero に無い軽微な説明文の追従。文言のみでバックエンド非依存。

### 5. テストの追加・更新

- **対象ファイル:** `app/components/public/ShareLinkGate` のテスト（無ければ新規）、`PublicSearch` 関連テスト。
- **変更内容:**
  - (a) `isExpiredOrGone`（`share_link_revoked` / `notFound`）時に「トップへ戻る」CTA が描画される。
  - (b) ロックアウト時（`share_link_locked`）に案D のアラート（`role="status"` + 警告アイコン + 本文）が出る。
  - (c) パスワード不一致（`share_link_password_invalid`）時は従来どおりインラインエラーが出る（回帰）。
  - (d) （ステップ4 を実施した場合）検索 hero に説明文が描画される。
- **理由:** 追従ロジック（CTA 分岐・アラート種別）の回帰防止。

### 6. 仕上げ

- **対象:** 変更全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。未使用 import 整理（`SHARE_NOTE_BANNER` /
  `BACKLINKS` 等の未使用定数は本Issのスコープ外につき削除しない＝別Iss ューの土台として残置）。残課題・別Issue
  起票候補を `.issue/544/progress.md` に記録（P30 chip/表示モード/ソート、P31 バックリンク/関連ノート、
  P32 ドロワー、P32 `<mark>`〔プレーン確定〕）。
- **別Issue起票の追跡（#514 親要請）:** #514 は「個別 Issue があるテーマはそこで対応、本 Issue からリンクで追跡」を
  求める。スコープ外に落とした主要乖離（P30 chip/表示モード/ソート、P31 バックリンク/関連ノート、P32 ドロワー、
  P32 `<mark>`）は本Issueの Phase 4 でまとめ方を判断し、別Issue起票 or #514 へのコメント追記でリンク追跡する
  （progress.md への記録だけで終わらせず、親のチェックボックス追跡から漏らさない）。

---

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001:** P31 バックリンク・関連ノートはバックエンド新設前提 → スコープ外（別Issue起票候補）。
- **ADR-002:** P32 フィルタードロワー（combobox サジェスト）はバックエンド新設前提 → スコープ外。
- **ADR-003:** P30 フィルター chip / 表示モード / ソートは機能裏付けが無い飾りになる → スコープ外。
- **ADR-004:** P30 ヘッダー検索・ユーザー検索は既に一致 → 追従不要。
- **ADR-005:** P33 は #510 確定方針で STATE1/STATE2 一致。本Issは STATE3 CTA に絞る。
- **ADR-006:** P33 ロックアウトを `.alert` 案D に追従（#539 の ALERT* 再利用、新規定数は作らない）。
- **ADR-007:** 公開側空状態アイコンは #284 所有 → 触らない。

---

## リスクと注意点

- **スコープ侵食が最大リスク。** P30/P31/P32 のモックは豊富な検索/フィルタ/関連導線を描くが、実体ある乖離の大半は
  バックエンド新設（公開バックリンク usecase・サジェスト usecase・タグ/ソート絞り込み拡張・表示モード）を伴う。
  「モックにあるから」と UI だけ先に作ると、押しても動かない飾り UI（index.md §4・CLAUDE.md 違反）になる。本Issは
  **バックエンド変更なしで成立する乖離のみ**に厳格に限定する。
- **他Issue所有との衝突回避:** #533（P30 hero 文言）/ #284（公開側空状態アイコン）/ トースト基盤（P32 レート制限）
  は本Iss ューで触らない。`SHARE_NOTE_BANNER` / `BACKLINKS` 等の未使用定数は別Iss ューの土台として削除しない。
- **`.alert` 共通定数の所在依存:** ADR-006 は #539（PR #547）の `ALERT*` 定数の存在を前提にする。実装時に
  `app/components/common/styles.ts` を確認し、無ければ `LOCKOUT` のローカル書き換えに倒す（どちらもトークン経由で
  案D に寄せ、リテラル色/px を新規持ち込まない）。
- **`<mark>` ハイライトの判定漏れ:** ステップ0 で `SearchHitDTO.snippet` がプレーン確定なら、`<mark>` 追従は必ず
  スコープ外に落とす（バックエンド変更を伴うため）。ここを曖昧にすると SearchService 改修に踏み込むリスク。
- **GATE_SUBMIT の `data-primary` 依存:** P33 CTA で `GATE_SUBMIT` を流用する際、`data-primary=""` を付け忘れると
  accent が当たらず surface 表示になる（styles.ts 142-145行コメント）。必ず付与する。

---

## テスト方針

- **単体（happy-dom / vitest）:**
  - P33: 失効/削除分岐で「トップへ戻る」CTA が出る。ロックアウト時に案D アラート（`role="status"`）が出る。
    パスワード不一致のインラインエラー回帰。
  - P32:（実施時）hero 説明文の描画。スニペット 2 行 clamp はスナップショット/クラス検証で十分。
- **型/リント:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **ブラウザ確認（manual-test）観点:**
  - `/share/$token` で失効/削除リンク → 「リンクは無効です」+「トップへ戻る」CTA が full-width primary で表示、
    押下でトップへ。
  - 連続失敗でロックアウト → 案D アラート（白地 + 警告ヘアライン枠 + `shadow-xs` + 警告アイコン）。塗りつぶし
    背景になっていないこと。リテラル px/色の混入なし。
  - `/search?q=...` の結果スニペットが 2 行で省略される（モック 2 行 clamp と一致）。
  - （実施時）`/search` の hero に「このインスタンス全体の公開ノートから横断検索できます」が表示。
  - 回帰: P30 プロフィール / ヘッダー検索 / ユーザー検索、P31 本文・breadcrumb・author-mini・pub-pill、
    P33 パスワードゲート（STATE1）と解錠 → P31 遷移（STATE2）が従来どおり。

---

## レビュー履歴

### 1周目（要件カバレッジ視点 / アーキ・リスク視点 を並列実施）

**アーキ・リスク視点: 問題点ゼロ。** 計画が前提とする事実関係（`ALERT*` 定数の実在、`SearchHitDTO.snippet` が
プレーン、`GATE_SUBMIT`+`data-primary`+`HOME_SEARCH` の流用パターンが `TrashList.tsx:60` に実在、role=status の
妥当性）をすべてコードで裏付け確認。要修正なし。

**要件カバレッジ視点: 問題点1件（ドキュメント補強）。**

**修正した点**:
- **[P-001要件]** P32「期間（dateRange）」ファセットはバックエンド不要で配線可能なのにドロワー一括でスコープ外に
  した根拠が未文書化 → **ADR-002 に追記**。「(1) 期間 radio の `facet-count` 件数表示には集計 usecase が要る、
  (2) combobox 2ファセットとドロワー一体設計のため単独切り出しは不自然」という見送り根拠を明示。

**取り込んだ改善提案**:
- **[S-001要件 / S-001アーキ]** `<mark>` はプレーン確定済み（`dto/search.ts:9`）→ ステップ0 を「保留判定」から
  「確定済み」に変更。hero-sub が既存空状態文言（`PublicSearch.tsx:135`「同じインスタンスの公開ノートを横断検索
  できます。」）と重複する点をステップ0・ステップ4 に明記し、二重掲出を避ける整理方針を追記。
- **[S-002要件]** Issue「主な追従ポイント」4本柱に対するカバレッジ表を追加（本体は共有リンク解錠体験、他3本は
  バックエンド新設前提 or 他Issue所有）。
- **[S-003要件]** スコープ外の主要乖離を Phase 4 で別Issue起票 or #514 へリンク追跡する旨をステップ6 に明記
  （progress.md 記録だけで終わらせない）。
- **[S-002アーキ]** role を #541 規約（warning=alert）と意図的に違えて `status` にする根拠を ADR-006 に記録。
- **[S-003アーキ]** スニペット `leading` を `leading-relaxed` にモック準拠で確定（「確認」→「確定」）。

**見送った提案とその理由**:
- なし（全提案がスコープ内のドキュメント補強・確定化のため取り込み。期間ファセットの実装取り込みは P-001 の
  通り「見送り根拠を明記」で対応＝実装はしない）。

1周で両視点とも要修正の実装上の欠陥はゼロ（アーキは明示的に問題点ゼロ、要件は唯一の指摘がドキュメント補強で
反映済み）。スコープ削減の妥当性は両視点で裏付け確認されたため、レビューループを1周で収束・終了。
</content>
