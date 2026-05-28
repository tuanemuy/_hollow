# ADR — Issue #299: router.invalidate() のフィルタ化で AppShell 持続化を強化する

## ADR-001: ラッパー関数の配置と命名

### Status
Proposed

### Context
Issue #293 のレビュー B-P-001 / ADR-010 で「`router.invalidate({ filter: r => r.routeId !== "/_app" })` の薄いラッパーを `app/components/common/` に追加」する方針が合意済み。具体的なファイルパス・関数名・引数シグネチャを本 Issue で確定する必要がある。

選択肢:
- (a) `app/components/common/routerInvalidate.ts`（独立ファイル）
- (b) `app/components/common/styles.ts` に同居
- (c) `app/lib/router.ts` に置く
- (d) Hook 化: `useRouterInvalidate()`

### Decision
**(a) `app/components/common/routerInvalidate.ts`** を採用。関数名は `routerInvalidate(router, filter?)`、定数 `APP_SHELL_ROUTE_ID = "/_app"` をエクスポート。

### Consequences
- **良い点:**
  - `styles.ts` は className 定数専用の責務に集中（混在を避ける）
  - `app/components/common/` の薄い pure util の既存パターン（`Icon.tsx`, `Dialog.tsx` 等）と整合
  - `app/lib/` は「全レイヤーが依存する構造プリミティブ」のためフロントエンド固有の helper を入れるのは不適切（CLAUDE.md「`app/lib/` は層に属さない」）
  - 関数形式は call site が `await routerInvalidate(router)` の 1 行で済み Hook より軽い
- **トレードオフ:**
  - 引数で `router` を毎回渡すボイラープレート（Hook なら自動）が増えるが、既存の `router.invalidate()` 呼び出しと変更コストが等価なので許容

---

## ADR-002: `_app` 除外フィルタの実装方法と型シグネチャ

### Status
Proposed

### Context
TanStack Router の `router.invalidate({ filter })` は `(match: MakeRouteMatchUnion<TRouter>) => boolean` を取る。`_app` layout だけを除外する判定方法と、ラッパー関数のパラメータ型を決める。

選択肢（フィルタ実装）:
- (a) `match.routeId !== "/_app"` の厳密一致
- (b) `match.routeId.startsWith("/_app")` の prefix 一致
- (c) `match.fullPath` ベースの判定

選択肢（filter パラメータ型）:
- (i) `(match: AnyRouteMatch) => boolean` で受ける
- (ii) `Parameters<AnyRouter["invalidate"]>[0]["filter"]` から導出

### Decision
- **フィルタ実装**: **(a) 厳密一致 `match.routeId !== "/_app"`** を採用。定数 `APP_SHELL_ROUTE_ID = "/_app"` で magic string を回避
- **filter パラメータ型**: **(ii)** `NonNullable<Parameters<AnyRouter["invalidate"]>[0]>["filter"]` から導出する `InvalidateFilter` 型を使う

### Consequences
- **良い点:**
  - `_app` 配下の leaf route（`/_app/notes/$noteId` 等）は **invalidate 対象に残る**。これは note 編集後に詳細ページ loader を再評価する必要があるため意図通り
  - TanStack Router の `routeId` は安定した識別子で fullPath より型安全
  - 型を `AnyRouter["invalidate"]` の引数から導出することで `MakeRouteMatchUnion<TRouter>` と `AnyRouteMatch` のミスマッチによる `tsgo` 型エラーを回避（`@typescript/native-preview` は素の tsc より contravariance を厳しく扱うため）
- **トレードオフ:**
  - leaf 側で `staleTime` を独自に設定している箇所（例: 検索結果ページ）の挙動を変えない。これは現状維持なのでリグレッションではない
  - `AnyRouter` 経由で型を導出するため `match.routeId` は registered route id の literal union ではなく `string` にフォールバックする。`APP_SHELL_ROUTE_ID` の値が将来 route tree のリネームで乖離しても型レベルで検知できない。runtime テスト（manual-test TC-001/002/003）と grep ベースの完全性チェックで担保する

---

## ADR-003: `_app` を invalidate すべき条件の定義と AppShell 影響 mutation の扱い

