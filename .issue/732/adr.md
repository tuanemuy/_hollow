# ADR — Issue #732: セッション失効の leaf 観測時の未認証 UI 1 フレームちらつき

## ADR-001: ゼロフレーム化の方式として「レンダリングガード方式」を採用する

### Status
Proposed

### Context
`useAuthGuardEffect` は不整合（`shellUserDto !== null && leafAuthenticated === false`）を観測すると `appShellInvalidate(router)` を `useEffect` で fire-and-forget する。一方 `HomeRoute`（`_app/index.tsx`）は `data.authenticated === false` のとき無条件に `<LandingPage />` を描画するため、invalidate が解決して AppShell が再評価されるまでの最大 1 フレーム、未認証 UI が露出する。このトレードオフは `.issue/300/adr.md` ADR-001 で受容済みだが、本 Issue はゼロフレーム化（または明示的再受容）を求める。

不変条件（壊してはならない）:
1. `_app.loader`（`staleTime: Infinity`）の「初回 1 RPC、以降 0 RPC」（#293）
2. fresh 未認証訪問者（cached null × observed false）で誤発火・誤抑制しない（#300 ADR-001 c2 不整合検出条件）
3. hook 発火点は `_app/index.tsx` 1 箇所（#300 ADR-002）

選択肢:

- **(A) レンダリングガード方式**: hook が観測する「不整合中（= invalidate 発火済み・AppShell 再評価待ち）」状態を `HomeRoute` のレンダリング分岐へ伝え、その間は `LandingPage` ではなく中立プレースホルダ（**`null` を返す**）を描画する。invalidate 解決後に AppShell が `userDto: null` で再評価され、leaf 再描画で `LandingPage` に収束する。中立プレースホルダは `null` に確定する（後述 Consequences）。
- **(B) leaf 観測時に `/` へ明示 navigate**: 失効を観測する leaf は `_app/index.tsx`（= `/`）なので、不整合時ユーザーは既に `/` に居る。`/` へ navigate しても同一ルートで AppShell loader は `staleTime: Infinity` のため再評価されず、ちらつきは消えない。`clearAppShellCache` も navigate を伴わないため目的を達成できない（Issue 本文・#728 ADR-002 の指摘どおり）。「navigate を伴う auth 遷移なら別ルートへ抜けて leaf を破棄するため破棄のみで足りる」が、本件は別ルートへ抜けない経路であり構造が異なる。
- **(C) redirect ベースへの再設計**: #300 の client hook 方式（leaf に留まり redirect は defensive に任せる）を捨て、leaf server fn / loader 側で失効を検出して redirect する設計に寄せる。ゼロフレームに近づくが、#300 ADR-001 で「server fn から router.invalidate は呼べない」「middleware は `staleTime: Infinity` を崩す」として退けた構造に踏み戻る。`staleTime: Infinity` の前提（不変条件 1）と衝突しやすく、影響範囲が広い。優先度: 低の本 Issue に対しコスト過大。
- **(D) 現状維持 + 明示的再受容**: #300 ADR-001 のトレードオフを再確認し、発生条件が限定的（cookie 手動削除等）・機密は leaf 側 fail-closed で担保される点を根拠に「受容」を再宣言して clo する。改善コストはゼロだが UX 改善は得られない。

### Decision
**(A) レンダリングガード方式を採用する。**

ちらつきの実体は「不整合が成立している 1 フレームに `HomeRoute` が `LandingPage` を描いてしまう」レンダリング判断であり、hook は既にその不整合を検出している。同じ判定を描画分岐に渡すだけでゼロフレーム化できる。

- (B) は本件の構造（同一ルート `/` に留まり AppShell だけ再評価）では原理的に効かない。
- (C) は #300 で意図的に退けた構造への逆戻りで、不変条件 1 と衝突しやすく、優先度: 低の Issue に対しコスト過大。
- (D) は最小コストだが UX 改善が無い。(A) は #300 client hook 方式を温存したまま過渡 UI を未認証 UI から中立に差し替えるだけで、不変条件 1/2/3 をいずれも壊さずゼロフレーム化できるため、(D) より優れる。

実装は #300 の client hook 方式・発火点規約・不整合検出条件をすべて維持し、`HomeRoute` の `!data.authenticated` 分岐に「不整合中フラグ」を加味するのみ。`appShellInvalidate` / `clearAppShellCache` / `routerInvalidate` の意味分担（`routerInvalidate.ts` SSOT）には一切手を入れない。

### Consequences
- 良い点:
  - 不整合観測時の未認証 UI 1 フレーム露出が消える（ゼロフレーム化、AC-1）。
  - #300 client hook 方式・発火点規約（ADR-002）・不整合検出条件（ADR-001 c2）をそのまま温存し、`staleTime: Infinity` の RPC 構造（不変条件 1）に触れない。invalidate の発火条件・回数は等価。
  - 変更が `useAuthGuardEffect.ts` と `HomeRoute`（唯一の呼び出し元）の 2 箇所に局所化される。`routerInvalidate.ts` の 3 API・他フォームに波及しない。
