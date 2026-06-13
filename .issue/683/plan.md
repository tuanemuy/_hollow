# 実装計画 — Issue #683: ページ再訪時のスケルトンflash解消 — コンテンツ表示系 leaf route の staleTime を本番キャッシュ化（staleTime:0 撤回）

**Issue:** #683
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

コンテンツ表示系 leaf route の `staleTime: 0`（＝ナビゲーションのたびに暗黙の再検証 → RSC ペイロード再 suspend → スケルトンフラッシュ）を撤回し、ルートの性質に応じて本番キャッシュ化（`staleTime: Infinity`）する。鮮度は既存の mutation 後 `routerInvalidate()` で担保し、自動再取得を止めることでページ再訪時のスケルトンフラッシュを原理的に解消する。

## 受け入れ基準

Issue 本文「受け入れ条件」を検証可能な基準に分解した。

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ホームを含む (A) 群の対象ルートで、一度開いたページに再訪してもスケルトンフラッシュが起きない（本番ビルド相当 / `import.meta.env.DEV=false`） | Issue「受け入れ条件」1 | 2 |
| AC-2 | (B) 公開ルートで再訪時（`gcTime` 内）にスケルトンフラッシュ（背景再検証による再 suspend）が起きない。※`gcTime` 超の再訪で出る per-section Suspense は初回フルロード相当の別問題（後述）であり本 AC の対象外 | Issue「受け入れ条件」1・(B) | 3, 4 |
| AC-3 | (C) 静的ルート（about/terms/privacy）で再訪時にスケルトンフラッシュが起きない | Issue「受け入れ条件」1・(C) | 5 |
| AC-4 | mutation 後（編集・削除・タグ操作など）は従来どおり `routerInvalidate()` で即時最新化される | Issue「受け入れ条件」2 | 2, 6 |
| AC-5 | ホームの SavedView リダイレクト（viewId 正規化）が初回ロードで従来どおり動作する | Issue「受け入れ条件」3 | 2 |
| AC-6 | 公開ルートはサーバー側更新が `gcTime`（60s）超の再訪で反映される。このときの per-section Suspense は初回フルロード相当（RSC streaming/hydration 起因）であり、ADR-001/002 で消した「背景再検証による再 suspend」のフラッシュとは別物（混同しない） | Issue「受け入れ条件」4・(B) | 3, 4 |
| AC-7 | ライブ要件のルート（ジョブ進捗・メトリクス・ダッシュボード・ジョブ監視・editor）は変更せず従来どおり最新を取得する | Issue「受け入れ条件」5・⛔群 | スコープ外（変更しない） |
| AC-8 | DEV では HMR の鮮度が維持される（`import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` パターン） | Issue「受け入れ条件」6 | 2, 3, 5 |
| AC-9 | ADR を更新。#293 には「leaf staleTime:0」の単独明示 Decision は実在せず複数 ADR にまたがる de-facto 値だった旨を明記したうえで、その de-facto 値を本 ADR で明文化・撤回（supersede 宣言）し、公開ルートの `Infinity`＋`gcTime` 方針を併記する | Issue「受け入れ条件」7・「影響・ADR」 | 1, 7 |
| AC-10 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue「受け入れ条件」8 | 8 |
| AC-11 | (B) 公開ルートで `PUBLIC_ROUTE_GC_TIME = 60_000` を 1 箇所に定義し、4 ルートで共有（後から 1 箇所で調整可能） | Issue (B) | 4 |
| AC-12 | admin 5 ルート ↔ 各設定フォームの 1:1 紐付けで `routerInvalidate()` 配線済みを確認のうえ (A) 群に含める。対応: `admin/design.tsx`↔`DesignTokensForm` / `admin/prompts.tsx`↔`PromptsForm` / `admin/llm.tsx`↔`LLMSettingsForm` / `admin/users.tsx`↔`UsersTable` / `admin/registration.tsx`↔`RegistrationForm`（各 mutation 成功後に `routerInvalidate(router)` を呼ぶこと） | Issue (A) 末尾「実装時に確認」 | 2（事前確認は調査済み） |

