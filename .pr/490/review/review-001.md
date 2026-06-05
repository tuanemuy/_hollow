# PR Review #490 — 設定画面を /_app 共通シェルに寄せ、設定専用 Sidebar を維持（Issue #486）

**PR:** #490
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 3
- Warnings: 4
- Notes: 17
- Verdict: **BLOCKED** （Blocker 3 件解決待ち）

---

## Testing・検証・ドキュメント

### Blockers

**[B-001] ADR ステータスが実装後も「Proposed」のままで、「Accepted」に更新されていない**
- 場所: `.issue/486/adr.md:11, 33`
- 理由: ADR は意思決定ドキュメント。実装・コミット完了を反映し、ステータスは「Accepted」に変更される必要がある。
- 提案: `adr.md` を修正し、ADR-001・ADR-002 のステータスを「Accepted」に変更。

**[B-002] PR説明に `pnpm typecheck && pnpm lint:fix && pnpm format` の実行確認結果が記載されていない**
- 場所: PR 本体の「Test plan」セクション
- 理由: ルート移動による型 ID 変更（`/settings/profile` → `/_app/settings/profile`）に追随するため、typecheck 通過は重大な確認項目。testing.md チェックリスト第一項目で要求だが PR 説明に記載がない。
- 提案: PR 説明に「## Static Analysis & Formatting」セクションを追加。`pnpm typecheck` / `pnpm lint:fix && pnpm format` の実行結果を記載。

**[B-003] PR説明に `pnpm test:unit` 実行結果の記載がない**
- 場所: PR 本体 / testing.md チェックリスト 122 行目
- 理由: ルート移動による既存テストへの影響確認が必須だが、実行状況が不明。PR 説明の「Browser Verification」では browser tests のみ報告。
- 提案: PR 説明に「## Unit Tests」セクションを追加。`pnpm test:unit` 実行結果を記載（Pass: 3117/3117 等）。

### Warnings

**[W-001] テスト結果ファイル TC-006 で「バックドロップクリックで閉じる」が未検証**
- 場所: `.issue/486/manual-test/results/TC-006.md:321 行目`
- 理由: `testing.md` 確認項目で「Escape やバックドロップクリックでも閉じる」と明記だが、結果ファイルは「Escape で確認済み、バックドロップは省略」。
- 提案: TC-006 を再実行してバックドロップクリックを確認し結果を記載。または testing.md 期待結果を「Escape キーのみ」に限定。

**[W-002] testing.md チェックリスト項目「各設定フォームの送信が従来どおり動く」が manual-test 結果ファイルに含まれていない**
- 場所: testing.md:121 行目 / `.issue/486/manual-test/results/` 配下
- 理由: チェックリストに列挙だが、該当テスト結果（TC-007 等）がない。既存機能への影響確認セクション (104 行目) では要求だが、実施確認が未ドキュメント化。
- 提案: フォーム送信テストを実施し TC-007.md に記載。または testing.md チェックリストから削除して「unit test でカバー」と明記。

---

## Frontend・UI コンポーネント

### Blockers

なし

### Warnings

**[W-003] `SettingsSidebarNav` で `activeOptions` を使い分けしていない点**
- 場所: `app/components/identity/SettingsSidebarNav.tsx:40-46`
- 理由: ライブラリ Sidebar の `Home` リンク（`/`）は `activeOptions={{ exact: true }}`、他は指定なし。`SettingsSidebarNav` も指定なし。子ルートなし・重複リスク低いため実装上問題なし。
- 提案: コメント（既存）で意図を明記、または念のため `exact: true` を付与（optional）。

**[W-004] `inSettings` 判定が pathname リテナーに依存している点**
- 場所: `app/components/layout/AppShellDrawer.tsx:83`
- 理由: `pathname.startsWith("/settings")` で単純判定。将来 `/settingsData` のような別パスが追加された場合の誤マッチリスク（低確率）。
- 提案: 現状実装で問題なし（ADR で許容）。将来的には route ID ベース判定への移行を検討。

---

## Architecture・設計原則

### Blockers

なし

### Warnings

