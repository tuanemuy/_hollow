# ADR — Issue #683: ページ再訪時のスケルトンflash解消（leaf route の staleTime 本番キャッシュ化）

## ADR-001: コンテンツ表示系 leaf route の `staleTime: 0`（#293 由来の de-facto 値）を明文化のうえ撤回（supersede）

### Status
Accepted

### Context

Issue #293 の一連の決定では、`_app` layout route を `staleTime: Infinity` でキャッシュする一方、コンテンツ表示系の leaf route は `staleTime: 0`（ナビゲーションのたびに loader を再実行）が基本となっていた。

ただし `.issue/293/adr.md` には「leaf route は `staleTime: 0` を基本とする」という**単独の明示 Decision は実在しない**。#293 が positively 決めたのは AppShell の `staleTime: Infinity`（ADR-008）・leaf の defensive `getCurrentUser` ガード（ADR-009）・`router.invalidate` 整理の別 Issue 化（ADR-010）であり、leaf の `staleTime: 0` はこれらに付随して既定値として残った **複数 ADR にまたがる de-facto 値**である（単一の ADR で宣言されたものではない）。本 ADR は、この #293 由来の de-facto 値を初めて明文化したうえで撤回（supersede 宣言）する。

しかしこの構成は、本プロジェクトの leaf loader が `await renderServerComponent(<Page/>)` で **毎回新しい RSC ペイロード（Promise）** を返すため、ページ再訪のたびに以下の順序でスケルトンフラッシュを起こす:

1. キャッシュ済みコンテンツ表示
2. `staleTime: 0` による暗黙の背景再検証（明示 `routerInvalidate()` 無しでも発火）
3. 新ペイロードで内部の `<Suspense fallback={Skeleton}>` が再 suspend → スケルトン
4. 再取得完了で再描画

素のデータを返す loader なら Router 標準の stale-while-revalidate（古い表示のまま差し替え）が効くが、RSC ペイロードを持ち回る構成では効かない。

選択肢:
- (a) leaf を `staleTime: Infinity`（DEV のみ 0）化し、暗黙の再検証を止める。鮮度は明示 `routerInvalidate()` で担保。
- (b) 有限 `staleTime`（例 `10_000`）で先送りする。
- (c) leaf を RSC ペイロードから素データ返却に書き換え、stale-while-revalidate を効かせる。

(b) は staleTime 期限切れ後の再訪でまさに stale-while-revalidate を発火させ、RSC ペイロード再 suspend ＝ 同じフラッシュを起こす（先送りにしかならない）。(c) は構成全体の大改修でスコープ過大。

### Decision

(a) を採用する。#293 には「leaf route は `staleTime: 0` を基本とする」という単独の明示 Decision は存在しないが、複数 ADR にまたがって残った de-facto 値であった。本 ADR でその de-facto 値を明文化したうえで **撤回（supersede 宣言）** し、コンテンツ表示系 leaf route を既存の `_app` / settings 系で確立済みの慣用パターンに揃える:

```ts
staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
```

- DEV では `0`（HMR の鮮度維持）／本番では `Infinity`（ナビゲーション往復でキャッシュ再利用、背景再検証・スケルトン無し）。
- 鮮度は mutation 後の `routerInvalidate()`（`app/components/common/routerInvalidate.ts`、30+ 箇所で配線済み。admin 系もスポットチェックで配線確認）で担保するため `gcTime` は据え置き（ライブラリデフォルト）。

本撤回は #293 の他の決定（AppShell の `staleTime: Infinity`（ADR-008）、leaf の defensive `getCurrentUser` ガード（ADR-009）、`routerInvalidate` 除外ルール #299-003 / #669-003）には影響しない。これらは #293 で明示的に Decision 化されており、本 ADR が置き換えるのはあくまで Decision 化されていなかった de-facto の leaf `staleTime: 0` のみである。`.issue/293/adr.md` 本体は破壊的に編集せず、本 ADR で supersede を宣言する。

ライブ要件のルート（ダッシュボード・メトリクス・ジョブ進捗・エクスポート進捗）と editor 系（new/edit、`routerInvalidate` 除外対象）は対象外として据え置く。

### Consequences

