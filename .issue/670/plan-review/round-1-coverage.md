# Plan Review Round 1 — 要件カバレッジ・スコープ整合性（Issue #670）

レビュー視点: Issue本文・受け入れ条件の要件カバレッジ、基準の検証可能性、基準↔ステップの紐づけ、スコープ整合性。

#### 問題点（要修正）

- **[P-001]** plan.md「設計」/ADR-002 と ADR-001 で採用する解決方式が矛盾している。
  - 理由: ADR-001 は Decision で「seed-once（lazy initializer）+ エンティティ単位の安定 `key`」を本命防御として明示的に採用し、その核心理由まで詳述している。一方 plan.md の「設計」節と実装ステップ2-6、ADR-002 は `useRemountStableDraft`（module-scope `Map` の remount-stable draft store）という**別方式**を前提に書かれている。さらに plan.md 自身（L49-53, リスク節 L132）と ADR-001 L29 は「seed-once 単独は再マウントに無力」と述べており、これは ADR-001 の Decision（seed-once + key で足りる）と正面から食い違う。受け入れ基準は store 方式に紐づくため、ADR-001 のままだと AC-2〜AC-5 を満たせない可能性がある。実装者がどちらに従うべきか判断できない。
  - 提案: 方式を1つに確定する。「key 不変なら React がインスタンスを保持する＝再マウントしない」のか「RSC 差し替えで親ごと新インスタンス化＝key があっても再マウントする」のかを Step 0 で技術的に断定し、結論に合わせて ADR-001 を全面改稿するか破棄し、ADR を store 方式に一本化する。plan.md L50 は「key があっても子は新規マウントされる」と断じており、これが正なら ADR-001 の key 戦略は破綻しているので削除すべき。

- **[P-002]** 先行 Issue #669 の成果物（`.issue/669/adr.md`、`noteEditorSeedOnce.test.tsx`、NoteEditor の `useReducer` seed-once）が現リポジトリに存在せず、plan が依拠する前提が未確定。
  - 理由: plan.md は ADR-003（`.issue/669/adr.md`）と `noteEditorSeedOnce.test.tsx` を「確定した precedent」として繰り返し引用するが、`.issue/669/` ディレクトリは存在せず、当該テストも見つからない（NoteEditor 自体は `useReducer` lazy initializer を持つが、再マウント耐性に関する #669 の「確定したメカニズム結論」は本リポジトリ内に記録がない）。Issue 本文は「#669 の完了後に着手」「Step 0 でメカニズムを確認」を明示の前提条件としており、これが未充足。AC-1 の「根拠付き確定」が precedent 不在のまま宙に浮く。
  - 提案: Step 0（ステップ1）で #669 の実際の確定メカニズムを一次情報（マージ済み PR / コード）で再確認し、引用先を実在するファイルに更新する。#669 が未完了なら本 Issue 着手の前提が崩れるため、その依存関係を plan に明記する。

#### 改善提案（検討推奨）

- **[S-001]** AC-2〜AC-4 の検証手段が「親再マウントを再現した単体テスト」に依存しており、Issue が本来要求する「実際の invalidate（UploadDialog 完了）」経路での検証が受け入れ基準に落ちていない。
  - 理由: plan.md リスク節 L132 が「テストは通るが本番の UploadDialog 完了では失われる」状態を自己警告している通り、単体での親再マウント再現が本番の RSC 差し替えと等価である保証がない。テスト方針には手動検証が挙がっているが、受け入れ基準表（AC-2〜AC-4）の「対応ステップ」がテスト/手動検証に紐づいておらず、検証可能性が担保されていない。手動検証ステップ（別タブでアップロード→invalidate）を受け入れ基準の検証手段として表に明示すると、カバレッジが閉じる。

- **[S-002]** AC-2 の対象が「分析の指示（text）」のみで、PreviewPanel の `sample` 入力喪失（plan ステップ3で「検討」止まり）が基準化されていない。
  - 理由: Issue 受け入れ条件は「入力内容とフォーカスが失われない」と包括的。同一コンポーネント内の sample 入力も同じ再マウントで失われる以上、対象に含めるか除外するかを AC として確定しておくとスコープが明確になる（過剰対応の防止にもなる）。

#### 良い点

- 受け入れ基準が AC-1〜AC-6 として表形式で整理され、各基準に「由来（Issue 本文/受け入れ条件）」と「対応ステップ」が紐づいている。Issue の受け入れ条件4項目（Step 0 記録、4箇所の入力保持、保存→最新値再表示、品質ゲート）はいずれも AC に対応がある。
- IngestionPreviewForm の除外判断（ADR-002）が「`preview` は UploadDialog の client state 由来で RSC loader でない」「UploadDialog は `_app` 常駐＝invalidate 除外で再マウントされない」という具体的根拠に基づいており、`routerInvalidate` の `_app` 除外実装とも整合する。Issue が「影響なしと判明したらクローズ可」とする条件に沿った正当な除外。
- 新規 ViewFormDialog（NewViewButton）をスコープに含める判断が、Issue 本文の「対象4箇所」から漏れる懸念に対し「`/_app/views` leaf 再マウントで NewViewButton ごと再マウントされる」という根拠で正当化されており、スコープの過不足を意識した判断になっている。
- ルート3つの `staleTime`（prompts 個人=DEV?0:Infinity / admin=0 / views=0）と `renderServerComponent`+`useLoaderData` 構造の記載が実コードと一致しており、調査の正確性が高い。
- `isEditing` / dialog `open` 自体の喪失（入力値だけ保持して編集 UI が消える別退行）をリスクとして先回りで認識している点が良い。