- トレードオフ:
  - fresh 未認証訪問者を誤抑制しないため、ガード条件を hook の発火条件と完全一致させる必要がある（SSOT を hook に置くことで構造的に担保 — ADR-002）。
  - 不整合中は中立プレースホルダ（`null`）が一瞬出るが、未認証 UI ではないので情報露出は無い。**中立プレースホルダは `null` に確定する**: 過渡フレームは `AppLayout` が `userDto === null` で `<Outlet />` のみを返す＝AppShell（frame chrome）が未マウントの状態であり、`<div aria-hidden />` 等を置いてもレイアウトを占有する明示寸法が無い限りレイアウトシフト抑制効果が無い。よって `aria-hidden` div はデッドコードであり `null` が最小かつ正しい。背景が一瞬見える程度は許容する。
  - 収束保証は「`appShellInvalidate` が `_app` のみ invalidate し leaf loader（`renderHome`）を再走させない → 再評価後 `shellUserDto=null × data.authenticated=false`（fresh 未認証と同形）に落ちる → フラグ `false` → `LandingPage`」という依存連鎖による（plan「設計 > 収束経路」参照）。ガード条件が hook と SSOT 一致である限り構造的に保証される。
  - fire-and-forget の完了タイミングは引き続き保証しない。ただし invalidate 解決後の AppShell 再評価で必ず正規 UI（未認証なら `LandingPage`）へ収束する（cookie が無い限り `userDto: null`）。

### 撤退条件（(D) 現状トレードオフ再受容へのフォールバック）
本 Issue は優先度: 低であり、Issue 本文は「ゼロフレーム化 **または** 明示的再受容」の二択を許容している。実装段階で次のいずれかが判明した場合は、(A) を断念し **(D) 現状維持 + 明示的再受容**（#300 ADR-001 のトレードオフ受容に戻して close）へ退避してよい:
- レンダリングガードを入れても上記収束連鎖で `LandingPage` に収束しない（収束保証が崩れる）ことが判明した場合。
- 中立プレースホルダ（`null`）の過渡フレームが許容できないレイアウトシフト・ちらつきを生み、それを `null` 維持のまま解消できない場合。
退避時は #300 ADR-001 の受容根拠（発生条件が限定的・機密は leaf 側 fail-closed で担保）を再宣言し、本 ADR の Status を Rejected/Superseded に更新する。実装段階での判断を一貫させるための撤退基準である。

---

## ADR-002: `useAuthGuardEffect` のインターフェースを `void` → `boolean`（不整合中フラグ）に拡張する

### Status
Proposed

### Context
ADR-001 の方式には「不整合中かどうか」を `HomeRoute` のレンダリング分岐に伝える手段が要る。選択肢:

- **(a) hook は `void` のまま、`HomeRoute` 側で再度 `shellUserDto !== null && data.authenticated === false` を判定する**: hook と同じ不整合式が 2 箇所に重複する。式がズレると fresh 未認証の誤抑制（不変条件 2 の regression）を招く。
- **(b) hook が不整合中フラグ（`boolean`）を返し、`HomeRoute` はそれを使う**: 不整合判定の SSOT が hook 内部に一本化される。発火条件（`useEffect` 内）と戻り値が同じ定数から導出されるため、永久に整合する。
- **(c) 不整合状態を context / external store に載せて配る**: 配布対象が `HomeRoute` 1 箇所（発火点規約）のため過剰。#300 ADR-001 (d) global event bus を「本 Issue スコープでオーバーキル」とした判断と整合的に退ける。

### Decision
**(b) hook が `boolean`（不整合中フラグ）を返す形に拡張する。**

hook 内で `const isAuthMismatch = shellUserId !== null && leafAuthenticated === false;` を算出し、`useEffect` の発火条件をこの定数に置き換え（重複式を排除）、`return isAuthMismatch;` する。唯一の呼び出し元 `HomeRoute` は `!data.authenticated` 分岐でこのフラグを見て、`true` なら中立プレースホルダ、`false` なら `LandingPage` を描画する。

### Consequences
- 良い点:
  - 不整合判定の SSOT が hook に一本化され、`HomeRoute` 側に判定ロジックが二重化しない（不変条件 2 を構造的に守る）。
  - 最小インターフェース（`boolean` 1 値）で、発火点が 1 箇所のため波及が局所。
  - `useEffect` の発火条件も同じ定数を参照するため、戻り値とのズレが原理的に起きない。
- トレードオフ:
  - hook の戻り値契約が増えるため、将来 leaf を増やして hook を配布する際は戻り値でガードする責務が呼び出し側に生じる。JSDoc の発火点規約に「戻り値で未認証 UI をガードすること」を追記して周知する。
  - hook が「副作用 + 表示判定フラグ提供」の 2 役を持つが、両者は同一不整合式から導出される密結合な関心事であり、分離より同居のほうが整合性を保ちやすい。

### 実装メモ（依存配列を `isAuthMismatch` に置き換えなかった理由）
plan ステップ 1 / 本 ADR の文言は「`useEffect` の発火条件をこの定数（`isAuthMismatch`）に置き換える」とあるが、`useEffect` の**依存配列**まで `[isAuthMismatch, router]` に変えてしまうと、不整合→不整合のユーザー切替（u1→u2）で `isAuthMismatch` が `true` のまま据え置かれ、既存の「id 変化で再発火（invalidate 2 回）」契約（#300）を壊す。これは AC-4(a)（発火条件・依存配列の本変更前後での等価）にも反する。

そのため依存配列は従来どおり `[shellUserId, leafAuthenticated, router]` の生入力に保ち、`useEffect` 本体の発火条件も従来式 `shellUserId !== null && leafAuthenticated === false` のまま（= 変更前と byte 等価）とした。戻り値用の `isAuthMismatch` は同一式を hook トップで 1 回算出して `return` するのみで、SSOT（同一式から発火条件と戻り値が導出される）は保たれている。「定数に置き換え」は重複式の意味的 SSOT 化を指し、依存配列キーの変更までは含意しないと解釈した。

---
