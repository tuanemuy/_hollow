# Design Critique — Issue #226 Upload Preview Modal

## 総評

新フローは「アップロード → 推論待ち → プレビュー編集 → 登録」を 1 つの面に圧縮するという目的に対して、ステートマシン設計と Dialog プリミティブの再利用がよく機能している。`SkeletonBlock` の 3 行バー、`bg-surface` ベースの落ち着いた色面、`pillBtn` の角丸 980px と data-primary/danger の最小限の色差は、Apple Calm の「静謐・上品」軸を素直に踏襲できている。タイトル入力への自動フォーカス、`editing` 中の backdrop ロック (ADR-013)、`uploading` 中の closable=false など、編集中のロストを避ける配慮は要件以上に丁寧。

一方で、editing view は「縦に積んだフォーム → 読み取り専用本文 → sticky アクションバー」という素直な構造ゆえに、**情報の層 (layer) が等価に見えてしまう** 弱点がある。タイトル / ディレクトリ / タグ / FrontMatter / 本文プレビューが同じ視覚ウェイトで並ぶため、「LLM が提案した内容を確認する」という Issue の主動詞が薄まり、ただの編集フォームに見える。FrontMatter の textarea が本文プレビューの上に配置されており、JSON という上級者向け要素がプレビューより手前に出てしまう情報優先度の逆転も生じている。

Failed / timedOut / multiResult の補助 view は機能的には満たすが、視覚デザインとして select/editing と同じ温度で扱われており、Apple Calm が苦手とする「沈黙系の失敗表現」がやや弱い。特に `errorCode: errorReason` の生表示は ADR-014 でフォローアップ済みではあるが、UX としては最も大きく改善余地がある領域。

---

## View ごとの評価

### select view

参考: `app/components/ingestion/UploadDialog.tsx:381-427`、screenshot `tc-1/01-after-upload-click.png`

- **ビジュアル階層**: タイトル「アップロード」→ 説明文 → ドロップゾーン → サブテキスト「複数選択にも対応」→ 右下「取り込みキューを見る」。視線の流れは自然で、ドロップゾーンの 2px dashed + 大きめ padding (`px-6 py-12`) が中心の重心として機能している。`text-ink` の太字「ファイルをドラッグ&ドロップ」と `text-ink-secondary` の補足文の対比も Apple Calm 的に正しい。
- **情報アーキテクチャ**: 「主動線 = ドロップ / クリック」「副動線 = 既存キュー閲覧」が空間的に分離されている。pill button が 1 つだけなので主従が明確。
- **改善余地**:
  - 「複数選択にも対応」がドロップゾーン内のサブテキストとして埋もれている。複数選択の挙動が ADR-003 で「全件キューに積む（モーダル内編集はスキップ）」と分岐するなら、その分岐は事前告知された方が安心感が出る。例: `小さなインフォアイコン + tooltip` で「複数選択時はキュー画面に誘導します」と添える。
  - ドロップゾーンの `hover:border-accent hover:bg-accent-surface` は静止状態と区別する効果があるが、`data-[dragover]:` の方が強い視覚変化なら、hover 中の変化はもう一段静かにしてもよい (例: `hover:border-hairline` → `hover:border-ink-tertiary` 程度)。Apple は hover で過剰に反応しない。
  - エラー表示 (`extractSerializedError` 経由) は `FORM_ERROR` で text-error の小サイズ表示。再アップロードに直結する文言を加える ("もう一度お試しください") と、ADR-011 のフォールバックパスとしての意図が伝わりやすい。

### uploading / waiting view

参考: `UploadDialog.tsx:429-468`、screenshot は明示的なキャプチャなし (TC-1/TC-3 の中間状態)

