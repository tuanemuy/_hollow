# PR Review #001 — feat(issue-50): switch FTS5 tokenizer to trigram for CJK partial match

**PR:** #90
**Date:** 2026-05-20
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 11
- Notes: 多数
- Verdict: **BLOCKED**

ブロックは Docs/Spec レイヤーのみ（spec と実装の片肺状態）。Infrastructure/Adapter と Test レイヤーは Blocker なし。

---

## Infrastructure / Adapter

### Blockers
- なし

### Warnings

- **[W-001]** `CREATE TRIGGER` 3 本に `IF NOT EXISTS` が無い (migration 全体の冪等性表現が片肺)
  - 場所: `app/core/adapters/d1/migrations/0008_search_documents_fts_trigram.sql:44-59`
  - 理由: `CREATE VIRTUAL TABLE` には `IF NOT EXISTS` を付け「冪等性のため」とコメントまで明記しているのに対し、トリガー再作成側だけ防御が無く表現不揃い
  - 提案: `CREATE TRIGGER IF NOT EXISTS \`search_documents_ai\` ...` 形式に統一

- **[W-002]** `bulkRebuildFromSnapshots` smoke test の意図と表現
  - 場所: `.issue/50/adr.md` ADR-002 Consequences
  - 提案: ADR-002 の Consequences に「`bulkRebuildFromSnapshots` を将来 production 経路（admin operation/worker）に繋ぐ場合は本 ADR を再評価」を 1 行追加

- **[W-003]** Issue #50 と無関係な import 順序変更が 2 ファイル含まれている
  - 場所: `app/components/export/ExportJobDetail/Page.tsx:1-2`, `infra/src/secrets.ts:1-2`
  - 提案: 別コミット分離済み（`d3cf440 chore: apply biome import-order fix to unrelated files`）。本 PR ではそのままで OK

### Notes
- [N-001] トリガー 3 本のボディが `0001_hollow_schema.sql:391-406` と byte-identical
- [N-002] `Array.from(tok).length` のサロゲートペア絵文字対応は的確
- [N-003] DDL 順序が正しい
- [N-004] FTS join (`sd.rowid = fts.rowid`) は tokenizer 切替に影響を受けない
- [N-005] クラス JSDoc が「trigram 採用」「3 codepoint 制約」「ドメイン契約据え置き」を端的に伝える
- [N-006] FK 制約を踏まえた seed 順序が正しく組まれている
- [N-007] `spec/database/index.md` への反映が plan ステップ 5 と整合
- [N-008] Migration コメントが意図伝達に強い

---

## Test

### Blockers
- なし

### Warnings

- **[W-001]** `bulkRebuildFromSnapshots` テストが「rebuild は wipe + insert である」契約を実際には検証していない
  - 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:295-330`
  - 理由: 先に upsert する "古い内容" は trigram で「デザイン」とマッチしないため、wipe をスキップしても PASS する
  - 提案: (a) Old 側本文にも `デザイン` を含めて wipe 後に消えていることをアサート、または (b) wipe 直後に Old が 0 件であることを別 assert で確認

- **[W-002]** `visibilityFilter` テストのネガティブアサート不足
  - 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:263-293`
  - 理由: `["public"]` で public 1 件しか確認していないため、フィルタが完全に無視されていても偶然成立する可能性
  - 提案: `["private", "public"]` で 2 件返ること、`["private"]` で private 1 件のみ返ることなど、フィルタ軸の動作を 2 ケース以上回す

- **[W-003]** 短トークンテストの body 設計が「ガードが効かなければ偶然ヒットしていた」反証性に弱い
  - 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:221-261`
  - 提案: 軽微。見送り検討。

- **[W-004]** `makeDoc` の `directoryPath` を空文字列 `""` 固定
  - 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:125`
  - 提案: 将来の filter テスト追加時の改善。本 Issue スコープ外として見送り。

### Notes
- [N-001] FK 制約と seed 順序の意図明示
- [N-002] cleanup 経路の正しさ
- [N-003] `🎨` のサロゲートペア絵文字テストが Array.from の意図と一対一で対応
- [N-004] application 層 unit テスト（fake index）への影響なし
- [N-005] `counter` モジュール定数パターンが既存と同一
- [N-006] ケース 6 の意図がコメントで明示
- [N-007] describe/it 構造が既存スタイル整合
- [N-008] サイズアサートのみのケースが多い（混在検索でも noteId 比較を入れると検出力向上）
- [N-009] 自動/手動の役割分担が妥当

