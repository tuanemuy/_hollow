# 実装計画 — Issue #525: 公開ノートのコピーボタンが公開URLではなく限定公開リンク/内部URLをコピーする

**Issue:** #525
**作成日:** 2026-06-06
**複雑度:** 小規模

---

## 目的

ノート詳細画面 (P11) の `URLをコピー` ボタンが、**公開 (public) ノートで正しい公開 URL `/u/{username}/{noteSlug}` をコピーする**ようにする。現状は visibility ごとの分岐が破綻しており、public のとき「残存した限定公開リンク (`/share/by-id/{id}`)」か「ログイン必須の内部 URL (`/notes/{id}`)」のいずれかをコピーしてしまう。

## スコープ

### 含まれるもの

- `copyUrl` の決定ロジックを visibility ごとに整理する（public / unlisted / private で明確に分岐）。
- public ノート用の公開 URL `${appUrl}/u/{username}/{slug}` を組み立てて渡す。
- 誤解を招く `publicShareUrl` という命名を、実体（限定公開リンク）が分かる `shareLinkUrl` に改める。
- 関連する単体テストの更新・追加。

### 含まれないもの

- `PublicationService.changeVisibilityAndCascade` の挙動（unlisted → public でリンクを失効させない仕様）の変更。これは意図的な UX であり Issue でも温存が前提。
- 共有リンク発行 UI（PublishSettings）の変更。
- 内部 URL `/notes/{id}` 自体の仕様（private / 内部用途で正しい）。

## 実装ステップ

### 1. `NoteDetail.tsx` で公開 URL を組み立て、命名を是正する

- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx`
- **変更内容:**
  - `publicShareUrl` を `shareLinkUrl` にリネーム（実体は `firstActiveLink.url` = 限定公開リンク）。
  - public ノート用の公開 URL を新たに算出する。`user.username` と `note.slug` は常に利用可能なので、既存の URL 組み立てパターン（`view.ts` の `shareLinkUrlFromId` と同じ `appUrl.replace(/\/$/, "")` 方式）に合わせて
    `const publicNoteUrl = \`${appUrl.replace(/\/$/, "")}/u/${user.username}/${note.slug}\`;`
    を生成する。
  - `NoteActions` に `shareLinkUrl` と `publicNoteUrl` を渡す。
- **理由:** 公開 URL 生成に必要な材料（username / slug / appUrl）はサーバーコンポーネント側に揃っており、URL の決定材料を presentation に閉じ込めるのが自然。slug は `[a-z0-9][a-z0-9-]*`（`NoteSlug` のドメイン不変条件）で URL-safe のためエンコード不要。

### 2. `NoteActions.tsx` の `copyUrl` 分岐を visibility ごとに整理する

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:**
  - props を `publicShareUrl: string | null` から `shareLinkUrl: string | null` ＋ `publicNoteUrl: string` に変更。
  - `copyUrl` を以下の優先順位に再構成:
    - `public` → `publicNoteUrl`
    - `unlisted` かつ アクティブな共有リンク有り → `shareLinkUrl`
    - それ以外（`private`、または `unlisted` でリンク無し）→ 内部 URL（`location` 解決は従来どおりクリック時、SSR では `/notes/{id}` のまま）
- **理由:** Issue の期待挙動テーブルを満たす。`unlisted` でリンク無しのときの内部 URL fallback は現状挙動を踏襲。

### 3. テストの更新・追加

- **対象ファイル:** `app/components/note/detail/__tests__/NoteActions.test.tsx`
- **変更内容:**
  - `renderActions` の props を新インターフェース（`shareLinkUrl` / `publicNoteUrl`）へ更新。
  - `UrlCopyButton` のモックを `url` prop を可視化する形に拡張し、visibility ごと（public / unlisted+link / unlisted無link / private）に `copyUrl` が期待 URL になることを検証する test を追加。
- **理由:** バグの本丸である分岐ロジックを回帰テストで固定する。

## 設計判断

- 公開 URL の組み立てを `NoteActions`（client）ではなく `NoteDetail`（server）で行う。理由: username / slug / appUrl の決定材料はサーバー側に揃っており、client は「コピーする文字列を受け取って貼る」だけ（`UrlCopyButton` の JSDoc が示す責務分担）に寄せられる。`location.origin` ではなく設定値 `appUrl` を基底にすることで、共有リンク URL と同じ正規ホストに揃う。
- 内部 URL fallback（private / unlisted無link）は従来どおり `location.origin` をクリック時に解決する方式を維持する（オーナー専用の内部遷移であり、設定 `appUrl` ではなく実アクセスホストが妥当）。ADR を起こすほどのトレードオフではないため plan 内に留める。

## リスクと注意点

- `NoteDetail` のサーバーコンポーネントで `note.slug` / `user.username` を参照する。両者は DTO 上必須フィールドで常に存在するため null 考慮は不要。
- `NoteActions` の props 変更により、呼び出し元（`NoteDetail` のみ）と既存テストの双方を漏れなく更新する必要がある。grep で `publicShareUrl` の参照が他に残っていないことを確認する。
- public 表示は `appUrl` 基底の絶対 URL になるため、`appUrl` 設定が正しい前提（共有リンク URL と同じ前提）。

## テスト方針

- 単体テスト（`NoteActions.test.tsx`）で visibility × リンク状態の組み合わせごとに `copyUrl` を検証。
- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。
- ブラウザ手動検証（testing.md 参照）で、public ノートのコピーボタンが `/u/{username}/{slug}` を返すこと、unlisted は共有リンク、private は内部 URL を返すことを確認。

## レビュー履歴

小規模Issueのためレビューループはスキップ（issue-planner の小規模フロー）。
