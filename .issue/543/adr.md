# ADR — Issue #543: 領域4「設定」(P21〜P24) モック実装追従（中スコープ）

スコープは **「中（frontend で無理なく実装できる範囲）」** に確定（ユーザー決定）。
新規 backend を要さず frontend で完結する差分を追従し、backend 拡張が必要な拡充群は別 Issue へ切り出す。

---

## ADR-001: 設定サブナビは「左サイドバー差し替え」を維持（`settings-grid` 再構築はしない）

### Status
Accepted

### Context
モックには `settings-grid` / `settings-header` / `page-title` 等の専用骨格が描かれ得るが、`spec/design/index.md` §2.4 は「アプリと同じ骨格を使い、**左サイドバーを設定ナビに差し替える**方式に統一する。コンテンツ内サブナビ列（`settings-grid` 等）は採らない」を SSOT として確定している。実装も既に同方式（`app/routes/_app/route.tsx:129` の `settingsSidebar` prop + `app/components/layout/AppShellDrawer.tsx:83,190` の `pathname.startsWith("/settings")` 切り替え）。`#510` decisions-pending 重要論点#1 も「本 Issue では nav 項目・スタイル・フォーム構成の寄せに留めた」と裁定済み。

### Decision
設定サブナビの配置は左サイドバー差し替え方式を維持し、`settings-grid` 等の専用骨格は導入しない。本 Issue が追加する設定ナビの差分は「すべてのノートに戻る」戻り導線（`.sidebar-back`）のみ。

### Consequences
- 良い点: SSOT（index.md §2.4）と実装が一致し、骨格の作り直しを避けられる。
- トレードオフ: モック HTML の `settings-grid` 表現とは一致しないが、モック CSS コメント §2.4 自身が「専用骨格は設けない」と明記しており矛盾しない。

---

## ADR-002: backend 拡張が必要な拡充群は別 Issue（Phase 4）へ切り出す

### Status
Accepted

### Context
P21〜P24 モックは多くの豪華機能を描くが、各 HTML コメントが「実装に無い・別 Issue（B 参照）」と宣言し、`.issue/500/followups.md` でも「別Issue化候補: Yes」とされている。下記はいずれも新規 backend（usecase/domain/adapter/DTO 拡張）が必須:

- **アクティブセッション一覧**（端末ごとの行・行単位ログアウト・「このセッション」バッジ）: `app/core/application/identity/revokeSession.ts`（個別失効）はあるが**一覧取得 usecase が無い**。SessionService 拡張が必要。
- **多段アカウント削除確認**（同意チェック + DELETE 語入力 + パスワード再検証）: `deleteAccount` usecase は `confirmation`（username 一致）のみ。パスワード再検証拡張 + 確認 UI 構築が必要。
- **削除影響の実データ集計リスト**（件数/容量/410 Gone/限定公開リンク失効数）: 複数ドメイン横断の集計 usecase が新規必要。
- **アバターアップロード配線**（avatar-large + アップロード/削除 + プレビュー）: media usecase はあるが UI/プレビュー/削除フローの新規構築が必要。
- **action-row「リセット」+「最終保存」タイムスタンプ**: `lastSavedAt` は UserDTO に無く DTO/usecase 拡張が必要。リセット単体は frontend で可能だが、最終保存とセットの UI のため同梱。

ユーザーがスコープ「中（frontend 完結）」を決定したため、これらは本 Issue の範囲外。

### Decision
上記 6 群は本 Issue では実装せず、**テーマ「設定画面のフィールド拡充（backend 拡張要）」として 1 本の Issue に束ねて Phase 4 で起票**する。本 Issue は frontend 完結の差分（戻り導線・文字数カウンタ・URL prefix/プレビュー・レート制限ヘルプ・パスワード強度ヘルプ・section-desc 整合）のみを追従する。

### Consequences
- 良い点: スコープが frontend 完結に収まり、未設計 backend の場当たり実装を避けられる。フォローアップを 1 本に束ねることで関連変更を一括管理できる。
- トレードオフ: モックの完成イメージとは一致しない（複数機能が欠落）。意図的差分として記録し、Phase 4 Issue で扱う。

---

## ADR-003: 「実装が正」とモック comment が認める箇所は変更しない

### Status
Accepted

### Context
P22 / P23 のモック HTML コメントは、実装の方が正しい（モックの代表サンプル形は概略）と明示的に認めている:

- **P22 メール変更**: 「実装は本人確認のため『現在のパスワード』入力を要求する」（モックコメント）。
- **P22 パスワード変更**: 「実装は『新しいパスワード（確認）』フィールドを持たず、代わりに『他の端末からはログアウトする』チェックボックス（任意）を持つ」（モックコメント）。
- **P23 プロンプト**: 実装は 5 用途で各カード独立保存。モックは代表 3 用途のみ描画し、グローバル「未保存の変更があります」集約は実装に無い（実装が正）。

### Decision
これらフォーム構造・フィールド有無は変更しない。モックの代表サンプル形へ盲目的に潰さない。本 Issue の P22/P23 への手入れは section-desc 文言整合と新パスワード強度ヘルプ追加（C-2）に限定する。

### Consequences
- 良い点: 実装の本人確認・独立保存といった正しい挙動を退行させない。
- トレードオフ: なし（モックコメント自身が実装を正と認めている）。

---

## ADR-004: ヘルプ/プレビュー表示は backend の実挙動に厳密一致させる（虚偽ヘルプ禁止）

### Status
Accepted

### Context
モックの数値・URL はプレースホルダであり、backend の実値と食い違う:

| 表示 | モック値 | backend 実値 | 根拠 |
|---|---|---|---|
| bio 最大文字数 | 160 | **500** | `valueObject.ts:36,318` / `schema.ts:5` |
| ユーザー名変更レート制限 | 90日 | **30日** | `entity.ts:19,189` |
| 公開 URL ベース | `hollow.example/` | **実 `appUrl` + `/u/`** | `config.appUrl`（`APP_URL` env）/ 公開ルート `/u/$username` / 先行例 `NoteDetail.tsx:99` |
| パスワード強度 | （文言なし） | **12文字以上 + 英字/数字/記号のうち2種以上** | `valueObject.ts:32,136-160` |

加えて、frontend からは取得できない値がある:
- **次にユーザー名を変更できる日付**: `lastUsernameChangedAt` は domain entity にあるが **UserDTO に無い**（`dto/identity.ts`）。
- **最終保存日時**: `lastSavedAt` は存在しない。

### Decision
- 表示する制限値・URL・ルール文言はすべて **backend の実挙動に一致させる**。モックのプレースホルダ値（160 / 90日 / hollow.example）は採らず、実値（500 / 30日 / 実 appUrl）を表示する。
- **frontend から実値が取れない表示は出さない**（虚偽になるため）。具体的には「次にユーザー名を変更できる日付」「最終保存日時」は表示せず、ユーザー名は静的なルール文言「30日に1回まで」のみ表示する。
- 公開 URL プレビューは `appUrl` を `ProfilePage`（server）から prop で渡す。`appUrl` が空（env 未設定）の場合は、ダミードメインを出さず相対 `/u/<username>` 表示にフォールバックする。

### Consequences
- 良い点: ユーザーに虚偽の制限値・誤誘導 URL を見せない。表示と実バリデーションが一致し、入力エラーの予測可能性が上がる。
- トレードオフ: モック図の数値・ドメインとは一致しない（意図的差分）。プレースホルダではなく実挙動を正とする方針を本 ADR に明記して担保する。