## スコープ

### 含まれないもの

- **⛔ 据え置きルート**（変更しない・正当な理由あり）:
  - `app/routes/_app/notes/new.tsx` / `app/routes/_app/notes/$noteId/edit.tsx` — editor loader は `routerInvalidate` 除外リスト対象（ADR #669-003）。editLock の鮮度検証も必要。
  - `app/routes/admin/index.tsx`（ダッシュボード）/ `app/routes/admin/jobs.tsx`（ジョブ監視）/ `app/routes/admin/metrics.tsx`（メトリクス） — ナビゲーション時に最新を見たいライブ要件。
  - `app/routes/_app/exports/$jobId.tsx`（エクスポート進捗）/ `app/routes/_app/exports/index.tsx`（ジョブキュー一覧） — 非同期ジョブ状態のライブ要件。
- **初回フルロード（F5・直リンク）時のスケルトン** — キャッシュが無いため per-section の Suspense が streaming で一瞬出る可能性が残る。これは `staleTime` 起因ではなく RSC streaming / hydration 時の再 suspense という別問題。本変更を当てて消えるか確認し、残る場合は別 Issue 化（本 Issue のスコープ外、テスト方針で確認のみ）。**(B) 公開ルートで `gcTime`（60s）超に再訪したとき**もキャッシュ破棄済みで loader が fresh 実行されるため同じ経路を通り、この per-section Suspense が一瞬出る可能性がある。これは「初回フルロード相当の別問題（RSC streaming/hydration 起因、本変更のスコープ外）」であり、ADR-001/002 で解消した「背景再検証による再 suspend」のフラッシュとは区別する。AC-2/AC-6 の判定では両者を混同しないこと。
- **フォーカス時の再取得** — 現状未実装。本 Issue はむしろ自動再取得を止める方針なので対象外。
- **`routerInvalidate()` 配線・除外ルール（ADR #299-003 / #669-003）への変更** — 影響しない。既存配線はそのまま。

### フォーム系 3 ルート（🔶 要検討）の対応方針

`app/routes/_app/export/index.tsx` / `app/routes/_app/notes/$noteId/export.tsx` / `app/routes/_app/upload/index.tsx` の 3 ルートは loader がフォーム seed のみを返し、page 内 state が source of truth。`Infinity` 化しても安全。

**推奨: 本 Issue で (A) 群と同時対応して含める。**

- これらはすべて `_app` 配下の認証済みルートで、(A) 群と同じ `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` パターンを当てるだけ（差分は 1 行ずつ・テストも (A) と同型）。分割して別 Issue 化するメリットが小さい。
- フォーム seed は profile/tags 等の比較的安定したデータで、mutation 後は既存の `routerInvalidate()` で更新される（upload は `routerInvalidate` 配線済みコンポーネントから ingest される）。再訪フラッシュを止める価値は他のルートと同じ。
- ただし editor 系（new/edit）とは異なり `routerInvalidate` 除外リストには入れない（フォーム seed の鮮度はリダイレクト経路ではなく通常の invalidate で十分）。

## 調査結果

### 関連ファイル

- 対象ルート（22 ファイル）: 後述「対象ルートの仕分け」を参照。すべて `createFileRoute(...)({ staleTime: ... })` の 1 行設定。
- 既存の慣用パターン（参照元）:
  - `app/routes/_app/route.tsx:82` — `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY`（AppShell layout、#487 / #293 の到達点）。
  - `app/routes/_app/settings/profile.tsx:26` ほか settings 系（prompts/security/account-delete）— 同じパターンを採用済み。
