# Round 1 レビュー — Issue #825 計画（観点: Issue要件カバレッジ・スコープ整合性）

対象: `.issue/825/plan.md` / `.issue/825/adr.md`
レビュー日: 2026-07-10

## 要件マッピング（Issue → 受け入れ基準）

Issue #825 本文の合意要件を AC に突き合わせた結果、**カバレッジは完全**。

| Issue 要件 | 対応 AC | 判定 |
|---|---|---|
| 対象1: WYSIWYG ツールバー圧縮 / オーバーフローメニュー化 | AC-1（モバイルで主要ボタン一目 + `⋯`）、AC-3（WAI-ARIA Menu / 適用中表示） | 充足 |
| 対象2: 未保存確認 `window.confirm` のカスタム UI 化 | AC-4（`ConfirmDialog`）、AC-5（#696 装飾確認との順序維持） | 充足 |
| 対象2: リンク URL `window.prompt` のカスタム UI 化 | AC-6（`LinkDialog`） | 充足 |
| （派生）スキーム警告 `window.alert` のカスタム UI 化 | AC-7（ダイアログ内インライン `role="alert"`） | 充足 |
| スコープ外「デスクトップレイアウト変更なし」 | AC-2（デスクトップ不変） | 充足（ただし P-001 参照） |
| CLAUDE.md 開発フロー | AC-8（typecheck/lint/format + test 緑） | 充足 |

コード実測での裏取り:
- `WysiwygEditor.tsx` の native 呼び出しは `window.prompt`(L406) / `window.alert`(L413)、`NoteEditor.tsx` は `window.confirm`(L283) の**計 3 箇所のみ**（`grep` で全数確認）。プランが挙げる 3 ダイアログで**漏れなし**。
- 書式ボタンは `buttons` 配列 9 個（Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code）＋ Link/Image を別 JSX でレンダー＝計 11。プランの認識と一致。
- スコープ外に回した #818 項目（`min-h-[52vh]`・`[overflow-wrap:anywhere]`・safe-area）は `WysiwygEditor.tsx:592-594` で実装済みを確認。**除外は正当**。
- 流用プリミティブ（`ConfirmDialog`/`Dialog`/`Menu`/`usePopover`/`NoteActionsMenu`、`dialog`/`menuItem`/`fieldControl`/`formError`）は全て実在を確認。`ConfirmDialog` はテキスト入力欄を持たない（`description` は ReactNode のみ）ため、リンク入力を `Dialog` ベース新規 `LinkDialog` にした ADR-002 の判断は妥当。
- #696 の装飾ロス確認は既に `ConfirmDialog` + 遅延 state（`pendingWysiwygSwitch`）で実装済み（`NoteEditor.tsx:327-354, 668-689`）。未保存確認を同型パターンに揃える方針は既存資産と整合。

## 問題点（要修正）

- **[P-001]** AC-2「デスクトップ...現状と同一」と実装ステップ3のボタン**並び順**が矛盾する
  - 問題: 現状のデスクトップ・ツールバーの DOM 順は Bold/Italic/**Strike/H2/H3**/UL/OL/**Quote/Code**/Link/Image（`buttons.map` → Link → Image、`WysiwygEditor.tsx:551-590`）。一方プラン step 3 / ADR-001 は rail を「主要（Bold/Italic/UL/OL/Link/Image）＋低頻度（Strike/H2/H3/Quote/Code）＋トリガー」と**グループ順に物理配置**すると記述している。この通りに実装すると、デスクトップでも Strike が 3 番目→7 番目へ、Link/Image が末尾→5・6 番目へと**並びが変わる**。AC-2 は「全ボタンがインライン表示のまま」だけでなく「現状と同一」と明記しており、順序変更は AC-2 を厳密には満たさない。
  - 理由: AC-2 は Issue のスコープ外「デスクトップレイアウトの変更」を守るための基準。並び替えは「レイアウト変更」に該当し得るため、基準と実装方針の不整合は受け入れ判定を曖昧にする。
  - 提案: step 1 の代替案「単一 `buttons` 配列＋各要素に `group: "primary" | "overflow"` フラグ」を採用し、**デスクトップは元の配列順のまま全ボタンを描画**（overflow グループ要素に `max-sm:hidden` を付与）、モバイルは overflow グループを隠すだけにする。元順（Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code/Link/Image）で overflow=Strike/H2/H3/Quote/Code を `max-sm:hidden` にすると、モバイル rail は Bold/Italic/UL/OL/Link/Image が視覚的に連続して残り AC-1 も満たす。この方式なら AC-1・AC-2 を並び替えなしで両立できる。step 3 / ADR-001 の「グループ順に物理配置」という記述を「元順を維持し可視性のみ breakpoint 分岐」に改めること。