- **ビジュアル階層**: SkeletonBlock の 3 本バー (w3/4, w1/2, w2/3) → 説明文 → 補助文。中央寄せで縦リズムも整っており、Apple Calm の「動かないところまで動かさない」原則に近い (`motion-safe:animate-pulse` のみ)。
- **情報アーキテクチャ**: uploading と waiting の差はテキストのみ ("アップロード中..." vs "LLM がタイトルとメタデータを提案中...")。スケルトンの形状は同一。これは正解で、ユーザーには「待っている」一語で十分。
- **改善余地**:
  - waiting の補足文「この処理には数十秒かかることがあります」は親切だが、180 秒タイムアウトの存在をユーザーは知らない。タイムアウト直前 (例: 経過 120 秒) に「もう少しお待ちください、または『キュー画面で続きを見る』に切り替えられます」とトーン変化を入れる、もしくは経過時間バーを暗めに薄く出すと体感の不安が下がる。Apple Calm 的には「経過の可視化はしないが、escape ハッチは予告する」が望ましい。
  - SkeletonBlock の幅 w3/4 / w1/2 / w2/3 はランダムに見せたい意図があるが、中央寄せだと「タイトル + 段落」の形に見えにくい。waiting 専用に「タイトル風 (太め1行) + メタ風 (細め2行)」の見た目に分けてもよい。
  - `closable={view.kind !== "uploading"}` のため waiting 中は × ボタンが押せる (TC でも確認済み)。これは正しいが、ボタンの hover 状態が文脈に対して "つい強い" 印象。waiting 中は × hover の bg-surface も微妙に薄めてよい。

### editing view

参考: `IngestionPreviewForm.tsx`、screenshot `tc-1/03-edited-fields.png`、`tc-2/04-preview-form.png`

- **ビジュアル階層**: タイトル → fieldset (ディレクトリ) → タグ → FrontMatter (textarea, monospace) → 本文プレビュー (note-detail-content) → sticky action bar。フォームが正攻法に積まれているため、視線は素直に上から下に流れる。
- **情報アーキテクチャ**:
  - **問題**: 「LLM が提案した値」「ユーザーが確認・上書きする値」という主役の役割が、UI 上では伝わらない。`preview?.title ?? ""` で初期値が入るが、それが「AI 提案」であることは何も示唆されない。フォーマル過ぎる雰囲気のせいで、ユーザーは「自分が一から書いている」気分になる。
  - **問題**: FrontMatter (JSON) が本文プレビューより上に置かれている (`tc-1/03` で確認)。Front Matter は本文の補助メタデータなので、本来は本文を確認した後にメタを編集する流れが自然。さらに JSON 直編集は中〜上級者の動作で、初心者には「これは触らなくていい」と示唆できる位置が望ましい。
  - **問題**: 本文プレビューが `max-h-[280px]` で内部スクロールするため、長文ファイルだと「読まずに登録」の動線が事実上スキップされる。読み取り専用とはいえ、登録される最重要コンテンツであるはずなのに UI 上は補助情報のように扱われている。
- **改善余地**:
  - **AI 提案ラベルを添える**: タイトル / タグ / FrontMatter / 本文プレビューそれぞれに `text-ink-tertiary` の極小キャプション「LLM 提案」を label の右側にゴーストとして付ける (ノイズにならないようにフォントは 11px 程度)。「あなたの編集」と「AI の提案」の境目が薄く可視化されると、ユーザーは確認モードと編集モードを切り替えやすくなる。差分編集後はキャプションを「編集済み」に変える、または `data-edited` で label カラーを微変化させる。
  - **本文プレビューを先に**: フォームの順序を `タイトル → 本文プレビュー → ディレクトリ → タグ → FrontMatter` にすると、「内容を確認 → 整理情報を編集」という認知的な流れに合う。とくに FrontMatter は折りたたみ (`<details>` ベースで「詳細メタデータ」とラップ) にして二段化すると、Apple Calm の「複雑さを表面に出さない」原則と一致する。
  - **fieldset (dir-set) の縁取り**: モックの `border var(--color-hairline)` は適切だが、実装では `DirectoryPicker` の見た目が確認できない。`tc-1/03` を見ると fieldset 風の枠で「ディレクトリ」+ 既存ピッカー + 新規入力がグルーピングされており、これは良い (タイトル / タグの素の field との差別化が効いている)。一方、その下に並ぶタグと FrontMatter は同じ平面で扱われていて、`タグ = 既存タグ orchestration、FrontMatter = 自由メタ` の意味差が出ていない。
  - **sticky action bar**: `border-t border-hairline bg-bg px-6 py-4` の薄い縁取りで本文と分離されており、Apple Calm の "edge but not loud" 路線に合う。`-mx-6 -mb-6 mt-2` の負マージンで panel padding を打ち消す技法も上品。ただし `data-danger=""` の「破棄」と `data-primary=""` の「登録」が同サイズで並ぶため、誤クリックリスクが残る。「登録」が pill primary (黒) / 「破棄」が pill danger (赤系) / 「キャンセル」が neutral という3色並びは、視覚的に "並んだ3つの選択肢" に見える。**「登録」をやや視覚的に主役化** (微妙に右に余白を取る、または「破棄」と区切る) する余地あり。あるいは「破棄」を menu の下に追いやって 2 ボタン構成にする。
  - **FrontMatter エラー表示**: ADR-009 / TC-5 で「JSON 不正時のエラー表示」が要件にあるが、screenshot `tc-5/02-after-submit-invalid.png` を見る限りエラー帯は textarea のすぐ下に来ているはずだが、sticky bar に隠れてビューポート外。submit 後にエラーが見えにくい可能性がある (スクロール位置を自動で送る等の補助が必要)。
  - **textarea の hint**: `placeholder='{"key": "value"}'` だけだと「ここに何を書けば失敗しないか」が分からない。ラベル横に `text-ink-tertiary` で「キー: 値 の JSON オブジェクト」と添えると親切。