- 良い点: ページ再訪時のスケルトンフラッシュが原理的に消える（背景再検証が起きない）。SPA 遷移時の不要な再取得が減る。`_app` / settings 系と鮮度方針が統一される。
- トレードオフ: mutation を経由しない再訪（戻る・直リンク・別タブ更新・バックグラウンドジョブ）での自動最新化を失う。ただしこれは本 Issue で意図的に止めたい挙動そのもの。

---

## ADR-002: 公開ルートは `staleTime: Infinity` ＋ 短い `gcTime`（有限 staleTime を採らない）

### Status
Accepted

### Context

公開コンテンツ系ルート（`search` / `u/$username` / `u/$username/$noteSlug` / `notes/public/$noteId`）は **匿名閲覧者に invalidate 経路が無い**（閲覧者は mutation せず、`routerInvalidate()` を呼ぶ動線が存在しない）。

ADR-001 の `staleTime: Infinity` だけを当てると、サーバー側でノートが更新されても閲覧者側のキャッシュが破棄されるまで反映されない。陳腐化に上限を設ける必要がある。

選択肢:
- (a) 有限 `staleTime`（例 `10_000` / `60_000`）で陳腐化を bound する。
- (b) `staleTime: Infinity` ＋ 短い `gcTime`（アンマウント後のキャッシュ保持時間）で bound する。

(a) は staleTime 期限切れ後の再訪で背景再検証 → RSC ペイロード再 suspend ＝ ADR-001 で解消したはずのフラッシュを再発させる（フラッシュの先送り）。

### Decision

(b) を採用する:

```ts
staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
gcTime: PUBLIC_ROUTE_GC_TIME, // 60_000
```

- 再訪が `gcTime` 内 → キャッシュ再利用（背景再検証が起きないのでフラッシュ無し）。
- 再訪が `gcTime` 超 → キャッシュ破棄済みでクリーンなフル再ロード（背景再検証ではないのでフラッシュは出ない）＝ サーバー側更新が反映される。

`PUBLIC_ROUTE_GC_TIME = 60_000` は **`app/components/public/routeCache.ts` に 1 箇所定義**し、4 公開ルートで import 共有する。`app/components/public/searchPeriod.ts` 等と同じ「focused framework-free public モジュール」の慣習に従う。後から 1 箇所で陳腐化上限を調整できる。

なお静的（legal）ルート（about/terms/privacy）はコンテンツも config 置換値もデプロイ単位で固定で runtime では変わらないため、`gcTime` bound は不要で `staleTime: Infinity` のみとする（ADR-001 の (A) と同じ扱い）。

### Consequences

- 良い点: 公開ルートで再訪フラッシュを消しつつ、`gcTime`（60s）超でサーバー側更新が反映される。有限 staleTime のフラッシュ先送り問題を回避。
- トレードオフ: サーバー側更新の反映に最大 `gcTime`（60s）の遅延が生じうる。匿名閲覧の鮮度要件としては許容範囲。

---

## ADR-003: フォーム系 3 ルートを本 Issue の (A) 群に含める

### Status
Accepted

### Context

`_app/export/index.tsx` / `_app/notes/$noteId/export.tsx` / `_app/upload/index.tsx` の 3 ルートは loader がフォーム seed のみを返し、page 内 state が source of truth。Issue 本文では「🔶 要検討（実装時に判断）」とされ、`Infinity` 化しても安全だが利用頻度が低い。

選択肢:
- (a) 本 Issue で (A) 群と同時対応する。
- (b) 別 Issue に切り出す。

### Decision

(a) を採用し、(A) 群と同じ `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` を当てる。

- いずれも `_app` 配下の認証済みルートで、差分は 1 行ずつ・テストも (A) と同型。分割の管理コストに見合うメリットが無い。
- フォーム seed は mutation 後に既存 `routerInvalidate()` で更新される（upload は配線済みコンポーネントから ingest）。

editor 系（new/edit）とは異なり `routerInvalidate` 除外リスト（ADR #669-003）には入れない。フォーム seed の鮮度は通常の invalidate で十分で、editLock のような in-progress 編集の保護も不要。

### Consequences

- 良い点: 認証済みコンテンツ系の鮮度方針が漏れなく統一される。
- トレードオフ: なし（安全性は Issue 本文でも確認済み）。