- `app/components/common/routerInvalidate.ts` — `routerInvalidate()`（`_app`・editor 除外）/ `appShellInvalidate()`（`_app` 専用）の集約モジュール。30+ 箇所で配線済み。
- 既存の小規模 framework-free public モジュールの置き場所: `app/components/public/searchPeriod.ts` / `publicDateRange.ts` / `schema.ts`（`export const` 定数を持つ）。`PUBLIC_ROUTE_GC_TIME` 定数の置き場所として同ディレクトリが適切。

### あるべきアーキテクチャ

- 本変更はプレゼンテーション層（TanStack Router のルート設定）のみに閉じる。ドメイン・アプリケーション・アダプターには一切触れない。
- 鮮度管理の方針は「勝手な再取得をやめ、明示的な `routerInvalidate()` のときだけ更新する」。これは既存の `_app`／settings 系で確立済みの慣用パターンに leaf を揃えるリファクタ。
- 定数は CLAUDE.md「Repeated utility strings / 定数は 1 箇所に hoist」の方針に従い、public ルート群で共有する `PUBLIC_ROUTE_GC_TIME` を 1 モジュールに定義。

### 既存実装の状態（Issue 記載の現状値と実コードの検証）

全 22 ルートの現状 `staleTime` を実コードで確認した。**Issue 本文の記載とすべて一致**（乖離なし）:

| ルート | Issue 記載の現状 | 実コード | 一致 |
|---|---|---|---|
| `_app/index.tsx`〜admin 各種（A 群 12 本） | `staleTime: 0` | `staleTime: 0` | ✓ |
| `search.tsx` | `staleTime: 0` | `staleTime: 0`（行 61） | ✓ |
| `u/$username/index.tsx` | `staleTime: 0` | `staleTime: 0`（行 110） | ✓ |
| `u/$username/$noteSlug.tsx` | `staleTime: 10_000` | `staleTime: 10_000`（行 55） | ✓ |
| `notes/public/$noteId.tsx` | `staleTime: 10_000` | `staleTime: 10_000`（行 49） | ✓ |
| `about/terms/privacy.tsx` | `staleTime: 60_000` | `staleTime: 60_000` | ✓ |
| `export/index.tsx`・`notes/$noteId/export.tsx`・`upload/index.tsx`（🔶） | `staleTime: 0` | `staleTime: 0` | ✓ |

- 現状どのルートにも `gcTime` の明示設定は無い（ライブラリデフォルト）。(B) 群のみ `gcTime: PUBLIC_ROUTE_GC_TIME` を追加する。
- admin 設定系 mutation の `routerInvalidate()` 配線をスポットチェック済み:
  - `app/components/admin/DesignTokensForm/index.tsx`（design）/ `RegistrationForm`（registration）/ `LLMSettingsForm`（llm）/ `UsersTable`（users）/ `PromptsForm`（prompts）すべて `routerInvalidate(router)` を mutation 成功後に呼んでいる。→ (A) 群への組み入れは安全（AC-12 充足）。
- ホーム `_app/index.tsx` の SavedView リダイレクトは loader handler 内（`shouldRedirectForSavedView` → `throw redirect`）で発火する。`Infinity` 化しても初回キャッシュミス時には必ず handler が走るため従来どおり動作する（AC-5）。`display` は loaderDeps から除外済み（#219）で `staleTime` と直交。

### 依存関係

- `_app` 親ルートは既に `staleTime: Infinity`。leaf を Infinity 化しても親子で矛盾せず、SPA 遷移は 0 RPC のまま（#293 ADR-008 の前提を崩さない）。
- (B) 群の 4 ルートは新規 `PUBLIC_ROUTE_GC_TIME` 定数に依存する。

## 設計

### ドメインモデルへの影響

なし。本変更はプレゼンテーション層（ルート設定）のみ。

### ユースケース / アプリケーションロジック

なし。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

ルート設定（`createFileRoute(...)` のオプション）のみを変更する。3 階層の方針:

- **(A) 認証済みコンテンツ系** → `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY`（`gcTime` 据え置き）。
- **(B) 公開コンテンツ系** → 同 `staleTime` ＋ `gcTime: PUBLIC_ROUTE_GC_TIME`（= 60_000）。
- **(C) 静的（legal）** → 同 `staleTime`（`gcTime` 据え置き）。

`PUBLIC_ROUTE_GC_TIME` は新規モジュール `app/components/public/routeCache.ts` に定義し、(B) 群 4 ルートで import 共有する。

## 実装ステップ

依存方向（定数 → ルート設定 → ドキュメント）の順に並べる。

### 1. ADR を作成（設計判断の記録）

- **対象ファイル:** `.issue/683/adr.md`（本計画と同時に作成済み）
- **変更内容:** ADR-001（#293 由来の de-facto「leaf staleTime:0」を明文化のうえ撤回・supersede 宣言。#293 には当該単独 Decision が実在しない旨も明記）／ADR-002（公開ルートの `Infinity`＋`gcTime` 方針、有限 `staleTime` を採らない理由）／ADR-003（フォーム系 3 ルートの組み入れ判断）を記録。
- **理由:** AC-9。`.issue/{N}/adr.md` がプロジェクトの ADR 記録慣習（#293/#487/#669 すべてこの形式）。本 Issue は `.issue/683/adr.md` に新規作成し、`Status` は実装着手時に `Proposed → Accepted` へ更新する。**`.issue/293/adr.md` 本体は書き換えず**、`.issue/683/adr.md` 側に「#293 の当該決定を supersede する」と明記する（ADR は追記・supersede 方式で、過去 ADR を破壊的に編集しない慣習）。

### 2. (A) 認証済みコンテンツ系 — `staleTime` のみ変更（12 + フォーム系 3 ルート）

- **対象ファイル:**
  - `app/routes/_app/index.tsx`（ホーム ★最優先）
  - `app/routes/_app/notes/$noteId/index.tsx`
  - `app/routes/_app/notes/$noteId/history/index.tsx`
  - `app/routes/_app/notes/$noteId/history/$revisionId.tsx`
  - `app/routes/_app/tags/index.tsx`
  - `app/routes/_app/trash/index.tsx`
  - `app/routes/_app/views/index.tsx`
  - `app/routes/admin/design.tsx` / `prompts.tsx` / `llm.tsx` / `users.tsx` / `registration.tsx`
  - （フォーム系 3 ルート: `app/routes/_app/export/index.tsx` / `app/routes/_app/notes/$noteId/export.tsx` / `app/routes/_app/upload/index.tsx`）
- **変更内容:** 各ファイルの `staleTime: 0` を `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` に置換。`$revisionId.tsx` はネスト位置（`createRoute` ラッパー内）の差異に注意してそのキーのみ置換。
- **理由:** AC-1 / AC-4 / AC-5 / AC-8 / AC-12。既存 `_app`・settings 系と同一パターンに揃える。mutation 後の鮮度は `routerInvalidate()` で担保済み。

### 3. (B) 公開コンテンツ系 — `staleTime: Infinity` ＋ `gcTime`

- **対象ファイル:** `app/routes/search.tsx` / `app/routes/u/$username/index.tsx` / `app/routes/u/$username/$noteSlug.tsx` / `app/routes/notes/public/$noteId.tsx`
- **変更内容:** `staleTime`（`0` または `10_000`）を `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` に置換し、同オブジェクトに `gcTime: PUBLIC_ROUTE_GC_TIME` を追加。`@/components/public/routeCache` から `PUBLIC_ROUTE_GC_TIME` を import。
- **理由:** AC-2 / AC-6 / AC-8。匿名閲覧者に invalidate 経路が無いため `gcTime` で陳腐化を bound。有限 `staleTime` は再訪時に背景再検証 → RSC 再 suspend を招くため採らない。

### 4. `PUBLIC_ROUTE_GC_TIME` 定数モジュールの新規作成