### failed / multiResult / timedOut view

参考: `UploadDialog.tsx:470-583`、screenshot `tc-4/01-multi-result.png`

- **failed view**:
  - **語彙**: 「取り込みに失敗しました: {fileName}」は事実的で良いトーン。ただし `{errorCode}: {errorReason}` の直下表示は、内部実装の漏出 (ADR-014 W-B-003 で認知済み) であり、ユーザー視点の言葉ではない。例: "LLM_UPSTREAM_TIMEOUT: upstream timed out after 60s" のような表記はカミングアウトすぎる。**ユーザー向けには 1 文に翻訳した文章** (例: 「LLM の応答が時間内に得られませんでした」) を主、`errorCode` は collapsible に隠す、または隠す程度の対応が望ましい。
  - **ビジュアル**: pill 2 つだけのシンプルな構成は Calm。ただし「破棄」(`data-danger`) が視覚的に一番目立つため、心理的に「失敗 → 破棄する」が誘導される。failed の真の主導線は「キュー画面で詳細を見る」(原因確認 → 再アップロード判断) のはずなので、**primary を反転** (「キュー画面で詳細を見る」を `data-primary`、破棄は neutral pill にする) を検討する余地あり。これは ADR-007 で再試行 UI が無いことの代償措置でもある。

- **multiResult view** (`tc-4/01`):
  - **語彙**: 「3 件中 3 件をキューに追加しました。」「各ジョブのプレビューはキュー画面から順次操作できます。」は明快で Apple Calm のトーン。失敗件数があれば「（N 件失敗）」と補足する書き方も控えめで良い。
  - **ビジュアル**: 中央に Skeleton も無く、テキスト 2 行 + アクション 2 つというミニマル構成。これは正解。
  - **改善余地**: 「閉じる」(neutral) と「キュー画面を開く」(primary) の主従は適切。失敗ファイル一覧 (`failedNames.map`) が `list-disc pl-5` で羅列されるのは機能的だが、ファイル名が長いと弾けやすい。`text-[12px] text-ink-tertiary` で良いが、各行 `truncate` を付け、`title` 属性に full name を持たせるとモバイル幅で安全。

- **timedOut view**:
  - **語彙**: 「推論の完了を待ちきれませんでした。」は穏やかで上品な日本語。Apple Calm 的にとても良い表現。
  - **補足**: 「ジョブはキューに残っています。キュー画面から続きを操作できます。」は安心感を生む。Apple は「失った」「消した」と書かず、必ず「残っている」「戻れる」と書く文化に合致している。
  - **改善余地**: ほぼ完成度高い。あえて言えば、180 秒 = 3 分が体感的に長いので、「数分後に再度確認するか…」のような時間軸の手がかりを添えても良い。

---

## デザインシステム整合

### Apple Calm トーンの達成度

