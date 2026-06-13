# Round 1 レビュー — Issue #680 計画（視点: 要件カバレッジ・スコープ整合性）

レビュー日: 2026-06-13
対象: `.issue/680/plan.md` / `.issue/680/adr.md`
前提資料: Issue #680 本文、#670 `.issue/670/step0-results.md` / `.issue/670/adr.md`、既存コード（`useRovingMenu`、`routerInvalidate`、3フォーム、UploadDialog）

---

## 総評

Issue 本文で合意された要件（原因特定 → focus/selection 復元、3フォーム横断、発生源非依存、退行防止、value 保持）はすべて受け入れ基準に落ちており、AC とステップの紐づけも妥当。#670 Step 0 の no-repro 結論（再マウント・value 喪失は不存在、focus 喪失のみが実在）と整合し、#670 が否定した防御機構 (a)/(b)/(c) を持ち込まないというスコープ制約も守られている。Dialog 系のスコープ外判断も #670 ADR-002 と整合し根拠が明示されている。要件カバレッジ上の致命的な漏れはない。

下記は1点の明確化要修正（同一ファイル内の別 `<textarea>` の扱い）と、検証可能性を高めるための改善提案。

---

#### 問題点（要修正）

- **[P-001]** `/_app/settings/prompts`（`identity/PromptsForm/index.tsx`）には対象外であるべき2つ目の `<textarea>`（`PreviewPanel` の `sample`、L362）が同一ファイル内に存在するが、plan・ADR ともにこの除外を明記していない。
  - 理由: plan 調査結果 L43 は当該ファイルを「`PromptRow` の `<textarea>`（text）」とだけ記述し、ステップ6（L112-113）も「`PromptRow` の text `<textarea>`」とだけ書く。実際にはこのファイルに `PreviewPanel.sample`（`useState("")`・ユーザー入力・loader 非由来）という別の `<textarea>` が同居している（実コード L316/L362-370）。#670 ADR-002 は `PreviewPanel.sample` を「loader 由来でないユーザー入力であり…保持対象としない（スコープ外）」と明示しているが、#680 plan はこの除外を引き継いでいない。実装者が「settings/prompts のすべての textarea に付ける」と素直に解釈すると `sample` にもフックを配線しかねず、スコープ外作業の混入（= Issue の3箇所限定スコープ逸脱）を招く。なお #680 の復元対象は「loader-seed か否か」ではなく「invalidate コミットで focus が落ちるか否か」なので、`sample` も技術的には同じ症状を持ちうる点が #670 ADR-002 の除外理由（loader-seed でない）と微妙にズレており、なおさら #680 側で明示的に線引きしておく必要がある。
  - 提案: ステップ6を「`PromptRow` の text `<textarea>` のみ。同ファイルの `PreviewPanel.sample` `<textarea>` は対象外（#680 が実機で focus 喪失を観測した3箇所＝loader 表示系フォーム入力に含まれない／#670 ADR-002 でスコープ外整理済み）」と明記する。スコープ節「含まれないもの」にも `PreviewPanel.sample` を1行追加する。

#### 改善提案（検討推奨）

- **[S-001]** AC-3 の検証対象「`<textarea>`（text / variables）」が admin の `PromptCard` 内2フィールドであることはステップ5で読み取れるが、AC-3 の基準文だけ見ると「textarea が2つある」ことが基準の検証単位として明示されていない。
  - 理由: 実コード上 admin/PromptsForm は text（L189）と variables（L211 付近）の2 `<textarea>` を持ち、ステップ5は両方に配線すると明記している。AC-3 を「text・variables の **両方**で focus・caret 保持」と検証単位を割れば、ステップ7の実機検証で片方だけ確認して取りこぼす事故を防げる（検証可能性の明確化）。

- **[S-002]** AC-5（発生源非依存）の実機検証が「raw `router.invalidate()` でも1ケース確認」（ステップ7）に留まり、どのフォームで確認するかが未指定。
  - 理由: AC-5 はフックの最重要設計（発生源を知らずコミット後 `activeElement===body` で復元）の検証であり、3フォームのうち最も配線が単純な views inline input など代表1つを指定しておくと再現性が上がる。「どれで」を明記すれば検証手順の曖昧さが減る。