### Status
Proposed

### Context
ラッパー導入後、どんな mutation で生 `router.invalidate()` を使うべきかを明文化する必要がある。`_app.loader` は `loaderDeps` を持たず `staleTime: Infinity`（本番）なので、依存データが変わったときに **明示的に invalidate しない限り** `gcTime`（30 分）内は過去キャッシュが再利用される。

レビューで判明した認証状態遷移時のリスク:
- `/` ランディング（未認証）→ `/login` → ログイン → `/` 復帰のフローで、cached `_app` match に `userDto: null` が残ったまま再利用される可能性がある
- これは AccountDeleteForm と対をなす「auth 状態遷移」ケースで、本 Issue の初稿では「ログイン直後は `_app` 外なので無害」と判定したが、cached match の存在を見落としていた

書き方の選択肢:
- (a) 生 `router.invalidate()` のまま残す + WHY コメント
- (b) `routerInvalidate(router, () => true)` で明示
- (c) `routerInvalidate(router, { includeAppShell: true })` のオプション拡張

### Decision
**`_app` を invalidate すべき条件（3 ルール）** を定義する:
1. **rule 1**: 認証状態が変わる（未認証 ⇄ 認証）
2. **rule 2**: Sidebar の directory tree（id / name / parentId / children）を改変する
3. **rule 3**: Header の `user.displayName` を改変する

この 3 ルールのいずれかに該当する mutation は **(a) 生 `router.invalidate()` + WHY コメント** で書く。

該当箇所（13 件）:
- rule 1 (認証状態遷移): LoginForm, SignUpForm, AdminSignUpForm, VerifyEmail, EmailChangeConfirm, PasswordResetConfirmForm, AccountDeleteForm の 7 箇所
- rule 2 (directory tree): CreateDirectoryDialog, DeleteDirectoryDialog, RenameDirectoryDialog, MoveDirectoryDialog, DirectoryTree (インライン改名) の 5 箇所
- rule 3 (displayName): ProfileForm:40 (`updateProfile`) の 1 箇所

### Consequences
- **良い点:**
  - 3 ルールが明文化されることで、将来 `router.invalidate()` を新規追加するときの判断軸が明確になる
  - 「全マッチ invalidate」という素直な意味を読み手にそのまま渡せる
  - ラッパーの API 表面を最小に保つ（`includeAppShell` のような flag が増殖しない）
  - WHY コメント 1 行で「なぜここは生 invalidate か」が読み取れる
  - JSDoc にも 3 ルールを記載することで call site のコメントを短く保てる（rule N と参照可能）
- **トレードオフ:**
  - 一見すると「ラッパー導入漏れ」に見えるため、レビューでの誤検出リスクがある → コメント必須でカバー
  - 認証フォーム 6 箇所が「影響あり」側に増えた結果、生 invalidate 箇所が 7 → 13 になり、その分 WHY コメントが必要な箇所が増える

### Note (フォローアップ候補)
AccountDeleteForm は厳密には「`_app` を再評価したい」のではなく「`_app` のキャッシュを完全に捨てたい」ケース（削除後に navigate → `_app.loader` が誤再実行されるリスク）。`router.clearCache({ filter: m => m.routeId === "/_app" })` に置換するのがより意味的に正確だが、本 Issue のスコープ外として継続課題化する。

---

## ADR-004: tag 操作を AppShell 非影響に分類する根拠

### Status
Proposed

### Context
Issue 本文では「**AppShell に影響する mutation**（directory / tag 関連の追加・削除・改名）」と例示があり、tag 関連も AppShell 影響側として読める。

しかし実コードを確認すると `Sidebar.tsx` に表示されるタグセクションは「`/tags` への静的 Link」のみで、タグ一覧そのものは Sidebar に出ない（`loadDirectoryTree` の payload にも含まれない）。Issue 本文の例示は Sidebar の旧仕様（タグ一覧表示）を仮定した可能性があるが、現状の実コードベースでは tag 編集が AppShell を更新する必要はない。

