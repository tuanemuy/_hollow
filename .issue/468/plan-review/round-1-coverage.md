# Plan Review — Issue #468 / Round 1（要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/468/plan.md` / `.issue/468/adr.md`
視点: Issue 要件のカバレッジ、受け入れ基準の検証可能性、基準↔ステップの紐づけ、スコープ整合性

## 要件トレース（Issue → 受け入れ基準）

Issue #468 本文（コメントなし。`gh issue view 468 --comments` で確認）の要求は次の2点。

| Issue の要求 | 計画での受け皿 | 判定 |
|---|---|---|
| 課題1: 保持/回収ポリシーを決める（TTL の要否・対象・猶予期間） | AC-1 → ADR-001 + ステップ9（spec/domains/media.md 明文化） | カバー。要件は「要否を決める」なので「TTL 不採用の正式決定 + 明文化」で充足する |
| 課題2: 孤児 source blob のリクレーム手段（キー走査バッチ or pruner worker への組み込み） | AC-2（自動回収の実証）+ AC-3（pruner 配線）→ ステップ4-8 | カバー。Issue が提示した2案のうち pruner 組み込みを採用し、キー走査は ADR-002 で理由付きで不採用 |
| （課題2の安全性・既存互換 — 要件に内包） | AC-4 / AC-5 | カバー |

Issue 本文の「段階的アーカイブ」への言及もスコープ外セクションで ADR-001 に紐づけて明示的に処理されており、暗黙の取り落としはない。

## 計画の事実主張の検証結果

計画の「調査結果」セクションの主張を実コードと突き合わせた。**すべて正確**。

- `purgeOrphans` の呼び出し元ゼロ: grep で確認（`app/core/application/media/purgeOrphans.ts` はテスト以外から参照なし）。一方 `spec/usecases/media.md` L101-104 は「PurgeOrphans（バッチ）/ Cron 起動」と定義 — 乖離の指摘は正しい。
- `commitIngestionPreview.ts` L97-105 のコメントが「blob is orphaned with no MediaAsset row … an accepted edge」と明記しており、課題2の発生機構の説明と一致。
- `MediaAsset.decrementRef(pending) → orphan` は `app/core/domain/media/entity.ts` L136-153 に「Intake abandoned without ever attaching」のコメント込みで実在。新しい状態遷移を増やさない主張は正しい。
- `findPurgeableOlderThan` は `status IN ('orphan','deleting')` のみ対象 — `uploadMediaPresigned.ts` L29 の JSDoc「`PurgeOrphans` worker reclaims it」が実態と乖離している指摘も正しい。
- infra ドリフト: `infra/templates/wrangler.production.toml.tmpl` / `wrangler.staging.toml.tmpl` の `[env.pruner]` には `OBJECT_STORAGE` binding / `R2_OBJECT_BUCKET_NAME` が無い（ローカル `wrangler.toml` L301 以降には #783 のコメント付きで有る）。`serverCloudflare.ts` L754-756 で binding + presign config のどちらかが欠けると unavailable フォールバックになることも確認 — 「本番 purge が空振りする」は事実。
- `idx_media_status_updated (status, updated_at)` は `0001` / `0014` マイグレーションに実在し、マイグレーション不要の判断は妥当。
- `dispatchDomainEvent.ts` L108-109 で `media.*` は skip — sweep 起点の `media.orphaned` が consumer に影響しない主張は正しい。
- キーレイアウト `{ownerId}/source/{mediaId}` に source 共通プレフィックスが無い（ADR-002 のキー走査不採用の根拠）も `buildStorageKey` の構造と一致。
- ステップ8の対象ファイル `ingestion.integration.test.ts`、ステップ5の `purgeOrphans` と同型のオプション設計（`purgeOrphans.ts` L10-23 の default 24h/100）も実在の構造と整合。

## 問題点（要修正）

問題点ゼロ。

Issue の要求2点はいずれも受け入れ基準に落ちており、各基準は検証手段（テスト / spec 記載 / 配線の存在）が明示され、基準↔ステップの対応表も成立している。スコープ外項目（過去に漏れた blob、他 kind の pending、opt-in TTL）はすべて理由と ADR への紐づけ付きで明示されており、暗黙のスコープ縮小はない。以下はいずれも計画の骨格を変えない精度向上の提案。

## 改善提案（検討推奨）

- **[S-001]** ステップ8の `purgeOrphans` 実行手順の記述が実装挙動と食い違う（「age 0 → markDeleting、再実行で purge 完了」）
  - 理由: `purgeOrphans` は候補1件につき同一イテレーション内で UoW1（markDeleting）→ UoW2（purge 完了）まで進むため、「再実行」は不要（`purgeOrphans.ts` L57-91）。逆に本当に注意が要るのは cutoff の strict 比較（`updated_at < now - ageSec`）で、fake clock のテストでは sweep が orphan 化した時刻と同時刻に `purgeOrphans(age 0)` を呼ぶと `updated_at < now` が偽になり候補に載らない。ステップ5のテスト⑤にも同じ注意が当てはまる。記述のままだと実装者がテストの失敗原因（clock 前進漏れ）を「2回実行が必要」と誤読する余地がある。
  - 提案: ステップ8を「sweep 後に clock を前進（または cutoff より過去に updatedAt を据える）→ `purgeOrphans` 1回で markDeleting + purge が完了することを assert」に書き直す。