- **[S-003]** Issue 本文が「まず…特定してから対処方針を決める」と要求している原因特定（AC-1）について、実機 before（修正前で focus→body を再現）はステップ7に含まれるが、AC-1 の「対応ステップ」は 1,2 とされている。実機での症状再現（ステップ7前半）も AC-1 の一次確証なので、AC-1 の対応ステップに 7 を加えると由来の追跡が正確になる。
  - 理由: ステップ1（コードリーディング）は前例ベースの推定確定で、ステップ7前半の「修正前で focus→body を再現」が AC-1 の実機確証（plan L120 が明記）。AC-1 ⇄ ステップ7 の紐づけを足すと「特定の実機裏付け」がトレースしやすい。

#### 良い点

- Issue 本文の全要件が AC に網羅されている: 原因特定（AC-1）、3フォーム個別の focus+caret 保持（AC-2/3/4）、発生源非依存＝「UploadDialog 以外の invalidate でも」（AC-5）、最新値再表示の非退行＝invalidate 経路を変えない（AC-6）、value 保持の維持（AC-7）。Issue が挙げた2つの対処方向（退避・復元 / 描画構造見直し）のうち前者を第一選択・後者をフォールバックとして ADR-001 に整理しており、本文の「特定してから方針決定」の流れに忠実。
- **3フォームすべてに効くか**: views inline `<input>`（ステップ4・AC-2）、admin prompts `<textarea>`×2（ステップ5・AC-3）、settings prompts text `<textarea>`（ステップ6・AC-4）が個別ステップ＋個別 AC で1対1に紐づき、共通フック1本で横断する設計。実コードの該当箇所（SavedViewsList L360、admin/PromptsForm L189/L211、identity/PromptsForm L224）と一致。
- **UploadDialog 以外の invalidate でも効くか**: ADR-001「フックを invalidate トリガー側でなく focus を失う当事者側に置く／コミット後 `activeElement===body` を見るだけで発生源非依存」という設計が、`useRovingMenu.restoreFocusOnCommit`（実コード L107-121 で同型の発生源非依存復元を実装済み）の前例に正しく裏打ちされている。AC-5＋ステップ3のユニット（別要素 focus 時は復元しない等）＋ステップ7の raw invalidate 検証で多層に担保。
- **Dialog 系のスコープ外判断**: ViewFormDialog / IngestionPreviewForm を「#680 が実機で focus 喪失を観測した3箇所に含まれない」「Dialog は portal+focus-trap の別描画構造」「#670 ADR-002 で IngestionPreviewForm は invalidate 源が UploadDialog client state 由来で再マウントされないと整理済み」と複数の根拠でスコープ外化しており妥当。必要時に別観測・別 Issue とする退避路も明示。過剰対応を避ける #670 の方針と一貫。
- #670 が「作るべきでない」と結論した防御機構 (a)/(b)/(c) を本 Issue が持ち込まない（スコープ節「含まれないもの」に明記）／invalidate 経路抑制も AC-6 退行防止のため不採用とするなど、親 Issue の確定事項との整合が徹底されている。
- 「入力 value 保持」を #670 実証済みとして AC-7 で非退行のみ要求し、新規対処をしない切り分けが正確（フックは focus/selection のみ扱う）。
- jsdom で RSC コミットの detach を忠実再現できない限界を認識し、ユニット（復元/非復元分岐）＋実機ゲート（ステップ7）の二段で検証する方針が #670 の検証文化を踏襲しており、検証可能性が現実的。

---

## スコープ逸脱・不要作業の有無

- スコープ外作業の混入は P-001（`PreviewPanel.sample` への誤配線リスク）を除き見当たらない。invalidate 経路・loader・サーバ関数・ドメイン/ユースケース/アダプターは「変更なし」と明記され、focus というブラウザ副作用に限定されている。
- 新規ファイルはフック1本＋そのユニットテスト1本のみで、`useRovingMenu` / `routerInvalidate` の既存配置慣行（`app/components/common/` ＋ `__tests__/`、実在確認済み）に沿う。共通フック化（ADR-002）は3 consumer ＋将来分の DRY 根拠があり過剰ではない。
