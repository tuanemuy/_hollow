# ADR — Issue #502: _app の外に残るその他の認証必須ルートに AppShell が付かない

## ADR-001: 公開 `notes/` ツリーは据え置き、export leaf のみ抜き出す

### Status
Accepted

### Context
`/notes/$noteId/export` は公開用 `app/routes/notes/` 配下にあり、公開ノートビュー `notes/public/$noteId.tsx` と混在している。Issue 注意点A で「公開ノートツリーと認証必須ページの混在をどう整理するか検討が必要。単純な git mv で済まない可能性」が指摘された。選択肢: (a) export leaf のみ `_app` へ抜き出す / (b) `notes/` ツリー全体を再編する。

### Decision
(a) を選ぶ。`notes/public/$noteId.tsx` は認証不要・`beforeLoad` なし・独自 `notFoundComponent`/`errorComponent`/JSON-LD を持つ別系統であり、AppShell（認証ページ用）を付けるのは誤り。export leaf のみ `_app/notes/$noteId/export.tsx` へ移すことで、`notes/` ツリーは公開ビュー専用に純化され混在が解消される。`notes/public` への `route.tsx` 新設等のスコープ外な構造変更はしない。

### Consequences
- 良い点: 公開ツリーと認証ツリーの責務が分離。URL 不変。スコープ最小。
- トレードオフ: `notes/$noteId/` ディレクトリが空になり残骸として残るため削除が必要。

---

## ADR-002: 防御的 `getCurrentUser` チェックは追加しない

### Status
Accepted

### Context
`_app/notes/{edit,new}.tsx` は loader handler 内で `getCurrentUser()` を呼んでユーザーを得る必要があるため、ついでに1行の防御 redirect（`_app` ゲートの fail-safe）を持つ。移動する2つの export leaf に同様の防御チェックを足すべきか。

### Decision
追加しない。両 export leaf は `getCurrentUser` を呼ばず `ExportFormPage` に `noteId`（または `null`）を渡すだけで、認証は `_app` の `loadAppShell` に一元化される。#475 で移動した `_app/exports/index.tsx` も `getCurrentUser` を呼ばない leaf には防御チェックを足していない。前例に揃え、呼んでいない文脈に新規の防御コードを持ち込まない。

### Consequences
- 良い点: #475 の前例と一貫。余計なコード追加なし。
- トレードオフ: 認証ゲートは `_app` 単一点に依存（プロジェクト方針通り）。

---

## ADR-003: `ExportForm/action` の side-effect import は各 leaf に残す

### Status
Accepted

### Context
server-fn action の RSC マニフェスト登録は、到達しうるルートファイルからの side-effect import で担保される。#475 では `ExportForm/action` を `_app/exports/route.tsx` に置いた。本Issueの2 leaf をどこで import するか。

### Decision
各 leaf に既存の `import "@/components/export/ExportForm/action";` をそのまま残す。`_app/export/` も `_app/notes/$noteId/` も共通の `route.tsx` を持たず、`_app/route.tsx` への集約は他ページの import 構成を変える副作用がある。同一モジュールの再 import は冪等なので各 leaf に残せば登録は確実に維持される。

### Consequences
- 良い点: 登録が確実。`_app/route.tsx` への副作用なし。スコープ最小。
- トレードオフ: import が2箇所に分散するが、それぞれのページが当該 action の到達点であり妥当。
