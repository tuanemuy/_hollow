親: #565 / 祖: #514 / 元: #543（領域4「設定」モック追従）/ 関連: #510（確認強度確定）・#221（フィードバック原則）

## 背景

#565「設定画面のフィールド拡充（backend 拡張要）」の子Issue（ページ単位 4 分割の **C: P24 アカウント削除強化**）。#543 では P24 は section-desc の「取り消せません」強調のみ追従し、多段確認・削除影響の実データ集計は backend 拡張が必要なため見送った。本 Issue で破壊操作の確認強度を引き上げる。

## スコープ（モック `spec/design/pages/P24-settings-account-delete.html` 由来）

### 1. 多段アカウント削除確認

- 同意チェックボックス + 確認語「DELETE」入力 + パスワード再検証の多段フロー（confirm-steps / step-num / checkbox-row）。
- **現状**: `deleteAccount` usecase（`app/core/application/identity/deleteAccount.ts:21`）の `confirmation` は username 一致のみ（パスワード検証なし）。
- **必要**: パスワード再検証の追加。既存の `CredentialStore.verifyPasswordForUser(userId, raw)`（`app/core/domain/identity/ports/credentialStore.ts:79`、他の sensitive operation の再認証で使用中）を `deleteAccount` に組み込む。`DeleteAccountInput` にパスワードを追加。確認語「DELETE」入力は transport/frontend 側で検証。
- 破壊操作の confirm 強度は #510 確定 / #221 フィードバック原則に基づく。

### 2. 削除影響の実データ集計リスト

- 削除前に「何がどれだけ失われるか」を実データで提示（件数 / 容量 / 410 Gone になる公開ノート / 限定公開リンク失効数 等）。
- **必要**: 複数ドメイン横断の集計 usecase を新規作成。利用できる既存メソッド:
  - ノート数: `NoteRepository.countByOwner(ownerId, opts)`（`app/core/domain/note/ports/noteRepository.ts:321`）。
  - メディア（容量は entity 保持）: `MediaAssetRepository.findByOwner(ownerId, opts)`（`app/core/domain/media/ports/mediaAssetRepository.ts:27-30`）。
  - 公開リンク: `ShareLinkRepository.countByNoteId(noteId, includeRevoked)`（`app/core/domain/publication/ports/shareLinkRepository.ts:40`）。owner スコープの集計は未実装のため、owner 横断の集計方法を設計（owner-scoped count メソッド追加 or 公開ノート列挙して集計）。
  - 公開ノート（410 Gone 化対象）: `deleteAccount.ts:66-90` で既に `publicationStateRepository.findPublicByOwner()` を使い public→private 化している。集計でも同じ経路を利用可能。
- 削除時の実カスケード（`deleteAccount.ts:21-128`）: User soft-delete → 全認証情報 purge → 公開ノート private 化（リンク失効トリガー）→ 進行中 export job キャンセル → 全セッション失効。集計リストはこの実挙動に一致させる。

## frontend

- `app/components/identity/AccountDeleteForm/`（`index.tsx` / `action.ts` / `Page.tsx`）に多段確認 UI を構築。
- 現状の `ConfirmDialog`（`app/components/common/ConfirmDialog.tsx`、username 入力のみ）から、同意チェック + DELETE 入力 + パスワード入力 + 影響集計表示の多段フローへ拡張。
- スキーマ `app/components/identity/schema.ts:31-33`（`deleteAccountSchema`）にパスワード・確認語を追加。
- 影響集計は `AccountDeleteForm/Page.tsx`（server）で集計 usecase を呼んで渡す。

## 原則（#543 で確立）

- **虚偽表示禁止**: 集計値・影響リストは backend の実データ・実カスケード挙動に厳密一致させる。実際には消えないものを「消える」と表示しない（例: media は ref-count 管理、note は purge worker で後処理）。
- 対象モックは `spec/design/pages/P24-settings-account-delete.html`（SSOT）。デザイントークン経由で寸法・色を当てる。

## 参考

- #543 計画・ADR: `.issue/543/plan.md` / `.issue/543/adr.md`（ADR-002）
- `.issue/500/decisions-pending.md`（P24 確認強度論点）/ 親 #565

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
