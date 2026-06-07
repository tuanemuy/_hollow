# 実装計画 — Issue #571: feat(settings): P21 プロフィール拡充（アバターアップロード + リセット/最終保存/次回変更日）

**Issue:** #571
**作成日:** 2026-06-07
**複雑度:** 中〜大規模

---

## 目的

#565「設定画面のフィールド拡充（backend 拡張要）」の子Issue（ページ単位4分割の A: P21 プロフィール）。#543 で frontend 完結分は実装済み。本Issueはその続きで、P21 プロフィール画面に残った backend を伴う拡充（アバターアップロード配線・リセット/最終保存タイムスタンプ・ユーザー名次回変更可能日）を扱う。

## スコープ

### 含まれるもの

1. **アバターアップロード配線** — avatar-large 表示 + アップロード + 削除 + プレビュー + 推奨サイズヘルプ。backendは概ね既存（avatarMediaId, uploadMedia, updateProfile の swap 実装済み）。新規に必要なのは ProfileForm への avatar UI + アバター表示 + アップロード/プレビュー/削除フローの配線。
2. **action-row「リセット」+「最終保存」タイムスタンプ** — リセットボタン（frontend完結）と最終保存タイムスタンプ表示。`lastSavedAt` 相当を UserDTO に露出。
3. **ユーザー名「次に変更できる日付」表示** — `lastUsernameChangedAt`（User entity に既存）を UserDTO に露出し、`+30日クールダウン`で次回変更可能日を算出・表示。

### 含まれないもの

- ヘッダー（`UserMenu`）の avatar 画像化（現状イニシャル表示のまま）。本Issueは P21 ProfileForm 内に限定。
- avatar 専用の backend 上限（`enforceUploadLimit` は instance settings 依存のまま）。新規 migration / entity 拡張は行わない。
- 専用 `lastSavedAt` カラムの新設（`updatedAt` を射影する）。

## 実装ステップ

### 1. `UserDTO` に `lastSavedAt` と `lastUsernameChangedAt` を露出

- **対象ファイル:** `app/core/application/dto/identity.ts`
- **変更内容:** `UserDTO` に `lastSavedAt`（`user.updatedAt` を射影）と `lastUsernameChangedAt`（`Date|null` を射影、null 系も対応）を追加。`toUserDTO` で両フィールドを埋める。Instant 型の射影は既存パターン（`toInstant` / `toInstantOrNull` 等）に倣う。
- **理由:** 最終保存タイムスタンプと「次に変更できる日付」を frontend で算出するための実値。これが無いと ADR-004（虚偽表示禁止）に従い表示できない。

### 2. `USERNAME_CHANGE_COOLDOWN_MS` を共有可能にする

- **対象ファイル:** `app/core/domain/identity/entity.ts`
- **変更内容:** 既存 const を `export`（domain がクールダウンの SSOT）。frontend の「次回変更可能日 = `lastUsernameChangedAt` + cooldown」算出で同じ値を参照する。
- **理由:** クールダウン日数（30日）を frontend にハードコードすると domain と乖離しうる。SSOT を1箇所に保つ。

### 3. identity styles に avatar / action-row 系クラスを追加

- **対象ファイル:** `app/components/identity/styles.ts`
- **変更内容:** `AVATAR_ROW`（flex gap items-center、sm 以下で縦積み）、`AVATAR_LARGE`（80px 円、画像 `object-cover` + イニシャル fallback）、`AVATAR_ACTIONS`、`BTN_SM` / `BTN_SM_DANGER`（mock `.btn-sm`）、`ACTION_ROW_SPACER`（`flex-1`）をトークン由来 utility で定義。
- **理由:** モック寸法/色をトークン経由で当てる。繰り返し utility は styles.ts に集約する規約に従う。リテラル px の新規持ち込みを避ける。

### 4. アバター表示 + アップロード/プレビュー/削除を `ProfileForm` に配線

