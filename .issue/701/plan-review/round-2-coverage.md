# Round 2 レビュー — Issue #701 計画（観点: 要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/701/plan.md` / `.issue/701/adr.md`
観点: 受け入れ条件7項目の AC への網羅・検証可能性、Round 1 指摘の解消、スコープ外混入の有無。

## Round 1 指摘の解消確認

| Round 1 指摘 | Round 2 での状態 | 判定 |
|---|---|---|
| **P-001**（AC-6「失敗の明示」が二択未確定で観測不能） | ADR-005 を Accepted に確定。「`class="ingestion-failure-note"` の段落＋空相当本文＋`previewing` 到達＋本文追記して commit 可」という観測可能文に AC-6 を書き換え。`IngestionPreview` VO は変更しない方針も確定。 | ✅ 解消 |
| **P-002**（AC-1 接続テストの検証境界が曖昧） | AC-1 に「接続テストは provider のモデル存在/認証を probe で確認するまでが合格条件（transcribe 実音声疎通は含まない）」を明記。ADR-006 を Accepted にし、transcribe 疎通を AC-3／手動へ割当。 | ✅ 解消 |
| **S-001**（AC-3 アップロード導線がステップに未出現） | ステップ15に DropZone の `accept` が `audio/*` を受理するかの確認タスクを追加。AC-3 の対応ステップに 15 を追加。 | ✅ 解消 |
| **S-002**（AC-5 回帰確認の所在） | AC-5 に録音由来 Blob のメタデータ欠落確認を明記し、ステップ16・テスト方針の手動 TC に紐づけ。 | ✅ 解消 |

Round 1 の coverage 指摘 4 件（P-001 / P-002 / S-001 / S-002）はすべて反映済み。arch 側 S-001〜S-005 も plan.md レビュー履歴どおり取り込まれている。

## 事実確認（Round 1 の前提が Round 2 でも成立するか）

Round 1 の主張が依拠する実コードを再確認した:

- `runIngestionJob.ts` の `runPipeline` は `html` / `markdown` / **`else`** の 3 分岐で、`audio` は `else`＝`structureToHtml` 必須経路を通る。さらに `else` ブロック後段で `suggestMetadata` も無条件に走る。**ADR-005 が「audio は LLM 必須経路を通る」という前提は正しい**。よって「空 transcript を `structureToHtml` に流さず縮退分岐に逃がす」という設計判断は妥当。
- `IngestionPreview.create` の `title` は `titleSuggestion.trim().length > 0 ? ... : fallbackTitle(...)` でガード済み、`contentHtml` は `ContentHtml.create(html)` をそのまま通す。**縮退分岐で `fallbackTitle` ＋固定注記 HTML を渡せば VO 不変条件を通る**という plan の検証は実コードと一致。
- `UploadForm.tsx` / `UploadDialog.tsx` の DropZone には静的な `accept` 属性が無く、受理判定は本文ロジック（`detectKind` 系の MIME/拡張子判定）で行われている。**S-001 を「確認タスク」に落とした判断は適切**（`accept` 制約が固定されていない＝確認が必要、という前提が実コードで裏付けられた）。

Round 1 の前提は Round 2 でも崩れていない。

---

## 問題点（要修正）

問題点ゼロ。

受け入れ条件7項目はすべて AC-1〜7 に1対1で写像され、Round 1 で唯一観測不能だった AC-6 が確定形に書き換えられたことで、**7項目すべてが検証可能な合否境界を持つ**状態になった。スコープ外混入もなし（「含まれないもの」節で `UserSpeechOverride`／locale 可変化／第2プロバイダ／Workers AI 経由／話者分離を根拠付きで除外、ユーザー方針1〜3とも整合）。

---

## 改善提案（検討推奨）

- **[S-001]**（軽微・任意）AC-6 の「commit 可」の検証を AC 表の「対応ステップ」が拾い切れていない。
  - 理由: AC-6 の合否は「失敗注記表示」＋「`previewing` 到達」＋「本文追記して **commit** できる」の 3 点だが、対応ステップは `5`（=`runIngestionJob` の縮退分岐）のみ。注記表示と `previewing` 到達はステップ5で担保されるが、「本文を追記して commit が通る」部分は既存 `commitIngestionPreview` の挙動（空本文→追記後の本文で commit）に依存しており、ステップ・テスト方針で明示的な確認対象になっていない。テスト方針の AC-6 項も「(1) LLM 未呼出 (2) 注記含有 (3) `previewing` 到達」までで、commit までは追っていない。実装上はほぼ確実に通る（`ContentHtml.create("")` 許容済み・commit は format 非依存）ため必須ではないが、手動 TC（ステップ16）に「縮退 preview から本文追記 → commit 成功」の一手を1行足すと AC-6 の最終節が観測対象に入る。Round 1 の AC-5 回帰（S-002）を手動 TC に明記したのと同じ粒度の補強。

---

## 良い点

- **Round 1 指摘の解消が誠実かつ実証的**。P-001 / P-002 を「二択を1つに decide して観測可能文へ」という Round 1 提案どおりに処理し、ADR-005 / ADR-006 の Status を Accepted に更新。特に AC-6 は実コード調査（`audio` が `else`＝LLM 必須経路を通る／`ContentHtml.create("")` 許容／サニタイザが `data-*` を剥がすため `class` を使う）に基づいて確定しており、机上の二択回避ではなく実装可能性まで詰まっている。
- **要件カバレッジが完全**。7条件すべてが AC に写像され、各 AC に「由来」「対応ステップ」が併記。AC-1 / AC-3 / AC-5 / AC-6 に検証境界（probe まで／実音声疎通の割当／メタデータ欠落回帰／縮退保存の観測点）が明記され、合否判定が一意。
- **スコープ整合性が維持**。Round 1 で「混入ゼロ」と評価した除外項目に変化なし。新規追加された確認タスク（ステップ15 の `accept` 確認、AC-5 メタデータ回帰）はいずれも既存 AC の検証強化であってスコープ拡大ではない。
- **テスト方針が AC に追従**。AC-6 の LLM 未呼出（spy 0 回）・注記含有・`previewing` 到達、AC-5 の録音由来 Blob メタデータ欠落回帰が具体的なテスト対象に落ちており、Round 1 で「観測対象に落ちていない」とした懸念が解消されている。

---

## 総評

Round 1 の coverage 指摘 4 件（P-001 / P-002 / S-001 / S-002）はすべて解消済み。受け入れ条件7項目は検証可能な合否境界を持って AC に網羅され、スコープ外混入もユーザー方針との齟齬もない。残る論点は AC-6 の「commit 可」を手動 TC に1行足すと最終節まで観測対象になるという軽微な改善提案1件のみで、これは必須修正ではない。**要件カバレッジ・スコープ整合性の観点では計画は承認水準に達している。**
