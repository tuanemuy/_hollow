# ADR — Issue #475: _app の外に取り残された認証必須ルートに AppShell を付ける

## ADR-001: `/views`・`/exports` の認証ガードを leaf 個別 `beforeLoad` から `_app` loader へ委譲する

### Status
Accepted

### Context
移動前の `views/route.tsx`・`exports/route.tsx` は `beforeLoad: requireAuthenticatedRoute` で各自認証ガードを持っていた。`_app` 配下へ取り込むと、親 `_app/route.tsx` の `loadAppShell`（`getCurrentUser()` が null かつ landing path でなければ `/` へ redirect）が認証ゲートを担う。leaf 側の `beforeLoad` を残すと二重ガードになる。

### Decision
leaf 個別の `beforeLoad: requireAuthenticatedRoute` と該当 import を削除し、認証ガードを `_app` loader に一本化する。`_app` 配下の既存 leaf（`tags/index.tsx`・`trash/index.tsx`）が同方針（自前 auth `beforeLoad` を持たず `_app` に委譲）であり、それに揃える。

### Consequences
- 良い点: `_app` 配下の認証の流れが一箇所（`loadAppShell`）に集約され、leaf ごとにガードが割れない。
- **挙動変更（等価ではない）**: 未認証で `/views`・`/exports` を直アクセスした際の redirect 先が `requireAuthenticatedRoute` の `/login` から、`loadAppShell` の `/`（+ `HOME_SEARCH`）へ**変わる**。これは `_app` 配下の確立挙動（#293 ADR-006: `_app` 配下は未認証時 `/` へ redirect）への統一であり、意図的な変更。一貫性はむしろ増す。
- トレードオフ: RSC Page 側の `requireCurrentUser()`（`SavedViewsList/Page`・`ExportJobsList/Page`・`ExportJobDetail/Page` で確認済み）が防御層として残るため、`beforeLoad` 削除でも fail-closed は維持される。

---

## ADR-002: server-fn action の side-effect import を移動先ファイルに残す（`_app/route.tsx` へ集約しない）

### Status
Accepted

### Context
`_app/route.tsx` は認証ページから到達可能な action モジュールを side-effect import で集約登録している（`view/actions` 等）。移動に伴い views/exports の action import を `_app/route.tsx` へ集約する案もあった。しかし調査の結果、`_app/route.tsx` が登録済みの `@/components/view/actions` は `createSavedViewFn` のみで、`views/route.tsx` が登録している `@/components/view/SavedViewsList/action`（`deleteSavedViewFn` / `setDefaultSavedViewFn` / `renameSavedViewFn` / `updateSavedViewFn` / `duplicateSavedViewFn` / `repairSavedViewFn` の 6 mutation）とは**別モジュール・別関数**であることが判明した。

### Decision
action の side-effect import を移動先ファイル（`_app/views/route.tsx`・`_app/exports/route.tsx`・`_app/exports/$jobId.tsx`）にそのまま残し、`_app/route.tsx` への集約は行わない。

### Consequences
- 良い点: 移動による RSC マニフェスト登録漏れリスクをゼロにできる。`$jobId.tsx` が leaf レベルで side-effect import している現状が機能している実績とも整合する。
- トレードオフ: action import の登録箇所が `_app/route.tsx` に完全集約されず分散したままだが、これは本 Issue（shell 取り込み）のスコープ外。集約の是非は別途整理する余地がある。