## 改善提案（検討推奨）

- **[S-001]** AC-1「横スクロールなしで一目で見え」の判定にフォールバック挙動を明記する
  - 理由: `editorToolbar`（`styles.ts:54`）は `max-sm:overflow-x-auto` を維持したままで、プラン自身がリスク欄(L163)で「主要6＋`⋯`=7 枠が 390px に収まるか未確定」と認めている。収まらなければ横スクロールが残り、コードはマージされても AC-1 が実質未達になり得る。AC-1 を「実機 390px で主要ボタン群が横スクロールなしに収まる（収まらない場合は主要ボタンをさらに削って収める）」と、収束条件まで含めて検証可能化しておくと判定がぶれない。

- **[S-002]** AC-3「適用中の状態が視覚的に判別できる」のオーバーフロー項目での確認タイミングを明確化
  - 理由: プランは各 `MenuItem` の children に「適用中」を表示する方針だが、トグル後は `runAndClose` でメニューが閉じるため、適用直後にメニュー内で状態変化を目視できない（再オープン時に反映）。ADR-001 で `aria-pressed` 非対応のトレードオフは明示済みなので破綻はないが、AC-3 の検証を「メニューを開いた時点で現在の適用状態がチェック等で判別できる」と定義しておくと、テスト・手動確認の期待値が具体化する。

- **[S-003]** step 1 の「`buttons` 配列を分割」という記述は Link/Image が配列外（別 JSX）である現状と噛み合っていない
  - 理由: Link/Image は `buttons` 配列に含まれず L569-590 で個別レンダーされている。主要側に Link/Image を含めるには、まず 3 者を統一データ（1 本の配列）に集約する前提を step 1 で明記した方が、P-001 の単一配列＋フラグ方式ともつながり実装がぶれない。

## 良い点

- Issue 本文の「検討」レベルの要求（「圧縮 or オーバーフロー化を検討」）に対し、具体的な採用案（モバイル限定オーバーフロー、CSS variant 分岐）へ落とし込み、代替案(B)(C)(D)を ADR-001 で棄却理由付きで比較しており、スコープ判断の根拠が追える。
- スコープ外の切り分けが精緻。#818 で実装済みの項目（`min-h`/`overflow-wrap`/`APP_MAIN`）を「重複回避」として明示除外し、実コードで裏取りできる形で書いている。保存/自動保存/編集ロックの挙動不変も AC-4 の但し書き（分岐条件の意味論を保持）で担保。
- AC ↔ 実装ステップの紐づけ表が全 AC に付与され、各 AC が検証可能な形（テスト/手動）で記述されている。特に AC-5（#696 二重プロンプト回避）を明示的に回帰ゲート化しているのは、既存挙動の破壊防止として的確。
- ネイティブダイアログがデスクトップにも作用する副作用を隠さず、「レイアウト変更ではなく実装差し替え」と scope 上で整理し、リスク欄でも「厳密に読む立場との齟齬」に注意喚起している。スコープ整合性の観点で誠実。
- 3 ダイアログの完全性（confirm/prompt/alert）を漏れなく拾い、`window.alert` を AC-7 でインライン `role="alert"` に置換して a11y 改善に接続している。