---

## Documentation / Spec

### Blockers

- **[B-001]** `spec/scenario/browse.md:36` の「日本語形態素 + 部分一致」が本 PR で実装した trigram と矛盾している
  - 場所: `spec/scenario/browse.md:36`
  - 理由: シナリオ E3 は「形態素 + 部分一致 + メタデータ優先ランキング」と謳っているが、本 PR が採用したのは形態素解析ではなく文字 trigram。`AI`/`Go`/`UI` のような 2 codepoint クエリが構造的に 0 件になる挙動は「形態素 + 部分一致」の自然な解釈と一致しない
  - 提案: E3 を「N-gram（trigram）ベースの部分一致 + メタデータ優先ランキング」等に置換

- **[B-002]** 1–2 codepoint クエリの構造的 0 件後退がシナリオ/ページ仕様/マニュアルテストに反映されていない
  - 場所: `spec/scenario/browse.md` E3 異常系、`spec/pages/index.md:115`、`spec/manual-tests/browse.md`
  - 理由: trigram 移行で新規に発生する「クエリ短すぎ（< 3 codepoint）で構造的に 0 件」がユーザー観測可能な仕様変化なのに spec に記述がない
  - 提案: spec/scenario/browse.md E3 異常系に追記、spec/manual-tests/browse.md に TC-005 と等価ケースを追加

### Warnings

- **[W-001]** `spec/domains/search.md` の `SearchQuery` バリデーション記述（`keyword` 長さ 1..200）が trigram の下限と片肺
  - 場所: `spec/domains/search.md:68`
  - 提案: 「ドメイン契約は 1..200 不変、D1 adapter は trigram の制約により 3 codepoint 未満を内部除外」と注記追加

- **[W-002]** `spec/pages/index.md:115`（P10 検索結果画面の責務記述）に「短すぎるクエリ時の UX」が落ちている
  - 提案: 「クエリが短すぎる場合は通常の 0 件ヒット扱い（UI ヒント追加はフォロー Issue）」と追記

- **[W-003]** `.issue/29/adr.md` ADR-006 の Status が `Superseded by Issue #50` に更新されていない
  - 場所: `.issue/29/adr.md` ADR-006
  - 提案: Status を `Superseded by Issue #50` 相当に更新、または Decision の最後に「→ Issue #50 で解消」のクロスリファレンス追記

- **[W-004]** `app/core/adapters/d1/schema.ts:632-635` のコメントが trigram 移行を反映していない
  - 場所: `app/core/adapters/d1/schema.ts:632-635`
  - 理由: 「The CREATE statement lives in the migration SQL」が指す migration が `0001` か `0008` か曖昧
  - 提案: 「現行 tokenizer 定義は `migrations/0008_search_documents_fts_trigram.sql`（`0001` での初期定義は同 migration で drop/recreate される）」を追記

### Notes
- [N-001] PR description のコマンド整合性 OK
- [N-002] searchIndex.ts のクラス/関数 JSDoc が WHY 明記で良好
- [N-003] migration 冒頭コメントの意図伝達 OK
- [N-004] ADR-001/002/003 と PR description の trade-off が一致
- [N-005] spec/database/index.md L456 の追記は簡潔かつ実装と一致

---

## Design Decisions

- B-001 への対応として `spec/scenario/browse.md` の E3 を「N-gram（trigram）ベース部分一致」に書き換えるが、formal な ADR は作らない（実装に合わせて spec を直す spec-sync の範疇）。
- W-003 反映として `.issue/29/adr.md` ADR-006 のクロスリファレンス追記は本 PR で対応する（同じ Issue の流れの中で発生した spec/ADR 同期の宿題）。

---

## 対応方針

- Blockers (B-001, B-002): その場で修正（spec の片肺解消）
- Warnings 採用: Infra W-001, W-002 / Test W-001, W-002 / Docs W-001, W-002, W-003, W-004
- Warnings 見送り: Infra W-003（既に対応済み）、Test W-003（軽微）、Test W-004（スコープ外）
