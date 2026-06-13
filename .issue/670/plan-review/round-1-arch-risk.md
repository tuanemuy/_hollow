# 計画レビュー round-1 — アーキテクチャ整合性・実現可能性・リスク（Issue #670）

対象: `.issue/670/plan.md` / `.issue/670/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

## 総評

Issue #670 の Step 0 は「再マウントが本当に起きるのか、起きるなら影響箇所はどこかを根拠付きで確定する」ことを最初のタスクとして明示しており、影響なしと判明すればクローズ可、とまで書いている。本計画はこの Step 0 を「再マウントは起きる」と**断定**し、その断定の上に module-scope `Map<string,T>` による `useRemountStableDraft` という重量級の共通基盤を据えている。問題は、この断定の根拠が #669 の実測ではなく、#669 が「念のため」採った route 除外の precaution を逆方向に読んだ推論である点にある。Step 0 の結論が誤っていれば、計画の中核（新ユーティリティ + 4コンポーネント改修 + module-scope 可変状態の導入）はまるごと過剰になる。

#### 問題点（要修正）

- **[P-001]** Step 0 の「invalidate → RSC ツリー差し替え → サブツリー再マウント」という中核前提が、#669 で実証されていない推論に依存している
  - 理由: #669 の原因分析（`git show 73409060:.issue/669/manual-test/results/analysis.md`）は、実際に観測されたフォーカス喪失（TC-007, 約217ms）の原因を **InlineEditor 内部の `host.replaceChildren()` による DOM 全再構築**と特定し、「autosave / invalidate ではない」と明記している。さらに同分析は「`routerInvalidate` を編集画面から除外済みのため、loader 再実行による再マウント経路は既に塞がれている」と書くが、これは除外したから観測できなかっただけで、除外前に invalidate が NoteEditor サブツリーを remount して state を失わせる事を実測した記録はない。#669 ADR-003 も seed-once を「将来の props 再同期コード混入への退行防止」と位置づけ、route 除外は「正当な invalidate ケースが構造的に存在しないから不変条件にできる」という設計上の整理であって、「remount するから外した」という実測駆動ではない。つまり計画 plan.md L49 / adr.md ADR-001 の「#669 ADR-003 が確定した『生 invalidate → RSC ツリー差し替え＝再マウント』と同一メカニズム」は、ADR-003 が実際には確定していない命題を確定済みとして引用している。TanStack Start の RSC loader 再実行が leaf サブツリーを reconcile するか remount するかは、React 要素の type/key の同一性次第であり、自明に remount とは言えない（同じコンポーネント型が同じ位置に返れば reconcile される可能性がある）。
  - 提案: 実装着手前に Step 0 を**実測で**確定する。最小の再現を作る — 対象3ルートのいずれか（例 `/_app/views`, `staleTime:0`）を開き、フォーム編集中に別経路（UploadDialog 完了相当の `routerInvalidate(router)`）を発火させ、(a) 入力値・フォーカス・編集モードが失われるか、(b) コンポーネントの `useEffect(()=>{...},[])` / counter ref で mount 回数が増えるか、を agent-browser かユニットの「RSC ペイロード差し替え相当」再現で観測する。**remount が観測されなければ本 Issue は影響なしとして大半をクローズでき**（Issue 受け入れ条件が許容）、`useRemountStableDraft` は不要になる。remount が観測された場合のみ、その粒度（どのコンポーネントから新インスタンスか）を記録し、防御範囲を最小化する。この検証結果を AC-1 のエビデンスとして plan/adr に残す。

- **[P-002]** module-scope の可変 `Map<string,T>` は CLAUDE.md の「ステートレス・純関数志向」「mutable state は単一外部リソースをカプセル化する adapter に限る」と正面衝突し、かつ remount 耐性のためのより低リスクな代替が十分に検討されていない
  - 理由: `useRemountStableDraft` は module スコープにプロセス共有の可変 Map を持ち込む。これは UI 層であっても本リポジトリの原則から外れる新種の状態保持機構で、レビュー観点（リーク・別ユーザー/別画面での取り違え・reset 漏れ）が plan の「リスク」節でも自認されているとおり危険面が広い。SSR/RSC 環境ではモジュールがリクエスト間で共有され得るため、サーバ側で Map にエントリが残るとユーザー間で draft が漏れる致命的リスクすらある（client-only フックである保証・`"use client"` 境界・サーバ実行されない保証を設計に明記する必要がある）。一方で、もし P-001 で remount が実在すると確定したとしても、(1) #669 と同型に「該当ルートだけ」ではなく「該当 leaf の親（`PromptsForm` / `SavedViewsList` ルート要素）を安定インスタンスに保つ」設計、(2) 編集 state を再マウント境界の外側＝**ルート loader の上位にある安定コンポーネント（`_app` レイアウト配下の常駐 provider / React Context）**に引き上げる、(3) 編集中のみ `sessionStorage` に退避し復元する（プロセス共有されず、リロード耐性も付く）等、module-scope 可変 Map より原則整合的で取り違えリスクの低い選択肢がある。adr.md ADR-001 は「seed-once + 安定 key」を decision としているのに、plan.md L72-85 は同 ADR と異なる「module-scope Map ストア」を中核に据えており、**plan と adr が別方式を指していて不整合**でもある。
  - 提案: まず P-001 を解消し、防御が本当に必要な箇所を最小化する。そのうえで防御が要るなら、module-scope Map ではなく上記 (2) Context（再マウント境界の外＝安定 provider に draft を置く）または (3) sessionStorage を第一候補として比較検討し、選定理由を ADR に書く。module-scope Map を採るなら、最低限「client-only（サーバで絶対 import 実行されない / 値が積まれない）」「key の名前空間衝突回避（purpose や `"new-view"` のような短い固定文字列はグローバル Map では衝突源）」「画面離脱時の確実な GC（unmount 時 cleanup での破棄）」を設計として確定し、テストで pin すること。なお plan と adr の方式記述の食い違いはどちらかに統一する。

- **[P-003]** `editing` フラグ・`isEditing`・dialog `open` といった「編集 UI の可視状態」まで entity-keyed store に退避する設計は、退行リスクとライフサイクルの複雑さを大きく増やす
  - 理由: plan.md L111 / L116 は、入力値だけでなく `isEditing` / `open` も store に含める（でないと再マウントで編集バー・ダイアログが消える）としている。これは「invalidate が起きるたびに、ユーザーがいつのまにか開いていた編集ダイアログが復元される」「別の閲覧でたまたま同じ `"new-view"` key を踏むと前回の開状態が復活する」といった、元バグより気づきにくい新種の退行を招く。特に新規ダイアログの固定 key `"new-view"` は entity id を持たないため、同一ユーザーの別タブ・別 `/_app/views` 滞在で容易に衝突する。reset 漏れが1つでもあると「閉じたはずのダイアログが invalidate で再出現」する。
  - 提案: 可視状態（`isEditing`/`open`）の退避は、本当に再マウントが起きると確定した場合に限り、かつ可視状態は store ではなく**再マウント境界の外側の安定コンポーネントが所有**する形にする（draft 値と可視状態を同じ安定スコープに置けば一貫する）。新規ダイアログは安定 id がないので、そもそも remount で `open=false` に戻るなら「ダイアログの開閉状態を `SavedViewsList` ルート上位の安定要素が持つ」方式にし、固定文字列 key の module-scope 共有は避ける。

#### 改善提案（検討推奨）

- **[S-001]** 個人プロンプト（`/_app/settings/prompts`）は本番 `staleTime: Infinity`（`DEV ? 0 : Infinity`、`app/routes/_app/settings/prompts.tsx:19`）である点を Step 0 の判定に織り込むこと
  - 理由: `staleTime: Infinity` のルートは `routerInvalidate` で invalidate 対象に入っても、cache が fresh とみなされ loader が再実行されない可能性が高い（#293/#300 の AppShell `staleTime: Infinity` 維持の議論と同型）。そうであれば AC-2（個人プロンプト）は本番で再マウントを起こさず、管理者プロンプト（`staleTime:0`）と views（`staleTime:0`）とで影響が非対称になる。plan は3ルートを一律「影響あり」としているが、staleTime 差で挙動が分かれる可能性を Step 0 で実測区別すべき。

- **[S-002]** PreviewPanel の `sample` を保持対象にするか否か（plan.md L101「検討」）は、スコープを膨らませる方向なので Issue 受け入れ条件に照らして明確に line を引くこと
  - 理由: Issue の主眼は「loader データ（既存値）の喪失」。`sample` は loader 由来でないユーザー入力で、IngestionPreviewForm をスコープ外にした論理（adr ADR-002）と同じ理由でスコープ外に倒すのが一貫する。「最小限なら text のみ」と決め切ってよい。

- **[S-003]** AC-5（自分の保存 → invalidate → 最新値再表示）の維持は、module-scope Map 方式だと「保存成功パスで必ず reset」という命令的後始末に全面依存する。reset 漏れ＝最新値が見えない退行に直結するため、保存後の最新値表示を「store 破棄」ではなく「editing=false に戻れば seed 追従」という宣言的不変条件で担保できる API 形状にすると堅い（plan の `editing` セマンティクスはこの方向だが、prompts は明示的 editing がないため曖昧、と plan 自身が認めている L82）。prompts の editing 判定をどう定義するかを ADR で確定させること。

#### 良い点

- IngestionPreviewForm を「`preview` が UploadDialog client state 由来 / UploadDialog は `_app` 常駐で invalidate 除外」という具体的経路でスコープ外と判定した整理（adr ADR-002）は妥当で、根拠も正確。
- 「seed-once は再レンダーに強いが再マウントには無力」という #669 ADR-003 の核心を正しく踏まえ、再マウント耐性が本質的論点だと特定できている（リスク節 L132）。論点の所在は的確。
- `routerInvalidate` を変更せず「invalidate = 表示系ルートの再評価」という既存の意味論を壊さない方針、および route 除外が使えない理由（保存後の最新値再表示が受け入れ条件）の整理は、#669 の設計思想と一貫している。
- ドメイン/アプリ/アダプター層に影響なし＝UI 局所の修正と切り分けている点はアーキテクチャ的に正しい。
