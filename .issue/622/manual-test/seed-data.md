# シードデータ — Issue #622 (P31 公開ノート詳細)

- 投入日: 2026-06-13
- 対象: local D1 (`hollow-local-d1`)。`pnpm db:apply:local`（適用済み・差分なし）、`pnpm seed:dev-admin`（冪等）、`pnpm db:execute:local .issue/622/manual-test/seed.sql`（冪等・再実行可）

## アカウント

- username: `dev-admin` / email: `dev-admin@example.com` / role: admin
- セッショントークン: `dev-admin-session-token`（cookie `__Host-session` に設定すればログイン状態。P31 の閲覧自体は匿名で可）
- owner_id: `01950000-0000-7000-8000-000000000001`

## テストノート（すべて public / active / dev-admin 所有）

| 用途 | slug | URL (P31) |
|---|---|---|
| 複数タグ（design, test, guide）＋バックリンク2件＋関連ノートあり | `p31-multi-tags-note` | `/u/dev-admin/p31-multi-tags-note` |
| タグ無し（bottom-meta の日付右寄せ検証） | `p31-no-tags-note` | `/u/dev-admin/p31-no-tags-note` |
| バックリンク元1（公開） | `p31-backlinker-1` | `/u/dev-admin/p31-backlinker-1` |
| バックリンク元2（公開） | `p31-backlinker-2` | `/u/dev-admin/p31-backlinker-2` |

- メインの検証対象は `p31-multi-tags-note`（note id `01950622-0000-7000-8000-000000000001`）。バックリンクセクション（2件）・関連ノート（同著者の他公開ノート）・タグ付き bottom-meta がすべて揃う
- タグリンク遷移先 (AC-3): `/u/dev-admin?tags=["design"]` 等（P30: `/u/dev-admin`）
- ID ベース公開 URL のスポット確認: `/notes/public/01950622-0000-7000-8000-000000000001`
- モバイル幅折り返し検証（タグの多いノート）は `p31-multi-tags-note`（タグ3件）を使用

## 備考

- `.issue/621/manual-test/seed.sql` は slug `a` の UNIQUE 衝突（既存ノートと競合）で再適用不可だったため、#622 専用シード（固定 ID `01950622-...`、FK 子から DELETE → INSERT の冪等構成）を新規作成した
- バックリンクは `note_internal_links.resolved_note_id` で解決される（`findReferrers`）。`ref_kind='id'` で投入済み
- 関連ノートは「同著者の他の公開ノート」を自動取得するため専用データ不要（dev-admin の既存公開ノート＋本シードの3件で成立）
