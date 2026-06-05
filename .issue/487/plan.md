# 実装計画 — Issue #487: 設定画面のナビゲーション挙動（/settings 直アクセスで空白・サブページ切り替えが遅い）

**Issue:** #487
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

設定画面（`/settings`）のナビゲーション体感品質を改善する。PR #490（#486 対応）で設定画面は `/_app/settings/*` 配下へ移行済みのため、本Issueの残スコープは次の2点に縮小している:

1. **問題1**: `/settings` 直アクセス時に本文が空白になる（インデックスルート欠落）
2. **問題2残り**: サブページ切り替えが毎回 loader 再実行で遅い（`staleTime: 0`）

> Issue コメント（2026-06-05 棚卸し）で確定したスコープ:
> - 問題2-原因2（遷移ごとの認証 RPC）→ PR #490 で `_app` loader 相乗りにより解消済み
> - 問題2-原因4（Link preload ヒント）→ `app/router.tsx` の `defaultPreload: "intent"` で元々有効、対応不要
> - 残るのは 問題1（index 欠落）と 問題2-原因1/3（サブページの `staleTime: 0`）

## スコープ

### 含まれるもの

- `app/routes/_app/settings/index.tsx` を新設し、`/settings` 直アクセスを `/settings/profile` へ `redirect` する
- サブページ4枚（`profile` / `security` / `prompts` / `account-delete`）の `staleTime: 0` を、`_app/route.tsx` と同じ `import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` パターンへ変更する
- ルートツリー再生成（`app/routeTree.gen.ts`）の反映

### 含まれないもの

- `loadInstancePromptDefaults()` 等のクエリ単位の個別キャッシュ追加（理由は ADR-002 参照: サブページ全体の `staleTime: Infinity` 化で RSC ごとキャッシュされるため、本Issueの体感改善目的では不要。クエリ単位キャッシュは別軸の最適化でありスコープ外）
- 設定以外のルート（`views` 等）の `staleTime` 見直し
- 認証 chrome 共有・preload（PR #490 / グローバル設定で対応済み）

## 実装ステップ

### 1. `/settings` インデックスルートを追加

- **対象ファイル:** `app/routes/_app/settings/index.tsx`（新規）
- **変更内容:** `beforeLoad` で `/settings/profile` へ `throw redirect` する純リダイレクトルートを作る。`component` は不要（`beforeLoad` が常に throw するため到達しない）。

  ```tsx
  import { createFileRoute, redirect } from "@tanstack/react-router";

  export const Route = createFileRoute("/_app/settings/")({
    beforeLoad: () => {
      throw redirect({ to: "/settings/profile" });
    },
  });
  ```

  ルートID `/_app/settings/` は `_app/tags/index.tsx`（`createFileRoute("/_app/tags/")`）と同じ index ルール。`head` は付けない（`beforeLoad` が常に throw redirect するため head に到達せず、親 `route.tsx` が `noIndex` を、リダイレクト先 `profile` も個別 head を持つため実害なし）。

- **理由:** `/settings` 直アクセス時、`route.tsx` のレイアウト（`<Outlet />`）に対応する子ルートが無いため本文が空になる。デフォルトセクション（プロフィール）へ寄せることで空白を解消する。実装は TanStack Router 標準の `beforeLoad` 無条件リダイレクト（`component` 無し）。※ リポジトリ内の既存 index（`_app/tags/index.tsx` 等）は loader 内の防御的 `throw redirect`（未認証フォールバック）でコンテンツも描画する通常ルートであり、純リダイレクトの先例ではない点に注意。

### 2. サブページの `staleTime` を本番キャッシュ化

- **対象ファイル:**
  - `app/routes/_app/settings/profile.tsx`
  - `app/routes/_app/settings/security.tsx`
  - `app/routes/_app/settings/prompts.tsx`
  - `app/routes/_app/settings/account-delete.tsx`
- **変更内容:** 各 `createFileRoute(...)({ staleTime: 0, ... })` を
  `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` に変更する。
