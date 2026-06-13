親: #565 / 祖: #514 / 元: #543（領域4「設定」モック追従）

## 背景

#565「設定画面のフィールド拡充（backend 拡張要）」の子Issue（ページ単位 4 分割の **A: P21 プロフィール**）。#543 で frontend 完結分（bio 文字数カウンタ・公開 URL prefix/プレビュー・ユーザー名レート制限ヘルプ等）は実装済み。本 Issue はその続きで、**P21 プロフィール画面**に残った backend を伴う拡充を扱う。

## スコープ（モック `spec/design/pages/P21-settings-profile.html` 由来）

### 1. アバターアップロード配線

- avatar-large 表示 + アップロード + 削除 + プレビュー + 推奨サイズヘルプ。
- **backend は概ね既存**:
  - `avatarMediaId` は User entity（`app/core/domain/identity/entity.ts:27`）・`UserDTO`（`app/core/application/dto/identity.ts:19`）に既に存在。
  - media usecase `uploadMedia`（`app/core/application/media/uploadMedia.ts:40`）/ `uploadMediaPresigned`（`app/core/application/media/uploadMediaPresigned.ts:31`）が既存。`MediaKind` に avatar 用途を渡す。
  - `updateProfile`（`app/core/application/identity/updateProfile.ts:35`）が `avatarMediaId` の swap（旧 avatar の ref-count decrement / 新 avatar の increment + `User.changeAvatar`）を実装済み。
  - 入力スキーマも `app/components/identity/schema.ts:11` に `avatarMediaId` を定義済み。
- **新規に必要**: `ProfileForm`（`app/components/identity/ProfileForm/index.tsx`）への avatar UI（現状フォームにアバター表示・アップロード導線が無い）+ アバター表示コンポーネント（既存の Avatar 専用コンポーネントは無い）+ アップロード/プレビュー/削除フローの配線。avatar の download URL を Page（server）で解決して渡す経路の確認。

### 2. action-row「リセット」+「最終保存」タイムスタンプ

- フォームの「リセット」ボタン（frontend 完結可）と「最終保存」タイムスタンプ表示。
- **必要**: `lastSavedAt` 相当を `UserDTO` に載せる。User entity には `updatedAt`（`entity.ts:31`）があるため、これを DTO に露出する形を検討（プロフィール更新時刻として妥当か要確認。専用 `lastSavedAt` が必要なら usecase/DTO 拡張）。

### 3. ユーザー名「次に変更できる日付」表示

- #543 では `lastUsernameChangedAt` が `UserDTO` 非搭載のため「次に変更できる日付」を非表示にし、静的な「30日に1回まで」のみ表示した。
- **発見**: `lastUsernameChangedAt` は User entity に既に存在（`app/core/domain/identity/entity.ts:32`、`Date | null`）。**`UserDTO` に露出するだけ**で「次に変更できる日付（`lastUsernameChangedAt` + 30日クールダウン）」を算出・表示できる。
- クールダウンは `USERNAME_CHANGE_COOLDOWN_MS = 30日`（`entity.ts:19`）。

## 原則（#543 で確立）

- **虚偽表示禁止**: 表示する値・ヘルプ・プレビューは backend の実挙動に厳密一致させる。実値が取れない表示は出さない。
- 対象モックは `spec/design/pages/P21-settings-profile.html`（SSOT）。`spec/design/index.md` / `tokens.md` 参照、デザイントークン経由で寸法・色を当てる。リテラル px の新規持ち込みは避ける。

## 参考

- #543 計画・ADR: `.issue/543/plan.md` / `.issue/543/adr.md`（ADR-002 が切り出しの根拠、ADR-004 が虚偽表示禁止）
- 親 #565 / 棚卸し `.issue/500/followups.md`

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
