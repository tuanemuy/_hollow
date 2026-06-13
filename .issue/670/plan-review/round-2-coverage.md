# Plan Review Round 2 — 要件カバレッジ・スコープ整合性（Issue #670）

レビュー視点: round-1 反映後の収束確認。受け入れ基準の網羅性・検証可能性・基準↔ステップ紐づけ・スコープ整合性。

#### 問題点（要修正）

- **[P-001]** plan.md L15 の前提「作業ブランチを最新 origin/main から切り直したため #669 の成果物が実在する」が、計画作成時のワークツリー状態（`issue/642` ブランチ、`.issue/669/` 未取り込み）と矛盾する事実先取り。
  - 理由: #669 は PR #676（`f8226edb`）でマージ済みなので成果物は origin/main・git 履歴に存在するが、「作業ブランチで実在する」という断定はブランチを切るまで成立しない。AC-1 の前提確認（`.issue/669/adr.md` 等を一次情報として参照）が、ブランチ未切り出しのままだと実施できない。
  - 提案: 事実（#676 マージ済み・origin/main に存在）と手順（#670 ブランチを #676 を含む origin/main から切る）を分離記述する。Step 0 冒頭に「ブランチが #676 を含むことを確認」を1行ゲートとして加える。

#### 改善提案（検討推奨）

- **[S-001]** Step 0 の「影響なし」判定をユニット再現だけで満たすと本番 RSC 差し替えと非等価になりうる。「影響なし」判定こそ本番ブラウザ経路（UploadDialog 完了 invalidate）で最低1回確認する条件を AC-1/AC-6 に明記すると誤った早期クローズを防げる。

- **[S-002]** 新規 ViewFormDialog（NewViewButton）が AC-4 行に独立記載されていない。Step 0 判定対象には含まれる（plan L77）ので漏れではないが、AC-4 に「新規ダイアログは Step 0 結果に応じて対象/対象外を明記」と一言加えると基準↔実装の紐づけが完全に閉じる。

#### 良い点

- round-1 P-001（plan の module-scope Map と ADR の seed-once+key の方式矛盾）は完全解消。ADR-001 が旧 Decision を明示破棄し、機構を Step 0 依存の (a)/(b)/(c) 比較に一本化、plan と adr の記述が一致。
- round-1 P-002 の #669 引用は一次情報（マージ済みツリー `f8226edb`）と照合して全て正確。`analysis.md` の真因（InlineEditor 内部 `host.replaceChildren()`）、TC-009 の生 invalidate でも編集維持、`noteEditorSeedOnce.test.tsx` の remount 非カバー明記、いずれも記述どおり。
- 可視状態退避（isEditing/open）を Step 0 実証時のみ・境界外所有・固定 key `"new-view"` 禁止とした設計制約が適切（arch P-003 反映）。
- staleTime 非対称（個人 prompts=`DEV?0:Infinity`、admin=`0`、views=`0`）が実コードと一致。AC-2 を本番 Infinity 下では影響なしになりうると条件付き化（S-001 反映）。
- スコープ除外（IngestionPreviewForm、PreviewPanel sample）が実コードで裏付け。Issue 受け入れ条件4項目が AC-1〜AC-7 に漏れなく対応、スコープ膨張なし。

### サマリー
- 問題点: 1 / 改善提案: 2
- `[P-001]` plan L15「#669 成果物が作業ブランチで実在」が事実先取り。事実/手順の分離が必要
- `[S-001]` Step 0「影響なし」判定の本番ブラウザ確認を AC に明文化
- `[S-002]` 新規 ViewFormDialog を AC-4 に条件付きで明記