**[W-005] 設定セクション外での `<SettingsSidebarNav />` 要素生成**
- 場所: `app/routes/_app/route.tsx:129`
- 理由: 非設定画面では描画されない。ADR で許容済みの「要素生成のみで mount されないため実コストはほぼゼロ」だが、最適化余地あり。
- 提案: 現状保持が妥当。必要なら将来 Issue で条件生成最適化。

**[W-006] `AppShellDrawer` に残された pathname 判定ロジック**
- 場所: `app/components/layout/AppShellDrawer.tsx:83`
- 理由: 汎用シェル層に `/settings` という路由知識が残る（ADR で許容）。複数ルートへの拡張時、複雑化の可能性。
- 提案: 現状設計で十分。複数ルートへの拡張時は higher-order 関数化検討。

---

## 良い点（Notes）

### Frontend・UI コンポーネント
- **[N-001]** `SettingsSidebarNav` の実装が `Sidebar.tsx` 構造と完全一致。Design Token 再利用で一貫性確保。
- **[N-002]** `AppShellDrawer` の三項演算子分岐が明確で安全（undefined fallback）。
- **[N-003]** Accessibility 実装が完全。`aria-label` / `aria-current` / drawer `role="dialog"` / `aria-modal`。
- **[N-004]** Props 型定義の精度。`settingsSidebar?: ReactNode` が optional 正確。
- **[N-005]** スタイルレイヤーの清理が徹底。重複定義解消完全。
- **[N-006]** Responsive 挙動の自動継承完全（モバイル drawer、sticky）。
- **[N-007]** Type-safe な settings リンク navigation（union type）。
- **[N-008]** Manual test 全 8 件 PASS（TC-001～TC-006、EDGE-1～2）。
- **[N-009]** JSDoc コメントで実装意図が明確。

### Architecture・設計原則
- **[N-010]** file-based routing と pathless layout 連携が正確。`fullPath: '/settings/profile'` 正確生成。
- **[N-011]** RSC ペイロード設計と server/client 境界が保持（ADR-002 整合）。
- **[N-012]** スロット設計が明確で再利用性高い。
- **[N-013]** レイアウトトークン統一が完全。`layout/styles.ts` 再利用、identity は form/error のみ。
- **[N-014]** キャッシュ機構（`staleTime: Infinity`）が温存。ホーム往復でも Sidebar RSC 再計算なし。
- **[N-015]** 認証ガードが `_app` 規約に統一。未認証→`/`（landing）で他ルートと一貫。
- **[N-016]** 差し替え判定が pathname 前方一致で安全。
- **[N-017]** 手動テスト結果が包括的。8 テストケース全 PASS で実装意図検証完全。

### Testing・検証・ドキュメント
- **[N-018]** ADR ドキュメント品質が高い。Context / Decision / Consequences が充実。
- **[N-019]** 設計と実装の整合性が高い。plan.md ステップと実装が対応完全。
- **[N-020]** 手動テストのカバレッジが充実。UI/UX レグレッション確認十分。
- **[N-021]** 公開 URL 不変の保証が確認。canonical パス不変で保持。

---

## Design Decisions

このラウンドで見つかった設計判断：

1. **ADR ステータスの更新遅延** — 実装完了後、ステータスを「Proposed」→「Accepted」に変更すべき。

2. **Testing チェックリスト項目の実施確認** — フォーム送信テスト（TC-007）を実施し、結果を記録。

3. **PR 説明の補足** — Static Analysis（typecheck / lint / format）と Unit Tests（pnpm test:unit）の実行結果を追加記載。

---

## 修正方針

**Blocker 3 件は以下の順で修正:**

1. **B-003 (Unit Tests) の確認と記載** — 既に実行済み（3117/3117 PASS）。PR 説明に追記。
2. **B-002 (Typecheck / Format) の確認と記載** — 既に実行済み（パス）。PR 説明に追記。
3. **B-001 (ADR Status)** — `.issue/486/adr.md` の ADR-001・002 を「Accepted」に更新。
4. **W-002 (フォーム送信テスト)** — ブラウザで確認するか testing.md から削除。

修正後、再レビュー → review-002.md