- **対象ファイル:** `app/components/public/routeCache.ts`（新規）
- **変更内容:** `export const PUBLIC_ROUTE_GC_TIME = 60_000;` を framework-free モジュールとして定義。WHY コメント（公開ルートは匿名閲覧者に invalidate 経路が無いため `gcTime` で陳腐化を bound する旨、4 ルートで共有し 1 箇所で調整可能な旨）を付す。
- **理由:** AC-11。`app/components/public/searchPeriod.ts` 等と同じ「focused framework-free public モジュール」の慣習に揃える。ステップ 3 より前に存在している必要があるため、実装順としては 3 と一体で行う（依存上は本ステップが先）。

### 5. (C) 静的（legal）ルート — `Infinity`

- **対象ファイル:** `app/routes/about.tsx` / `app/routes/terms.tsx` / `app/routes/privacy.tsx`
- **変更内容:** `staleTime: 60_000` を `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` に置換（`gcTime` は追加しない）。
- **理由:** AC-3 / AC-8。コンテンツ（`?raw` import）も config 置換値もデプロイ単位で固定で runtime では変わらないため、再検証も `gcTime` bound も不要。

### 6. 配線の不変条件チェック（コード変更なし・確認のみ）

- **対象ファイル:** `app/components/common/routerInvalidate.ts`、各 mutation コンポーネント
- **変更内容:** 変更なし。(A)/(B)/(C) いずれも `routerInvalidate` の除外リスト（editor のみ）に影響しないこと、admin 系 mutation が `routerInvalidate` 配線済みであること（調査済み）を実装時に再確認。
- **理由:** AC-4 / AC-7。除外ルール（#299-003 / #669-003）を壊さない。

### 7. ADR の Status 更新

- **対象ファイル:** `.issue/683/adr.md`
- **変更内容:** 実装完了後、各 ADR の `Status` を `Proposed` → `Accepted` に更新。
- **理由:** AC-9。

### 8. 品質ゲート

- **対象ファイル:** —
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し通す。
- **理由:** AC-10。

## 対象ルートの仕分け（実装チェックリスト）

### (A) 認証済みコンテンツ系 — `staleTime` のみ変更（gcTime 据え置き）

- [ ] `app/routes/_app/index.tsx`（ホーム ★最優先 / SavedView リダイレクト動作確認）
- [ ] `app/routes/_app/notes/$noteId/index.tsx`
- [ ] `app/routes/_app/notes/$noteId/history/index.tsx`
- [ ] `app/routes/_app/notes/$noteId/history/$revisionId.tsx`
- [ ] `app/routes/_app/tags/index.tsx`
- [ ] `app/routes/_app/trash/index.tsx`
- [ ] `app/routes/_app/views/index.tsx`
- [ ] `app/routes/admin/design.tsx`
- [ ] `app/routes/admin/prompts.tsx`
- [ ] `app/routes/admin/llm.tsx`
- [ ] `app/routes/admin/users.tsx`
- [ ] `app/routes/admin/registration.tsx`
- [ ] `app/routes/_app/export/index.tsx`（🔶 → 含める）
- [ ] `app/routes/_app/notes/$noteId/export.tsx`（🔶 → 含める）
- [ ] `app/routes/_app/upload/index.tsx`（🔶 → 含める）

### (B) 公開コンテンツ系 — `staleTime: Infinity` ＋ `gcTime: PUBLIC_ROUTE_GC_TIME`

- [ ] `app/routes/search.tsx`
- [ ] `app/routes/u/$username/index.tsx`
- [ ] `app/routes/u/$username/$noteSlug.tsx`
- [ ] `app/routes/notes/public/$noteId.tsx`
- [ ] `app/components/public/routeCache.ts`（新規・`PUBLIC_ROUTE_GC_TIME = 60_000`）

### (C) 静的（legal）ルート — `Infinity`（gcTime 据え置き）

- [ ] `app/routes/about.tsx`
- [ ] `app/routes/terms.tsx`
- [ ] `app/routes/privacy.tsx`

