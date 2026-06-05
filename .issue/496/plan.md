# 実装計画 — Issue #496: refactor: loader が domain repository を直接叩いている箇所を読み取り usecase 経由に整理する（#489 フォローアップ）

**Issue:** #496
**作成日:** 2026-06-06
**複雑度:** 中〜大規模

---

## 目的

#489 のレビューで判明した依存方向スメルの解消。`app/components/note/loaders.ts` の `loadPublishStateForNote` が usecase を介さず `publicationStateRepository.findById(... as Parameters<...>)` で domain repository ポートを直接叩き、presentation 層に `string → ブランド` 橋渡しキャストが残っている。publication state 読み取り用 usecase を新設してこの直接結合とキャストを解消する。挙動変更を伴わない型・構造レベルのリファクタ。

## スコープ

### 含まれるもの

- publication state を読み取る usecase `getPublicationState` の新設
- `loadPublishStateForNote` を新設 usecase 経由に置換（直接 repo アクセスと `Parameters<>` キャストの除去）
- 新 usecase の統合テスト追加
- `loadReferencingNoteTitle` の扱いについての方針決定（判断B参照）

### 含まれないもの

- `loadReferencingNoteTitle` の usecase 化（判断B により現状維持）
- 挙動の変更（返り値の形・null/フォールバック挙動は完全維持）
- 他 loader / 他スライスへの波及リファクタ

## 実装ステップ

### 1. 読み取り usecase `getPublicationState` を新設

- **対象ファイル:** `app/core/application/publication/getPublicationState.ts`（新規）
- **変更内容:**
  - Input: `Readonly<{ actorUserId: string; noteId: string }>`
  - Output: `Readonly<{ publicationState: PublicationStateDTO | null }>`（既存 `PublicationStateDTO` を再利用。`publishedAt` は `Instant | null`）
  - `PublicationStateDTO` / `toPublicationStateDTO` は publication slice の慣習に合わせ `./view` から import する（`listShareLinks` が `./view` から `toShareLinkDTOFromId` を import するのと同じ）。
  - 実装は `listShareLinks` と同じ構造。冒頭で `const actorUserId = input.actorUserId as UserId; const noteId = input.noteId as NoteId;`。UoW 内で `loadOwnedNote(noteRepository, noteId, actorUserId)`（**exists + owner のみ検証**）を呼び、続けて `listShareLinks` と同じ trashed チェック `if (note.status !== "active") throw new BusinessRuleError(NoteErrorCode.Trashed, ...)` を行う。その後 `publicationStateRepository.findById(noteId)` で取得。`found === null` なら `{ publicationState: null }`、あれば `{ publicationState: toPublicationStateDTO(found.entity) }`。
- **理由:** loader からの直接 repo アクセスと presentation 層のブランドキャストを解消し、id 橋渡しを usecase 内に閉じ込める。trashed チェックを明示的に置くことで sibling の `listShareLinks` と所有権ゲート契約を完全に一致させる。

### 2. slice barrel に再export を追加

- **対象ファイル:** `app/core/application/publication/index.ts`
- **変更内容:** `getPublicationState` の再export を既存の公開規約（アルファベット順等）に合わせて追加。
- **理由:** 既存 usecase と同じ公開規約に揃える。

### 3. `loadPublishStateForNote` を usecase 経由に置換

- **対象ファイル:** `app/components/note/loaders.ts`（L492-528）
- **変更内容:**
  - dynamic import を **2つの個別パス import** にする（`import("@/core/application/publication/listShareLinks")` と `import("@/core/application/publication/getPublicationState")` を `Promise.all`）。barrel `@/core/application/publication` 経由は publication slice 全 usecase を同一 chunk に巻き込み、既存 loader の「1機能=1個別パス import」慣習からも外れるため避ける。
  - `container.unitOfWorkProvider.run(...)` ブロックと `Parameters<>` キャストを削除し、`const { publicationState } = await getPublicationState({ container, input: { actorUserId: args.actorUserId, noteId: args.noteId } });` に置換。
  - 返り値の組み立て: `visibility: publicationState === null ? "private" : publicationState.visibility`、`publishedAt: publicationState === null ? null : publicationState.publishedAt`、`links` はそのまま。`publishedAt` は DTO 上既に `Instant`（ISO 文字列）で従来の `.toISOString()` と同一文字列。
- **理由:** 直接 repo アクセス除去。返り値の形（`{ visibility, publishedAt, links }`）を完全維持。

### 4. 新 usecase の統合テストを追加

- **対象ファイル:** `app/core/application/publication/__tests__/getPublicationState.integration.test.ts`（新規）
- **変更内容:** `setupTestContainer()` で note + publication state を seed し、(a) private 既定 / public 設定後の visibility・publishedAt、(b) 他人の note → ForbiddenError、(c) 存在しない note → NotFoundError、(d) publication state レコード未作成時 → `{ publicationState: null }`、(e) trashed note → `BusinessRuleError(NoteErrorCode.Trashed)` を検証。
- **理由:** 挙動を pin する。配置・記法は note slice の統合テスト規約（`getNoteDetail.integration.test.ts` 等）に倣う（publication slice には既存の usecase 統合テストが無いため）。

