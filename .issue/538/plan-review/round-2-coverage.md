# Plan Review — Issue #538 / Round 2（要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/538/plan.md` / `.issue/538/adr.md`
視点: Issue 要件のカバレッジ、受け入れ基準の検証可能性、基準⇔ステップの紐づけ、スコープ整合性
前提: round 1 指摘（round-1-coverage.md P-001, S-001〜S-003 / round-1-arch-risk.md P-001, S-001〜S-003）の反映確認を含む

## Round 1 指摘の反映確認

| 指摘 | 反映箇所 | 判定 |
|---|---|---|
| coverage/arch P-001（`UploadForm` 経由アップロードの notify 漏れ） | AC-5 文言（「モーダル・`/upload` ページの `UploadForm` の両経路」）、設計 UI #3 の発火点リスト、ステップ 6 の対象ファイル・変更内容、テスト方針（UploadForm の notify 1 ケース）、ステップ 11 のテスト対象、adr.md ADR-002 の Decision | 正しく反映 |
| coverage S-001（AC-5 の対応ステップ列にステップ 6） | AC-5 対応ステップ「1–7, 9」 | 反映 |
| coverage S-002（AC-1/AC-2 の検証可能性具体化） | AC-1: View 型から `waiting`/`editing` 不在・`POLL_*` 削除・`IngestionPreviewForm` 不使用を明示。AC-2: 待機 UI 不在＋「続けてアップロード」「閉じる」の常時操作可能性を明示 | 反映（機械的に判定可能な粒度になった） |
| coverage S-003（spec 170–176 行・18 行の明記） | ステップ 10 に書き換え本体（170–176 行目）と 18 行目（ヘッダー CTA、バッジ波及の整合確認）を明記 | 反映（spec/pages/index.md の現物と行位置が一致することを再確認済み） |
| arch S-001（行アンマウントによるダイアログ強制クローズ） | リスク欄に追記、adr.md ADR-001 Consequences に許容トレードオフとして記録 | 反映 |
| arch S-002（`countByOwner` opts 語彙の理由を JSDoc に） | ステップ 1 の変更内容、adr.md ADR-003 | 反映 |
| arch S-003（`queueBadgeBus` のテスト境界） | ステップ 5 に unsubscribe 返却＋テスト間残留防止（afterEach 解除 or `resetForTest()`）を必須項目として明記 | 反映 |

レビュー履歴セクションの記載と実際の反映内容も一致している（記載漏れ・記載だけで未反映の項目なし）。

## 要件 → 受け入れ基準の対照確認（再）

| Issue 要件 | 対応 AC | 判定 |
|---|---|---|
| 1. モーダルを投げっぱなしに（waiting/editing を抱えない、即解放） | AC-1, AC-2 | カバー |
| 2. キュー側で previewing ジョブのタイトル・ディレクトリ・タグ・Front Matter を編集して保存 | AC-3, AC-4 | カバー |
| 3. キューへの導線整備（成功確認・バッジ、行き来のしやすさ） | AC-5 | カバー（round 1 P-001 の解消で両アップロード経路を網羅） |
| 補足. モーダル前提 ADR（.issue/319 等）との整合確認 | AC-6 | カバー（ADR-004 で supersede を明文化） |

コードベース再照合で確認した事実:

- `app/components/ingestion/UploadForm.tsx` は `uploadFileFn` を直接呼び `routerInvalidate` を行う独立経路で、計画のステップ 6 の追記対象指定は正確。
- `app/components/ingestion/__tests__/UploadForm.test.tsx` は実在し、ステップ 11 のテスト対象指定と一致する。
- `UploadDialog.tsx` に `multiResult` / `queueGuidance` / `POLL_TIMEOUT_MS = 180_000` が現存し、AC-1 の削除対象指定と一致。
- `spec/pages/index.md` の 18 行目（ヘッダー CTA）・20 行目（共通モーダル＋hash）・170–176 行目（単一ファイル主動線「モーダルで完結する」・180 秒タイムアウト誘導）は計画の更新範囲指定どおり。ステップ 10 が「hash 駆動・複数ファイル・フィードバックポリシーは存続」と存続範囲まで切り分けている点も spec の現物と整合する。
- `NoteRepository.countByOwner` の sibling-family JSDoc 文化は実在し、ADR-003 / ステップ 1 の根拠は正しい。

#### 問題点（要修正）

問題点ゼロ。

#### 改善提案（検討推奨）

なし。

#### 良い点

- round 1 の全指摘（P-001 と S 提案 6 件）が、AC 文言・設計・実装ステップ・テスト方針・ADR の各所に漏れなく一貫して反映されており、修正の波及先（AC-5 ⇔ UI #3 ⇔ ステップ 6 ⇔ テスト方針 ⇔ ADR-002）の整合が取れている。
- AC-1 / AC-2 が round 1 の指摘を受けて「View 型に `waiting`/`editing` が存在しない」「待機 UI が存在しない」といったコード・UI の観察可能な事実に落ちており、全 AC が機械的に検証可能になった。
- スコープ統制が維持されている。round 1 反映で追加された作業（UploadForm への notify 1 行、bus のテスト境界手当て、JSDoc 追記）はいずれも既存 AC の達成・検証に直結する最小限であり、スコープ外作業の混入はない。
- 「実装で回避しない」と決めた事項（行アンマウント時のダイアログ強制クローズ、バッジの鮮度遅延）が ADR の Consequences に許容トレードオフとして記録され、テスト時の混同防止の注意までリスク欄に書かれている。

## 結論

要件カバレッジは完全。round 1 指摘の反映はすべて正しく、新たな問題は検出されなかった。計画は実装着手可能な状態にある。