- **[S-002]** ステップ7の `secrets.ts` 変更（pruner を `[...shared, ...dispatchExtras]` に）が「ドキュメントとしての正確性の回復」という自らの目的と矛盾する
  - 理由: `dispatchExtras` は R2_* 3種だけでなく `SECRET_BOX_MASTER_KEY` / `ADMIN_LLM_API_KEY` を含む5種（`infra/src/secrets.ts` L88-94）。pruner が実際に消費するのは R2 presign 3種のみ（`createRequestContainer` の `R2ObjectStorage` 構築要件）なので、`dispatchExtras` 丸ごとの付与は過剰宣言となり、計画本文の「（R2_* 3種）」という括弧書きとも食い違う。bulk push の実態は変わらないため runtime 影響はないが、spec としての正確性が目的なら逆効果。
  - 提案: `dispatchExtras` を `r2PresignExtras`（R2_* 3種）と LLM/暗号系に分割し pruner には前者のみを列挙する、または現行の「documentation-only until per-worker filtering lands」コメント（L83-87）の pruner 言及だけを更新して secrets リスト自体は触らない。どちらにするかを計画に明記する。

- **[S-003]** ADR-002 が約束する「手動リコンサイル手順を運用ノートとして残す」に対応する成果物ステップがない
  - 理由: ADR-002 は過去に漏れた blob の補完手段として手動手順を「運用ノートとして残す」と宣言しているが、実装ステップ1〜9のどこにもその書き出し先がない（ステップ9の spec 更新にも含まれない）。ADR 本文にしか手順が存在しないと、運用時に参照される場所（`docs/runtime_cloudflare.md` が運用ガイダンスの置き場）から辿れない。スコープ外判断（自動回収しない）自体は妥当なので、手順の置き場だけの問題。
  - 提案: ステップ9に `docs/runtime_cloudflare.md` への手動リコンサイル手順の追記を含めるか、ADR-002 の文言を「本 ADR 記載の手順を記録とする（別ドキュメント化はしない）」に改めて宣言と成果物を一致させる。

- **[S-004]** ステップ9の spec/testcases 更新が media 側のみで、commit のロールバック→pending 残存という新しい観測可能挙動が `spec/testcases/ingestion/index.md` に載らない
  - 理由: ステップ4で commit の挙動契約が変わり（DB ロールバック時に `pending/source` 行が残る）、ステップ8でそれを検証するテストが ingestion の integration test に入るのに対し、testcases spec の追記先は `testcases/media/index.md`（sweep のテーブル）のみ。現状の `testcases/ingestion/index.md` は source 永続化に一切触れていない（#452 時点からの粒度）ため既存粒度との整合とも言えるが、ステップ8のテストに対応する spec 行がどこにも無い状態になる。
  - 提案: `testcases/ingestion/index.md` の Commit 行に「メイン UoW ロールバック → `pending/source` 行が残存し sweep が回収」の1行を足すか、media 側テーブルに置く場合はその判断（ingestion testcases は source 非掲載の既存粒度を維持）を計画に一言残す。

## 良い点

- **受け入れ基準表の設計が模範的。** 各 AC に「由来」（Issue のどの課題か）と「対応ステップ」の双方向トレースがあり、カバレッジ検証がそのまま可能な構造になっている。AC-1 のような「決定 + 明文化」型の要件も検証可能な形（ADR と spec への記載の存在）に落とせている。
- **調査結果の正確性が非常に高い。** 検証した全主張（purgeOrphans 未配線、infra テンプレートドリフト、JSDoc 誤記、インデックス、キーレイアウト、イベント skip）が実コードと一致した。特に「purgeOrphans がどこからも呼ばれていない」という発見は本 Issue の回収チェーン全体の前提であり、これを見落とすと AC-2/AC-3 が空文になるところだった。
- **スコープ外セクションの明示性。** 過去に漏れた blob・他 kind の pending・opt-in TTL・ポート `list` 追加・put リトライの5項目すべてに理由と ADR 参照が付いており、「やらないこと」の合意可能性が高い。ADR-004 の「対象限定をメソッド名（`findAbandonedSourceIntakes`）で表明する」判断は CLAUDE.md の「illegal states unrepresentable」原則の良い適用。
- **Issue が提示した実装案（キー走査）を鵜呑みにせず、より安全な設計に置き換えた上で不採用理由を ADR-002 に残している。** キーに共通プレフィックスが無い事実・in-flight blob の誤検知リスク・`uploadMediaPresigned` との同型性という3つの根拠はいずれも実コードで裏が取れた。
- **付随修正（#783 infra ドリフト、purgeOrphans 配線、JSDoc 誤記）のスコープ内判定がすべて正当。** どれも AC-3（回収チェーンが本番で実際に動く）の達成に必要か、本 Issue の変更が触れる箇所の誤記訂正であり、便乗的なスコープ拡大ではない。