### 5. 後処理

- `pnpm typecheck && pnpm lint:fix && pnpm format`、関連 unit テスト（`NoteDetail.test.tsx`）と新規統合テストを実行。

## 設計判断

詳細は adr.md を参照。

- **判断A:** `loadPublishStateForNote` を新設 `getPublicationState` 経由にする。usecase は `listShareLinks` と同じ所有権ゲート（`loadOwnedNote` で exists+owner + 明示的 trashed チェック）を持つ。挙動変更ゼロの根拠は「loader 内で `listShareLinks` を**先に逐次実行**しており、forbidden/notfound/trashed が NG なら `getPublicationState` 到達前に `listShareLinks` が throw 済み」という順序依存にある。
- **判断B:** `loadReferencingNoteTitle` は現状維持。ブランドキャスト(`as`)が残っておらず本Issueの主目的（キャスト除去）に非該当で、graceful fallback 挙動を保つには現状の transport-boundary 検証パターンが最適。

## リスクと注意点

- **dynamic import 経路:** `getPublicationState.ts` 単独 import では `listShareLinks` が含まれないため、loader では `listShareLinks` と `getPublicationState` を**2つの個別パス import**で `Promise.all` する（barrel は使わない。判断A／ステップ3参照）。
- **trashed note の throw 経路:** `loadOwnedNote`（internal.ts）は exists + owner **のみ**検証し trashed は見ない（JSDoc は "active" と書くが実コードは status を見ない）。trashed throw は `listShareLinks` が `loadOwnedNote` の後段で `note.status !== "active"` チェックを行って `NoteErrorCode.Trashed` を投げている。`getPublicationState` も同じ後段チェックを置いて契約を揃える。loader は `listShareLinks` → `getPublicationState` の逐次呼び出しなので trashed 時はまず `listShareLinks` が throw し、いずれにせよ同一 kind のため `NoteDetail.tsx` の catch は不変。
- **`publishedAt` の表現差異:** 現状 `.toISOString()`、新方式は DTO の `Instant`（`toInstant` 経由）。両者は同一 UTC ISO 文字列であることを確認すること。
- **二重 findById:** 新 usecase が note の findById を行うため、loader 全体で findById が1回増える（同一読み取りコストのみ、挙動変更なし）。
- `loadReferencingNoteTitle` は触らないので回帰リスクなし。

## テスト方針

- **自動（unit）:** `app/components/note/detail/__tests__/NoteDetail.test.tsx` を実行し、返り値の形不変で green を維持することを確認。
- **自動（integration）:** 新規 `getPublicationState.integration.test.ts` で visibility・publishedAt・Forbidden・NotFound・null を pin。
- **手動/ブラウザ:** ノート詳細ページで visibility バッジ・公開日時・共有リンク一覧が従来通り表示されること、trashed ノート詳細がエラー境界に落ちず private 表示になることを確認。
- リファクタにつき、上記はすべて「挙動が変わっていないこと」の確認が主目的。

## レビュー履歴

### 1周目

**修正した点**:
- 両視点の P-001（要件カバレッジ / アーキ・リスク）: 「`loadOwnedNote` が exists+owner+**active** を検証する」という事実誤認を訂正。実際は exists+owner のみで、trashed チェックは `listShareLinks` 側が後段で実施。`getPublicationState` にも明示的な trashed チェックを置いて `listShareLinks` と契約を一致させる方針に変更。「挙動変更ゼロ」の根拠を「新 usecase が同じ throw をする」から「loader 内の `listShareLinks` → `getPublicationState` 逐次順序」に書き換え（plan.md 設計判断A・リスク欄、adr.md ADR-001）。
- アーキ視点 P-002: 同上（挙動変更ゼロの論拠の組み直し）に集約して対応。

**取り込んだ改善提案**:
- アーキ視点 S-001: dynamic import を barrel ではなく 2つの個別パス import（`Promise.all`）に確定。
- 要件視点 S-001: 新 usecase の DTO import 元を `./view` に明記。
- アーキ視点 S-002 / 要件視点（テスト）: 統合テストは note slice 規約に倣う旨を明記。trashed ケース (e) をテストに追加。

**見送った提案とその理由**:
- アーキ視点 S-002（二重 findById のコスト注記でページ全体の重複に言及）: コスト評価の正確性向上にとどまりスコープ・挙動に影響しないため、リスク欄の既存記述で十分と判断し追記は見送り。

### 2周目

両視点とも **問題点ゼロ** で終了。1周目の3指摘がすべて正しく反映され、コードとの突き合わせでも事実誤認が残っていないことを確認。

**取り込んだ改善提案**:
- 要件視点 S-001: `index.ts` の `getPublicationState` 挿入位置を厳密なアルファベット順（`getPublicNote` の前）にする旨を実装時の指針として確定。
- アーキ視点 S-001: ADR-001 の Status を Accepted に更新。
