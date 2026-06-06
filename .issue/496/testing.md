# 動作確認計画 — Issue #496: loader が domain repository を直接叩いている箇所を読み取り usecase 経由に整理する

**Issue:** #496
**作成日:** 2026-06-06

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。挙動変更ゼロのリファクタなので、主眼は「ノート詳細ページの公開状態表示が従来どおり」であることの確認。

### 検証環境の起動

ソース変更を実サーバーで見るには build してから wrangler dev を起動する（`pnpm start` は `dist/worker` を配信するため先に build が必要）。

```bash
pnpm build && pnpm start
```

ローカル D1 のスキーマ未適用なら先に:

```bash
pnpm db:migrate
```

ログイン用の管理者ユーザー＋セッションを投入する場合（任意・手早い検証用）:

```bash
pnpm seed:dev-admin
```

セッショントークンの注入はスクリプト出力のトークンを CDP 経由で（`docs/test.md` の手順参照）。通常の signup でも可（その場合 `UPDATE users SET email_verified=1 WHERE email='...'` をローカル D1 に流す）。

### デプロイ方法

なし（検証環境のみで確認できる）。

## 自動テスト

リファクタの主担保は自動テスト。

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
```

- `pnpm test:unit`: `NoteDetail.test.tsx` 等が返り値の形不変で green を維持。
- `pnpm test:integration`: 新規 `getPublicationState.integration.test.ts`（private 既定 / public / Forbidden / NotFound / null / trashed）が pass。

## 確認項目

### 1. ノート詳細ページの公開状態表示（private ノート）

- **目的:** publication state 読み取りを usecase 経由に置換しても visibility バッジ・公開日時表示が従来どおりであることを確認。
- **手順:**
  1. ログイン後、自分の private なノートの詳細ページを開く。
  2. 公開状態バッジ（private 表記）を確認。
  3. 共有リンク一覧セクションの表示を確認。
- **期待結果:** バッジが「private」、公開日時は非表示（null）、共有リンク一覧が従来どおり表示される。
- **確認ポイント:** publication state レコードが無いノートでもエラーにならず private 表示になること。

### 2. ノート詳細ページの公開状態表示（public ノート）

- **目的:** 公開済みノートの visibility・公開日時が正しく表示されること。
- **手順:**
  1. 対象ノートを public に設定（公開操作 or SQL で publication_states を投入）。
  2. 詳細ページを再読み込み。
  3. バッジと公開日時を確認。
- **期待結果:** バッジが「public」、公開日時が従来と同一の表示（UTC ISO 由来のフォーマット）。
- **確認ポイント:** `publishedAt` の表示が変更前と一致すること。

### 3. 共有リンクの表示

- **目的:** `listShareLinks` 経由の共有リンク一覧が引き続き表示されること。
- **手順:**
  1. 共有リンクを発行済みのノート詳細ページを開く。
  2. 共有リンク一覧を確認。
- **期待結果:** 発行済みリンク（revoke 済み含む）が従来どおり一覧表示される。

## エッジケース・異常系

### 1. trashed ノートの詳細表示

- **目的:** ゴミ箱送りノートの詳細ページがエラー境界に落ちず、従来どおりフォールバック表示になること。
- **手順:**
  1. ノートをゴミ箱に移動（trash）。
  2. そのノートの詳細ページにアクセス。
- **期待結果:** `NoteErrorCode.Trashed` が `NoteDetail.tsx` の catch で吸収され、`{ visibility: "private", publishedAt: null, links: [] }` 相当のフォールバック表示になる（変更前と同一挙動）。
- **確認ポイント:** 逐次呼び出しで `listShareLinks` が先に throw するため、新 usecase 追加後も挙動が変わらないこと。

### 2. 他人のノートへのアクセス

- **目的:** 所有者でないユーザーが他人のノート詳細にアクセスした際の挙動が従来どおりであること。
- **手順:**
  1. 別ユーザーでログインし、他人のノート id を直接 URL 指定でアクセス。
- **期待結果:** Forbidden 相当のエラー扱い（変更前と同一）。

## 既存機能への影響確認

- **FilterBar の参照チップ表示（`loadReferencingNoteTitle`）:** 本Issueで触らないため挙動不変。`referencingNoteId` 付きのフィルタ URL でチップのラベル（ノート名 or UUID 断片フォールバック）が従来どおり表示されることを確認。

## 確認チェックリスト

- [ ] `pnpm typecheck` が pass
- [ ] `pnpm test:unit` が pass（`NoteDetail.test.tsx` 含む）
- [ ] `pnpm test:integration` が pass（新規 `getPublicationState.integration.test.ts` 含む）
- [ ] private ノート詳細の公開状態・共有リンク表示が従来どおり
- [ ] public ノート詳細の visibility・公開日時が従来どおり
- [ ] trashed ノート詳細がフォールバック表示でエラーにならない
- [ ] 他人のノートアクセスが従来どおり拒否される
- [ ] FilterBar の参照チップ表示が従来どおり