- **理由:** 現状は遷移のたびに loader（RSC 描画 + DB クエリ）が再実行され、特に prompts は2クエリで重い。`_app/route.tsx` が採用する「DEV は 0（HMR 鮮度優先）／本番は Infinity」パターンに揃えることで、本番では初回ロード後のサブページ間 SPA 遷移がキャッシュヒットし即時化する。
- **データ鮮度の担保:** 設定フォーム（Profile/Security/Prompts）はいずれも mutation 成功後に `routerInvalidate(router)`（Profile は `router.invalidate()`）を呼ぶ。invalidate は `staleTime` に関係なく対象 leaf loader を再実行するため、`staleTime: Infinity` でも編集直後のデータは確実に更新される。詳細は ADR-001。

### 3. ルートツリー再生成

- **対象ファイル:** `app/routeTree.gen.ts`（自動生成・tracked）
- **変更内容:** TanStack Router の vite plugin が `pnpm dev` / `pnpm build` 起動時に新 index ルートを取り込んで再生成する。再生成後の差分をコミットに含める。
- **理由:** ルートツリーはファイルベースで自動生成されるが tracked ファイルなので、新規ルートファイルの追加分を反映する必要がある。

## 設計判断

- **ADR-001**: サブページの `staleTime: Infinity` 化は mutation 後の `routerInvalidate` に依存して鮮度を担保する（詳細は adr.md）
- **ADR-002**: `loadInstancePromptDefaults()` のクエリ単位キャッシュは追加せず、`staleTime` 化で代替する（詳細は adr.md）

## リスクと注意点

- **`staleTime: Infinity` と古いデータ:** mutation 経路が `routerInvalidate` を必ず呼ぶ前提が崩れると、編集後に古いフォーム値が表示される恐れがある。実装時に Profile/Security/Prompts の各 action 成功ハンドラが invalidate を呼んでいることを再確認する（調査時点で確認済み）。`account-delete` はアカウント削除→ログアウト遷移のため鮮度問題は発生しない。
- **DEV での挙動差:** `import.meta.env.DEV` 分岐により、開発時は `staleTime: 0` のまま。ブラウザ検証は本番ビルド挙動（キャッシュ）を直接は再現しないため、検証は「遷移で空白にならない・正しい内容が出る・編集が反映される」という機能面に絞る。体感速度の本番計測はスコープ外。
- **ルートツリー再生成漏れ:** index.tsx を追加しただけで `routeTree.gen.ts` を再生成しないとルートが効かない。dev サーバー起動 or build で再生成し、差分コミットを忘れない。
- **リダイレクト先のルート存在:** `/settings/profile` は既存ルート。`redirect({ to: "/settings/profile" })` の型安全性（生成済みルートID）を typecheck で担保する。

## テスト方針

- `pnpm typecheck && pnpm lint && pnpm format:check` で静的健全性を確認
- ブラウザ検証（manual-test）:
  - `/settings` 直アクセス → `/settings/profile` へリダイレクトし本文が表示される
  - サブナビ各項目をクリックして遷移、本文が空白にならず正しい内容が出る
  - プロフィール等を編集・保存後、再表示で最新値が反映される（invalidate 経路の確認）
- 既存ルート（`/settings/profile` 等の直アクセス）が引き続き動作することを確認

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点（要修正なし）**: 両レビュアーとも「問題点ゼロ」。鮮度担保（全 mutation 経路が invalidate を呼ぶ）を実コードで全件検証して成立を確認。

**取り込んだ改善提案**:
- S-001（両視点）: index redirect の先例引用が不正確（既存 index は loader 内の防御的 redirect で純リダイレクトの先例ではない）→ 実装ステップ1の記述を「TanStack Router 標準の beforeLoad 無条件リダイレクト」に修正し、既存 index との違いを明記。
- S-002/S-003: index ルートに `head` を付けない判断を実装ステップ1に明記。メール変更確定経路（`EmailChangeConfirm` の全 invalidate + `/login` 遷移）の安全性を ADR-001 に追記。