- **対象ファイル:** `app/components/identity/ProfileForm/index.tsx`
- **変更内容:**
  - avatar 表示: `currentAvatarId`（pending preview を優先、なければ `user.avatarMediaId`）から `src={\`/media/${id}\`}` で `<img>`、無ければイニシャル fallback（`UserMenu` の `initials` パターン流用）。owner 自身の閲覧は `downloadMedia` で許可されるため `/media/<id>` で表示可。
  - アップロード: `MediaUploader` と同型の presign(`kind:"avatar"`)→PUT→finalize フローを `useState` で持ち、成功時は `mediaId` を pending state に保持しプレビュー表示（即保存はせず profile フォーム submit で確定）。client 側でサイズ・形式チェックを行い、ヘルプ文言と実挙動を一致させる。
  - 削除: pending state を `null`(clear) にセットしプレビューをデフォルトへ戻す。
  - submit: 既存 `profileAction` の `updateProfile` 呼び出しに `avatarMediaId` を tri-state で同梱（変更時のみ。pending が `null` クリアなら明示 `null`、未変更なら omit）。
  - 推奨サイズヘルプ: モック文言「推奨: 正方形 512×512px 以上、PNG または JPEG、5MB まで。」を `FIELD_HINT` で表示。
  - **client バリデーション挙動（ADR-004 厳密化）:**
    - **形式（PNG/JPEG）: hard reject** — `accept="image/png,image/jpeg"` + 選択後 MIME 再チェック。非対応形式は明示エラーで弾く（文言「PNG または JPEG」を強制で裏付け）。
    - **サイズ（5MB）: hard reject** — `file.size > 5MB` をエラーで弾く。backend の `enforceUploadLimit` は avatar 専用上限ではないが、client で 5MB 上限を強制することで「5MB まで」の文言と挙動を一致させる（より厳しい guard は虚偽にならない）。
    - **寸法（512px 以上・正方形）: soft（推奨のみ、reject しない）** — client での画像デコード判定はやり過ぎなので「推奨」表現に留め、強制はしない。ヘルプ文言が「推奨:」始まりなので虚偽表示には当たらない。
- **理由:** モックのアバター機能を、確立済み media フロー（presign/finalize）と既存 `updateProfile` swap に乗せて配線。即時別 action ではなくフォーム保存に統合することで「リセット」「最終保存」と整合する。

### 5. action-row にリセット + 最終保存タイムスタンプを追加

- **対象ファイル:** `app/components/identity/ProfileForm/index.tsx`
- **変更内容:** profile フォームの `ACTION_ROW` に「リセット」ボタン（displayName/bio を `defaultValue` へ、bioCount を初期値へ、avatar pending state を初期値へ戻す frontend 完結ハンドラ）+ `ACTION_ROW_SPACER` + 「最終保存: {formatDate(user.lastSavedAt)}」を `FIELD_HINT` で表示。日付整形は既存の日付整形パターン（`ja-JP`）を踏襲。
- **理由:** モックの action-row 構成を再現。`lastSavedAt`(=updatedAt) は実値なので ADR-004 適合。

### 6. ユーザー名「次に変更できる日付」表示

- **対象ファイル:** `app/components/identity/ProfileForm/index.tsx`
- **変更内容:** username フォームのヘルプに、`user.lastUsernameChangedAt !== null` のとき `next = lastUsernameChangedAt + USERNAME_CHANGE_COOLDOWN_MS` を算出し、`next > now` なら「次に変更できるのは {formatDate(next)} 以降です」を追記。`null` または既にクールダウン経過なら追記しない（虚偽表示回避）。
- **理由:** #543 で非表示だった実値表示を、DTO 露出により解禁。ADR-004 に適合。

### 7. 整合確認: `toUserDTO` 消費箇所の型 / テスト

- **対象ファイル:** identity DTO テスト（新規作成）, ProfileForm テスト（既存 `ProfileForm/__tests__/index.test.tsx` を拡張）
- **変更内容:**
  - `toUserDTO` 専用テストは現状存在しないため**新規作成**し、`lastSavedAt`（updatedAt 射影）と `lastUsernameChangedAt`（null/Date 両系）を正しく射影することを検証する。
  - 「次回変更可能日」算出ロジック（cooldown 経過済み/未経過/null の3分岐で表示・非表示が切り替わる）を純関数に切り出してユニットテスト。
  - `pnpm typecheck` で全消費者の型整合を確認。
- **理由:** フィールド追加の波及を型と新規テストで担保。テスト方針と整合させ「あれば更新」の条件付きを排し、確実にカバレッジを足す。

## 設計判断

詳細は adr.md を参照。要点:

- **`lastSavedAt` に `updatedAt` を流用** — profile mutation でも必ず `updatedAt` が更新されるため実用上一致。専用カラム新設はスコープ過大。ただし profile 以外の更新でも進む点を ADR に明記。
- **avatar download URL は `/media/<id>` 既存リダイレクト経路を使う** — Page server で presigned URL を prop 注入しない（短命 TTL とキャッシュの衝突回避）。owner は自分の asset を常時閲覧可。
- **avatar 削除/確定はフォーム保存に統合** — 即時 API を呼ばず、submit 時に `avatarMediaId` を tri-state で送り `updateProfile` の swap に委ねる。リセットで取り消し可能。

## リスクと注意点

- **`UserDTO` へのフィールド追加**は型レベルで全消費者に波及。`toUserDTO` 経由なので追加漏れは起きないが、DTO を手組みしている箇所があれば typecheck で検出して更新。`pnpm typecheck` を必ず実行。
- **avatar の即時別保存をしない設計**のため、アップロード後に「保存」を押さず離脱すると avatar は反映されない。pending preview を視覚的に明示する。finalize 済み未参照 asset は `refCount=0` の pending として後で回収されるため安全。
- **client 側サイズ/形式バリデーション**はヘルプ文言と厳密一致させる（ADR-004）。backend の `enforceUploadLimit` は avatar 専用上限ではないため、サイズ上限は client ヘルプの「推奨」表現に留め、backend 強制と乖離させない。
- **pending avatar の preview を `/media/<id>` で出す**には finalize 完了が前提。finalize 後に preview する。
- **`lastSavedAt` が profile 以外の更新でも進む**点を ADR に明記し、「最終保存」の語と挙動の乖離を誤解されないようにする。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` を変更後に必須実行（CLAUDE.md 規約）。
- ユニット: `toUserDTO` が `lastSavedAt`（updatedAt 射影）と `lastUsernameChangedAt`（null/Date 両系）を正しく射影することを確認。「次回変更可能日」算出（cooldown 経過済み/未経過/null の3分岐）を純関数で検証。
- ブラウザ手動確認: (1) avatar 未設定時イニシャル → アップロード → preview → 保存 → 再読込で表示、(2) 削除 → 保存 → イニシャルに戻る、(3) リセットで未保存変更が破棄、(4)「最終保存」が直近保存時刻を反映、(5) `lastUsernameChangedAt` セット済みで「次に変更できる日付」表示・クールダウン経過後に非表示。`spec/design/pages/P21-settings-profile.html` と寸法/レイアウト突き合わせ。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**問題点（要修正）**: なし（要件カバレッジ・アーキテクチャ整合性ともに「問題点ゼロ」）。両レビュアーが実コードで前提を全件検証し、`toInstant`/`toInstantOrNull`（`dto/common.ts`）の実在、`mediaKindSchema` の `avatar` 受理、`downloadMedia` の owner 無条件閲覧許可（asset 状態非依存）、`updateProfile`/`action.ts` の tri-state 転送、`USERNAME_CHANGE_COOLDOWN_MS` 参照箇所が entity 内1箇所のみ（export 副作用なし）、frontend からの domain 定数 import 前例（`DirectoryPicker.tsx` の `MAX_DIRECTORY_DEPTH`）を確認。

**取り込んだ改善提案**:
- **S-001（両視点）**: 推奨サイズヘルプの client バリデーション挙動を実装前に確定（ステップ4）。形式 PNG/JPEG と 5MB は hard reject、寸法512px・正方形は「推奨」表現に留め強制しない。ADR-004 の「ヘルプと実挙動の一致」をブレなく満たす。
- **S-003（アーキ視点）**: `toUserDTO` 専用テストは現状存在しないため「あれば更新」を「新規作成」に変更（ステップ7）。

**見送った提案とその理由**:
- **S-002（要件視点）**: 「最終保存」ラベルは `updatedAt` 流用でも、モック文言が「最終保存」のためモック追従としてそのまま採用。変更不要。
- **S-002（アーキ視点）**: avatar 表示の共有コンポーネント切り出しは、本Issueは P21 ProfileForm 内に限定（header avatar 画像化はスコープ外）のため、`UserMenu` の initials パターン流用に留める。将来 #565 系で header を画像化する際に切り出しを検討。