- **余白**: `Dialog` 本体は `p-6` + `max-w-[480px]`、フォームは `flex flex-col gap-4`、sticky bar は `py-4`。間隔が緩やかで Apple Calm 的。ただし editing view は要素が多いため、`max-h-[90vh]` の中に詰め込まれて結果としてスクロール多発。`gap-4` を `gap-5` に少し広げるだけで呼吸感が出る可能性あり。実装値は 16px、Apple のフォーム実例だと 20px が標準的。
- **タイポ**: `dialogTitle: text-lg font-medium`、`fieldLabel`、`text-ink-secondary` の 13px〜14px の小さめテキスト。Calm。`spec/design/pages/P13a-upload-modal.html` の `h1: 22px / font-weight: 400` / `panel-title: 17px / font-weight: 500` / `lead: 14px` という階層は明確だが、実装 `dialogTitle: text-lg font-medium (18px / 500)` で近似している。整合は概ね取れているが、モック側の `letter-spacing: -0.022em` が実装にはない。Apple 系日本語タイポでは tracking を負に振るのが標準。`tokens.css` 側に `--tracking-tight` を入れて `dialogTitle` に当てると統一感が増す。
- **色**: `bg-bg` (#fff) / `bg-surface` (#f5f5f7) / `border-hairline` (rgba 60/60/67 .12) はモックと一致。`text-ink` / `text-ink-secondary` / `text-ink-tertiary` 三階層もモックの `--color-ink-tertiary: #86868b` ベースで一致。accent (黒) と error (赤系) しか色を出さない潔さは Apple Calm の真骨頂。
- **モーション**: `transition-all motion-reduce:transition-none` (ドロップゾーン)、`motion-safe:animate-pulse` (skeleton) のみ。Calm。これ以上の演出は不要。

### tokens.css との整合

- **採用トークン**: `bg-bg`, `bg-surface`, `bg-surface-elevated`, `border-hairline`, `border-hairline-strong`, `text-ink`, `text-ink-secondary`, `text-ink-tertiary`, `text-error`, `bg-error-surface`, `bg-accent` (data-primary)。きれいに揃っている。
- **逸脱**:
  - `IngestionPreviewForm.tsx:45` の `READONLY_CONTENT` で `max-h-[280px]` をハードコード。モックでは `max-height: 240px`。差は許容範囲だが、本文プレビューの最大高さは「タイトル+メタを置いた残り高さ」と連動するため、本来は token 化または `clamp` で動的にしたい。`tokens.css` に `--preview-max-h` を追加するか、`max-h-[35vh]` のような相対値に置き換える余地あり。
  - `min-h-[160px]` (FrontMatter textarea, `IngestionPreviewForm.tsx:237`) もモック値 (`min-height: 140px`) と差。ハードコード値は今後 form 系で再利用するなら token 化候補。
  - sticky bar の `-mx-6 -mb-6` は panel padding `p-6` 前提のマジックナンバー。リファクタリングで panel padding が変わると破綻する。コメントで「panel `p-6` 前提」と明記するか、CSS variable で連動させるとリグレッション耐性が上がる。
- **モバイル幅** (`tc-3/01-preview.png` でデスクトップは確認、モバイル幅実機キャプチャは未確認だが): `max-w-[480px]` ベースなので 640px 未満では padding 4px のバックドロップで端まで張り付く。`Dialog` 自体は `max-h-[90vh] overflow-y-auto` を持つので OK。sticky bar の `flex-wrap` も保険として効く。**懸念**: モバイルでアクション 3 つが横並びになると pill button が縮んで誤タップしやすい。3 つすべて `min-h-[44px]` を保証しているか実装確認の価値あり (現状 `PILL_BTN` の高さは確認していないが、`pillBtn` の `h-7 (28px)` 系統だと 44px 未満)。

---

## 重要な発見（優先度順）

### 高

- **H-1**: editing view の **情報優先度の逆転**: FrontMatter (上級者向け JSON 編集) が本文プレビュー (登録される主コンテンツ) の上にある。順序を `タイトル → 本文プレビュー → ディレクトリ → タグ → FrontMatter (折りたたみ)` に再構成することで、確認 → 編集 → メタ調整の認知的流れに揃う。FrontMatter は `<details>` でデフォルト畳むことで初心者の負荷を下げる。
- **H-2**: editing view で **AI 提案である文脈の喪失**: タイトル / タグ / FrontMatter の各値が「LLM 提案」であることが視覚的に伝わらない。`text-ink-tertiary` の極小キャプション「LLM 提案」を label に添える、または値が編集されると `data-edited` が立つようにして主動詞 (確認 → 上書き) を可視化する。
- **H-3**: failed view の **errorCode / errorReason 生表示**: ADR-014 W-B-003 で認知済みだが UX 観点でも重要。`Issue 226` のスコープ外でフォローアップ済みであるならば、暫定で `errorCode` をモーダル内では非表示にし、`errorReason` のみ自由文として表示するだけでも内部漏洩は減る。さらに将来的にはユーザー向けの定型メッセージへ翻訳する辞書を持つ。
- **H-4**: モバイル幅での **アクションバーのタッチターゲット**: `PILL_BTN` の高さが 44px に届かない可能性があり、3 ボタン横並びだと特に誤タップ。sticky bar 内でのみ `data-mobile-stack` 的に縦並びに切り替える、または `min-h-[44px]` を保証する。

### 中

- **M-1**: failed view の **primary ボタン選択ミスマッチ**: 「破棄」が danger スタイルで一番目立ち、「キュー画面で詳細を見る」が neutral。本来主導線は後者であるべき。primary を反転検討。
- **M-2**: waiting view の **タイムアウト予告の欠落**: 180 秒というハードリミットの存在をユーザーに伝えていない。経過 120 秒程度で「もう少しお待ちいただくか、キュー画面で続きを見る選択もできます」と穏やかに切り替える escape ハッチ告知を入れる。
- **M-3**: editing view の **FrontMatter エラー視認性**: submit 時のバリデーションエラーが textarea の下に出るが、sticky bar の上に隠れる可能性が高い (`tc-5/02-after-submit-invalid.png` で sticky 内では見えない)。submit エラー時に error region へ自動スクロールする、または `aria-live="assertive"` のトースト的領域へエラーを出すのが望ましい。
- **M-4**: `tokens.css` への **未抽出の数値**: `max-h-[280px]`, `min-h-[160px]`, sticky の `-mx-6 -mb-6` 等、form 全体で再利用される寸法が module-scope constant にも token にも抽出されていない。今後 IngestionPreviewForm を他フローで再利用する場合の保守性に響く。

### 低

- **L-1**: select view の **「複数選択にも対応」が control 内部のサブテキスト**: ADR-003 で「複数ファイル時は editing をスキップ」なので、控えめな inline hint で挙動差を予告する余地。
- **L-2**: タイポグラフィの **letter-spacing 統一**: モック側の `letter-spacing: -0.022em` (Apple 系) が `tokens.css` / Tailwind bridge に未定義。`--tracking-tight` を導入して `dialogTitle` 等に当てると統一感が増す。
- **L-3**: multiResult view の **失敗ファイル名 truncate**: 長いファイル名で UI が崩れる可能性。`truncate` + `title` 属性で防御。
- **L-4**: `errorCode` の **大文字スネーク** が UI に直接出る (`LLM_UPSTREAM_TIMEOUT` のような表示) ことの違和感。仮に翻訳辞書がまだ無くても `code` 部分は `font-mono text-[11px] text-ink-tertiary` のような視覚的格下げで「補足情報感」を出す。

---

## 良かった点

- **Dialog プリミティブの活用**: `closable={view.kind !== "uploading"}` で uploading 中の close ロック、`closeOnBackdropClick={!isPending}` で editing 中の backdrop ロック (ADR-013)、× ボタンの初期フォーカス除外、Esc の IME ガード等、共通プリミティブが状態に応じて適切に切り替わっている。Calm の「壊れない」基準を満たす。
- **タイトル入力への自動フォーカス**: `IngestionPreviewForm.tsx:121-124` で `useRef + useEffect` でフォーカスを当てる実装。`autoFocus` ではなく effect 経由にして biome a11y ルールに準拠している点も丁寧。キーボードユーザーは即時に編集に入れる。
- **`SkeletonBlock` の最小主義**: 3 本バーのみ、`motion-safe:animate-pulse` のみで派手な spinner を避けている。Apple Calm 的に正しい選択。
- **ステートマシン構造**: `View` 型が discriminated union で 7 ステート明確化。`cancelledRef` で in-flight upload のレース回避、polling の transient/fatal 切り分け (`isPollFatalError`) も堅実。UX 的に「迷子になる経路」がほぼ無い。
- **timedOut の言葉選び**: 「推論の完了を待ちきれませんでした。ジョブはキューに残っています。」は Apple Calm のお手本のような日本語。失敗を「消失」「失敗」と書かず「残っている」と肯定的に締めるトーンは保たれている。
- **ADR-012 (Fragment) の影響**: `<form>` の外側に `ConfirmDialog` を出す対応で、TC-2 で discard confirm が親 form の submit を発火する不具合を解消。UX 的にも誤登録ロスを防いだ。
- **ADR-011 のフォールバック動線**: fatal error 時に `view = "failed"` ではなく `view = "select"` + error バナーへ戻す判断は、ジョブが取得できない状況でのデータ整合性を保ちつつユーザーに「やり直す」動線を残しており Calm。