### Decision
tag CRUD（`TagActions.tsx`, `CreateTagForm.tsx`, `MergeTagDialog.tsx` の計 4 箇所）を **AppShell 非影響** に分類し、`routerInvalidate(router)` 経由に置換する。

### Consequences
- **良い点:**
  - 実コードベースの事実に基づいた分類で過剰な invalidate を防ぐ
  - tag 編集後の Sidebar 再フェッチが不要になる
- **トレードオフ:**
  - 将来 Sidebar にタグ一覧セクションを追加する場合、この 4 箇所を「影響あり」へ戻す変更が必要。本 ADR を参照可能にしておくことで容易に追跡できる

---

## ADR-005: AccountDeleteForm の既存英語コメントを ADR-003 文言に置換

### Status
Proposed

### Context
`AccountDeleteForm/index.tsx:34` には実装前から英語の WHY コメント（`Account deleted — invalidate so caches drop the now-purged session data, then navigate to landing.`）が存在していた。本 Issue のステップ 3 では「直前に WHY コメントを追加」する方針だが、既存コメントとの併存・置換のいずれを取るかは plan.md で明示されていなかった。

### Decision
既存の英語コメントを ADR-003 で定めた日本語 WHY 文言 `// 過去訪問の cached _app match に残る旧 userDto を破棄するため _app も invalidate（rule 1）` に **置換** する。

### Consequences
- **良い点:**
  - rule 1 という共通 ID で他 6 箇所（auth 系）と意味的整合が取れる
  - 「過去訪問の cached _app match」という具体的な状況が読み手に伝わる
  - 言語が他 12 箇所と統一される
- **トレードオフ:**
  - 旧コメントの「navigate to landing」という遷移先情報は失われるが、直後の `router.navigate({ to: "/", search: HOME_SEARCH })` を読めば自明

---

## ADR-006: filter 引数を AND 合成にして `_app` 除外を不変条件化

### Status
Proposed（レビュー review-001 で追加）

### Context
初稿では `filter: filter ?? ((match) => match.routeId !== APP_SHELL_ROUTE_ID)` の形で「filter が渡されたら `_app` 除外をまるごと上書きする」API だった。レビュー W-002 で「ユーザーが filter を渡すと `_app` 除外がすり抜ける」と指摘された。

選択肢:
- (a) 現状維持 + JSDoc で「filter を渡すと `_app` 除外は失われる」と明記
- (b) filter を **追加フィルタ**として AND 合成: `match.routeId !== APP_SHELL_ROUTE_ID && (filter?.(match) ?? true)`
- (c) filter 引数を削除（YAGNI）

### Decision
**(b) AND 合成** を採用。

### Consequences
- **良い点:**
  - `_app` 除外がラッパー経由では絶対にすり抜けない不変条件として強化される
  - 将来「`_app` 除外 + 追加条件」という典型的なユースケース（例: 特定 leaf のみ更に絞り込む）に自然に対応できる
  - JSDoc に「常に除外」と明記でき、API のセマンティクスが直感的になる
- **トレードオフ:**
  - 呼び出し側が「`_app` も含めて invalidate したい」場合はラッパーを使えず生 `router.invalidate()` を使う必要があるが、それは ADR-003 で定義した 3 ルールに該当するケースなので意図と一致

---

## ADR-007: `APP_SHELL_ROUTE_ID` の export を外して module-local 化

### Status
Proposed（レビュー review-001 で追加）

### Context
初稿では `APP_SHELL_ROUTE_ID` を `export const` していた。レビュー W-004 で「`rg APP_SHELL_ROUTE_ID app/` で外部利用は 0 件、unused export は biome の lint で検出されない」と指摘された。

### Decision
`export` を外し、`routerInvalidate.ts` 内の module-local 定数にする。

### Consequences
- **良い点:**
  - YAGNI 原則に従い、未使用 export を残さない
  - 将来必要になったら `export` を戻すコストは 1 行で済む
- **トレードオフ:**
  - 他のラッパー（例: 将来追加するかもしれない `routerNavigate`）が同じ ID を参照したくなった場合、それぞれで定数定義が重複する可能性。出てきたタイミングで初めて共通化を検討する
