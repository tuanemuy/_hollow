# Issue #471 対応計画 — /admin/users がローダーエラーで表示できない（#461 検証時に観測）

**Issue:** #471
**複雑度:** 小規模（回帰ガード追加のみ／プロダクトコードの修正なし）
**作成日:** 2026-07-03

---

## 結論

報告されたバグ（admin 認証済みで `/admin/users` が admin shell の errorComponent「アクセスできません」を表示する）は、**現在の main では再現しない**。Issue 起票（2026-06-04）後のリファクタで構造的に解消済み。

したがってプロダクトコードの修正は不要と判断し、対応は **再発防止のための回帰テスト追加** に絞る。

## 調査（再現検証）

`pnpm dev`（Cloudflare runtime, localhost:3000）＋ `pnpm seed:dev-admin` の環境で検証。

- **curl による確定的な SSR 検証**（cookie `__Host-session=dev-admin-session-token` 付き）で、`/admin` `/admin/users` `/admin/metrics` `/admin/registration` `/admin/jobs` `/admin/llm` `/admin/speech` `/admin/prompts` `/admin/design` の全 admin ルートが **HTTP 200 で正常描画**。`/admin/users` は「ユーザー管理」＋ユーザー一覧テーブルを描画する。
- cookie 無し → HTTP 500（`requireAdminUser` が `ForbiddenError` を投げ errorComponent へ。認証ゲートは正しく機能）。
- 注記: agent-browser の `open` では全 admin ルートが errorComponent 表示になったが、これは agent-browser が `__Host-session`（Secure cookie）をトップレベル document ナビに付与しない harness アーティファクトであり（全 admin ルートが一様に失敗、curl では全て成功）、アプリ本体の挙動ではない。

## 根本原因（なぜ解消されたか）

Issue 起票時（commit `066b4b29`）の `/admin/users`:

- `UsersPage`（RSC）が `renderServerComponent` の**内側**で `await requireAdminUser()` と `await loadAdminUsers()` を Suspense 境界なしで直接 await していた。ここで throw すると loader ごと reject → `/admin` の errorComponent が出る構造だった。

その後の 2 つの変更で構造的に解消:

- **`f8613e3c`（feat(ui): 主要画面を `<Suspense>` ＋スケルトンで分割描画）** — データ取得を `<SectionErrorBoundary section="ユーザー一覧">` ＋ `<Suspense>` の内側に移動。データ取得が失敗してもセクション単位のエラー表示に留まり、admin shell 全体は落ちない。
- **`requireAdminUser()` を server-fn handler へ移動** — 認証判定を `renderServerComponent` の外で行うようになった。

起票時に throw していた実トリガーは、当時の環境（新規 seed 直後のローカル D1）でのデータ取得経路（`userRepository.listAll` → `toUser` 再構築 → `toUserDTO`）に起因した可能性が高い。当時の DB / ビルド状態は残っていないため確定はできないが、現在の properly-migrated な DB では全ルートが正常。

## 受け入れ基準

| ID | 基準 | 検証方法 |
|---|---|---|
| AC-1 | admin 認証済みで `/admin/users` を開くとユーザー一覧が表示される（errorComponent ではない） | 手動確認（testing.md）— curl で HTTP 200 ＋「ユーザー管理」描画を確認済み |
| AC-2 | `/admin/users` の描画元データ経路 `userRepository.listAll` が、多様な状態（active / pending / suspended / deleted、admin / member、profile フィールドの null / 非 null）の行を throw せず正しく返すことを回帰テストで固定する | `pnpm test:integration`（新規テスト `D1UserRepository.listAll` が green） |

## 実装ステップ

1. `app/core/adapters/d1/__tests__/userRepository.integration.test.ts` に `describe("D1UserRepository.listAll (integration, #471)")` を追加する。
   - active / pending（email 未確認）/ suspended（banned）/ deleted / admin ロール / profile フィールド（bio・avatarMediaId・lastUsernameChangedAt）が非 null の行を seed。
   - `listAll({ limit })` が id 昇順で全件返し、各行が `toUser` 再構築を通り（throw せず）、`deriveStatus` 由来の status・role・profile が正しくマップされることを assert。
   - cursor ページング（`cursor` 指定で境界の次から返る）と `limit` の切り詰めを assert。
2. `pnpm test:integration` で green を確認。
3. `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。

## スコープ外

- 別途観測した UsersTable の hydration mismatch warning（`section="ユーザー一覧"`、client 側で自己回復するため表示上の実害なし）は本 Issue の症状（errorComponent）とは別物。必要なら別 Issue として扱う。

## レビュー履歴

（小規模のため計画レビューループはスキップ）