## 設計判断

詳細は `.issue/683/adr.md` を参照。

- **ADR-001:** #293 由来の de-facto「leaf route は `staleTime: 0`」（#293 に単独明示 Decision は実在せず複数 ADR にまたがる既定値）を本 ADR で明文化のうえ撤回（supersede 宣言）。理由＝暗黙の背景再検証が RSC ペイロード再 suspend を起こしスケルトンフラッシュになる。鮮度は明示 `routerInvalidate()` で担保。
- **ADR-002:** 公開ルートは `staleTime: Infinity` ＋ 短い `gcTime`（60s）を選択。有限 `staleTime` は再訪時にフラッシュを先送りするだけなので採らない。`PUBLIC_ROUTE_GC_TIME` は 1 箇所に定義して共有。
- **ADR-003:** フォーム系 3 ルートを (A) 群に含める判断（差分が小さく分割の価値が低い）。

## リスクと注意点

- 失う挙動: mutation を経由しない再訪（戻る・直リンク・別タブ更新・バックグラウンドジョブ）でも自動最新化する挙動。これは本 Issue で意図的に止めたい挙動そのもの。公開ルートは `gcTime`（60s）超で最新化される。
- (A) 群の admin ルートは mutation が `routerInvalidate()` 配線済みであることが前提。スポットチェック済みだが、今後 admin に「`routerInvalidate` を呼ばない」mutation を追加すると stale 表示になりうる（既存の慣習を守る限り問題なし）。
- ライブ要件ルート（ダッシュボード・メトリクス・ジョブ進捗・エクスポート進捗・editor）は ⛔ 据え置き。誤って Infinity 化するとライブ性が壊れる。チェックリスト外のルートに手を出さない。
- DEV では `0` のまま（HMR の鮮度維持）。本番挙動（フラッシュ解消）は本番ビルド相当（`import.meta.env.DEV=false`）でしか確認できない点に注意。
- 初回フルロード（F5・直リンク）のスケルトンは別問題で本変更では消えない可能性。残れば別 Issue 化（スコープ外）。

## テスト方針

- 既存ルートテスト（`homeLoaderDeps` 等）が壊れないこと。`staleTime` はルートオプションのリテラル変更のみなので、loader ロジックのテストは影響を受けない想定。
- ルート設定の単体検証（必要なら）: 対象ルートの `staleTime` が `import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` であること、(B) 群が `gcTime === PUBLIC_ROUTE_GC_TIME` を持つことのアサート。既存テストの粒度に合わせ、過剰なテストは追加しない。
- ホーム SavedView リダイレクト（`shouldRedirectForSavedView`）の既存テストが引き続き green（AC-5）。
- 手動/ブラウザ確認（本番ビルド相当）:
  - (A) ホーム → ノート詳細 → 戻る、で再訪時にスケルトンフラッシュが出ないこと（AC-1）。
  - mutation（編集・削除・タグ操作）後に即時最新化されること（AC-4）。
  - (B) 公開ルート再訪（gcTime 内）でフラッシュ（背景再検証による再 suspend）なし、60s 超でサーバー側更新が反映されること（AC-2 / AC-6）。※60s 超の再訪で出る per-section Suspense は初回フルロード相当の別問題（RSC streaming/hydration 起因、スコープ外）であり、AC-2/AC-6 の合否判定で「背景再検証由来のフラッシュ」と混同しないこと。
  - ライブ要件ルートが従来どおり最新取得すること（AC-7）。
  - 初回フルロード時のスケルトン残存有無を観察し、残れば別 Issue 化（スコープ外）。
- `pnpm typecheck && pnpm lint:fix && pnpm format`（AC-10）。

## レビュー履歴

- 1周目: 両視点とも問題点ゼロ。改善提案 coverage[S-003]/arch-risk[S-001]/arch-risk[S-003] を反映、他は見送り。問題点ゼロのためレビューループ終了。
