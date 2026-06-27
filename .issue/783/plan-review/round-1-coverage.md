# Round 1 レビュー — Issue 要件カバレッジ・スコープ整合性

対象: `.issue/783/plan.md` / `.issue/783/adr.md`
視点: Issue #783 の要件カバレッジ・スコープ整合性

---

#### 問題点（要修正）

- **[P-001]** export `completed` 行を除外する判断（ADR-003 / AC-2）の「恒久蓄積は起きない」という前提が、実コード上で成立していない。`purgeExpiredExports` は現状どのワーカー/cron にも配線されておらず、completed → expired 遷移が運用上一度も走らない。結果として、本計画を実装しても **export_jobs の `completed` 行（健全運用では終端 export 行の大半）が無期限に蓄積し続け**、Issue の中核ゴール「stop growing without bound」が export の最大ボリューム部分について満たされない。
  - 理由:
    - ADR-003 の根拠は「`completed` → `purgeExpiredExports`（expired 化）→ 本 prune（expired を retention で削除）」という連鎖である。第一リンク（purge による expired 化）が走らなければ、completed を prune 対象から外した時点で completed 行は永久に残る。
    - 実コード確認結果: `purgeExpiredExports` への参照は定義箇所と `.issue/3/adr.md` のみ。`app/worker/cloudflare/{pruner,handlers}.ts`・`server.cloudflare.ts`・DI・wrangler.toml のいずれにも呼び出しは存在しない。`.issue/3/adr.md` ADR-003 は `purgeExpiredExports` を「cron 駆動を**想定**」と記すのみで、選択肢3（追加実装しない）を採用しており、実際の trigger は未配線。
    - export entity の不変条件（`completed` は必ず `expiresAt: Date` を持つ）と `findExpired`（`status='completed' AND expiresAt<now` を拾う）自体は計画の記述どおり正しい。問題は不変条件ではなく、それを駆動する purge が動いていない点にある。
    - 計画のリスク節は「**万一** expiry が滞ると completed 行は残るが…purge の健全性の問題であり本 prune の責務外」と*稀なヒカップ*として描いているが、実態は「purge が構造的に常時走っていない＝completed は確定的に蓄積する」であり、リスク記述が現状を過小評価している。
    - 補足: orphan 回避の観点では ADR-003 の「completed 除外」は正しい。purge が未配線の現状で completed（artifact 残存）を年齢だけで削除すれば確実に R2 を orphan 化するため、AC のハード制約（artifact を orphan 化しない）を満たすには completed を除外せざるを得ない。つまり P-001 は「除外判断が誤り」ではなく「除外の代償（completed の無限蓄積）を解消する経路が現状塞がっている」という被覆ギャップである。
  - 提案: 次のいずれかを取り、計画の主張と Issue ゴールを整合させる。
    - (a) **推奨**: `purgeExpiredExports` を本 Issue のスコープに取り込み、`runPruneTick` 内で export-jobs prune の**前段**に best-effort 配線する（completed→expired→prune の連鎖を tick 内で確実に閉じる）。これにより export の completed を除外したまま無限蓄積を防げ、Issue ゴールを完全充足できる。purge は UoW を使うため `createWorkerContainer` に UoW 供給が要るか等、配線可否を事前確認すること。
    - (b) purge 配線を別 Issue に切り出す場合は、計画から「恒久蓄積は起きない」という断定を撤回し、「purge が別途稼働するまで export `completed` 行は無期限に残る既知の残課題」と明記したうえで、Issue オーナーにそれが受容可能か確認する。少なくともリスク節の「万一…滞ると」表現を「現状 purge は未配線のため確定的に残る」に修正する。

#### 改善提案（検討推奨）

- **[S-001]** 受け入れ基準表の「対応ステップ」列が、終端フィルタ/`completed` 除外を実装する**ステップ4（D1 アダプタ）を AC-1/2/3/4/8 のどれにも紐づけていない**。
  - 理由: 「終端のみ削除」「非終端不可侵」「completed 除外による orphan 回避」という AC-1/2/3/4/8 の検証対象の挙動は、すべてステップ4の DELETE 述語（`inArray(status, terminalSet)` + `lt(updatedAt, cutoff)`、export は `['failed','cancelled','expired']`）で実現される。実際ステップ4自身の「理由」は「(AC-1/2/3/4/8)」と自己申告している。一方 AC 表はステップ4を一切参照せず `1,3,8` 等になっており、AC↔実装ステップのトレーサビリティが食い違う。実装者/検証者が「終端フィルタはどこで担保されるか」を AC 表から辿れない。
  - 提案: AC-1/2/3/4 の対応ステップにステップ4を追加し、AC-8 にもステップ4（completed 除外の構造的実装）を含める。あわせて AC-5 は DEFAULT 定数を定義するステップ3も対応に含めると正確（日単位デフォルトの値はステップ3で定義され、ステップ5はそれを import するだけ）。

#### 良い点

- スコープ規律が明確。「含まれないもの」節で purge 変更・schema/migration・集約リポジトリへの prune 追加・cron 変更を明示的に除外しており、ゴールド・プレーティングや scope creep は見られない。
- Issue Tasks / AC が漏れなく AC 表に落ちている（tag_merge 削除・export 削除・PruneTuning 拡張・runPruneTick 配線・非終端保持・最近行保持・テスト要件）。AC 表に「由来」列を設け Issue 文言へ逆引きできる点はトレーサビリティとして優秀。
- ADR-003 の orphan 回避ロジックは、export entity の status 別不変条件（completed/expired=artifactKey 有、failed/cancelled=null）を実コード根拠として正しく参照しており、AC のハード制約「artifact を orphan 化しない」を構造的に満たす設計になっている。
- tag_merge 側は artifact を持たないため `completed` を終端集合に含める判断が正しく、tag_merge については Issue ゴール（無限蓄積防止）を完全に充足する。export 側の completed のみが P-001 の論点で、ADR-003 がこの非対称性（除外は export 固有）を正しく言語化している。
- テスト方針が「古い completed export は**保持**（orphan 回避の固定）」「古い pending/processing は保持」を integration で固定する形になっており、AC-2/3/8 を検証可能な形に落とせている。

---

### サマリー
- 問題点: 1 / 改善提案: 1
- `[P-001]` export `completed` 除外の「恒久蓄積なし」前提が未配線 purge により成立せず、completed export 行が無限蓄積（Issue ゴール未充足）
- `[S-001]` AC 表の対応ステップが終端フィルタ実装のステップ4を AC-1/2/3/4/8 に紐づけていない（トレーサビリティ不整合）
