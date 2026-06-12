親: #565 / 祖: #514 / 元: #543（領域4「設定」モック追従）

## 背景

#565「設定画面のフィールド拡充（backend 拡張要）」の子Issue（ページ単位 4 分割の **B: P22 アクティブセッション一覧**）。#543 では P22 のセッション機能は「他のすべてのセッションをログアウト」一括失効ボタンのみで、端末ごとの一覧表示は backend（一覧取得 usecase）が無いため見送った。本 Issue でその一覧を実装する。

## スコープ（モック `spec/design/pages/P22-settings-security.html` 由来）

### アクティブセッション一覧

- 端末ごとの行表示（userAgent / ipAddress / 最終アクセス等）。
- 行単位ログアウト（個別失効）。
- 「このセッション」バッジ（現在のセッション判定）。

## 必要な backend 拡張

1. **セッション一覧取得**:
   - `SessionService` port（`app/core/domain/identity/ports/sessionService.ts:31-36`）に `listForUser(userId)` 相当のメソッドを追加（現状 `issue` / `resolve` / `revoke` / `revokeAllForUser` のみ。一覧取得は無い）。
   - adapter 実装（`app/core/adapters/d1/repositories/sessionService.ts:49-130`）に対応メソッドを追加。`sessions` テーブル（`app/core/adapters/d1/schema.ts:156-178`）には `ipAddress` / `userAgent` / `createdAt` / `updatedAt` / `expiresAt` / `token` が揃っている。
   - application usecase を新規作成（例: `app/core/application/identity/listUserSessions.ts`）。
   - セッション情報の DTO 化（端末ごとの表示に必要な項目を projection。token 等の機微情報は露出しない設計に注意）。
2. **行単位ログアウト**: 既存 `revokeSession`（`app/core/application/identity/revokeSession.ts:13`、`sessionToken` を受け取る）を流用。一覧の各行から失効できるよう配線。
3. **「このセッション」判定**: 現在のリクエストの session token と各行を突き合わせる。token そのものを client に出さず server 側で `isCurrent` フラグを付ける projection が望ましい。

## frontend

- `app/components/identity/SecurityForm/index.tsx:289-310`（現状は一括失効ボタンのみ）にセッション一覧 UI を追加。
- 一覧データは `SecurityForm/Page.tsx`（server）で取得して渡す。

## 原則（#543 で確立）

- **虚偽表示禁止**: 表示する値（端末名・最終アクセス等）は backend の実データに一致させる。取得できない情報を捏造表示しない。
- 対象モックは `spec/design/pages/P22-settings-security.html`（SSOT）。デザイントークン経由で寸法・色を当てる。
- **機微情報の取り扱い**: session token を一覧 projection に含めない。「このセッション」判定や行失効は server 側で安全に解決する。

## 参考

- #543 計画・ADR: `.issue/543/plan.md` / `.issue/543/adr.md`（ADR-002）
- 親 #565 / 棚卸し `.issue/500/followups.md`

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
