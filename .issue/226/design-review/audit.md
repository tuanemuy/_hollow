# Design Audit — Issue #226 Upload Preview Modal

対象: PR #251 / ブランチ `issue/226/upload-preview-modal`
監査者: design-audit (Opus 4.7)
監査範囲: Accessibility / Performance / Theme / Responsive

---

## サマリー

| 観点 | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Accessibility | 0 | 3 | 4 | 3 |
| Performance | 0 | 1 | 3 | 2 |
| Theme | 0 | 0 | 4 | 2 |
| Responsive | 0 | 2 | 3 | 2 |

総合所感:
- 既存の `Dialog` 共通プリミティブ（focus trap、Esc 抑止、portal、`closable` ガード、IME 配慮、二重ダイアログのスクロールロック count）が十分に作り込まれており、土台のアクセシビリティ品質は高い。
- 一方、本 Issue で追加された **editing view の長尺フォーム × sticky action bar × `max-h-[90vh]` 折りたたみ** の組み合わせから、モバイル可読性・スクリーンリーダー向け状態通知・本文プレビュー領域の高さ整合あたりに改善余地がある。
- Critical 級（操作不能・致命的）は発見されなかった。

---

## Accessibility

### Critical
- なし。

### High

- **A11y-H1 — `Dialog` の `aria-labelledby` が使われておらず、タイトル h2 とダイアログ名がプログラム的に関連付けられていない**
  - 該当: `app/components/ingestion/UploadDialog.tsx:309-317`
  - `Dialog` には `ariaLabel="アップロード"` のみが渡され、内部の `<h2 className={dialogTitle}>アップロード</h2>`（317 行目）には `id` も無く、`ariaLabelledBy` も配線されていない。
  - 結果として SR は「アップロード」（aria-label）を announce するが、ダイアログ内のタイトル h2 はランドマークとして拾われない。`ConfirmDialog`（`app/components/common/ConfirmDialog.tsx:38, 52, 57`）は同じ題材で正しく `useId` + `ariaLabelledBy` を配線している（参考実装）。
  - 影響: WAI-ARIA Authoring Practices の Dialog パターン（visible title を `aria-labelledby` で指すのが正）から逸脱。重要度 High。

- **A11y-H2 — `editing` view 突入時のフォーカス移動が「初期フォーカス」と二重で発生し、`Dialog` 側 rAF と `IngestionPreviewForm` 側 `useEffect(() => titleInputRef.current?.focus(), [])` が競合する可能性**
  - 該当: `Dialog.tsx:255-279`（初期フォーカス rAF）, `IngestionPreviewForm.tsx:117-124`（タイトル input 強制フォーカス）
  - `Dialog` が rAF タイミングで `INITIAL_FOCUS_SELECTOR` の最初の focusable に focus を寄せ、その後 React 側で `IngestionPreviewForm` 内 effect がタイトル input に focus し直す。結果として「最初の focusable」と「タイトル input」が同一であれば実害無いが、`editing` view では最初の focusable は確かにタイトル input なので**現状一致**しているが、依存関係としては脆い（後で項目順を変えたら静かに壊れる）。
  - 加えて、`waiting → editing` 遷移は Dialog をマウント解除せず children だけ差し替えるため、`Dialog` 側の初期フォーカス effect は再実行されない一方、`IngestionPreviewForm` 側 mount effect だけが走る。結果としてフォーカスが waiting view の skeleton コンテナ（`tabIndex` 無し → panel）から title input にジャンプし「ユーザーの操作なしにフォーカスが動く」現象が SR ユーザーに混乱を与える可能性。
  - 影響: フォーカス挙動の二重契約。重要度 High。

- **A11y-H3 — `waiting` / `uploading` / `multiResult` / `timedOut` / `failed` のステート遷移が SR に announce されない（`aria-live` の region 設計が部分的）**
  - 該当: `UploadDialog.tsx:431-457`（`aria-live="polite"` は `Uploading` と `Waiting` の中だけ）
  - 「`select` → `uploading` → `waiting` → `editing`」と Dialog の中身が差し替わるが、各 view 自体に `aria-live` が付くだけで、view 間の遷移自体は announce されない（マウントされた瞬間のテキストは aria-live=polite 領域内なら読まれるが、その領域は遷移ごとに新規 DOM になるため、ブラウザによっては読み上げが落ちる）。
  - 例: `editing` 突入時、SR ユーザーには「LLM がタイトルとメタデータを提案中...」から突然タイトル input にフォーカスが飛ぶだけで、「プレビュー編集に進みました」のような状態通知が無い。
  - `multiResult` / `timedOut` / `failed` も同様で、これらは結果通知系なので `role="status"` か `aria-live="polite"` をルート要素に付けるべき。
  - 影響: 状態変化の見落とし。重要度 High。

### Medium

- **A11y-M1 — `<select>` 言語的ラベル「未選択」がプログラム的にプレースホルダ扱いされていない**
  - 該当: `IngestionPreviewForm.tsx:197-210` → `DirectoryPicker`（既存コンポーネント）。
  - スクリーンショット tc-1/02 でも「未選択」option が表示されているが、これは "no choice" の placeholder option で disabled / `value=""` 経由ではない可能性がある（`DirectoryPicker` の実装は未確認だが）。`<select>` で未選択ラベルを置く場合 `value=""` + `disabled` で SR にプレースホルダーとして伝えるのが望ましい。
  - 影響: SR が初期値を「未選択」という選択肢として読む。重要度 Medium。

- **A11y-M2 — `dropzone` キーボード操作の代替動線が無い**
  - 該当: `UploadDialog.tsx:387-414, 58`
  - `<label htmlFor={inputId}>` でクリック動線は `<input type="file">` に委譲されており、Tab で input にフォーカス → Space/Enter で OS のファイル選択が開くため最低限の操作性は確保されている。ただし `[&_input[type=file]]:hidden` で input が `display:none` になっており、ブラウザ実装によっては focus 不可になる懸念がある（実機は概ね focusable）。
  - `data-dragover` は keyboard 経由では絶対に立たないので「Drag & Drop or click」UI を keyboard-only ユーザーが「click だけ可能」と読み取れる導線（`aria-label` で「ファイルを選択」と明示）が欲しい。
  - 影響: keyboard-only ユーザーが dropzone の用途を判別しにくい。重要度 Medium。

- **A11y-M3 — `IngestionPreviewForm` の textarea ラベル「FrontMatter（JSON）」に対するエラー文脈が `aria-describedby` で関連付けられていない**
  - 該当: `IngestionPreviewForm.tsx:227-240, 251-255`
  - 入力ミスで commit 時にエラーが出るが、`role="alert"` の `<p>` はフォーム末尾の独立段落で、どのフィールド由来かは視覚的にも SR 的にも紐付かない。tc-5 のスクリーンショットでも、無効な FrontMatter（`{not: "valid"}`）でエラーが出る状況だが、Dialog の `max-h-[90vh]` 制約と sticky action bar に隠れてエラー本文自体がスクロールしないと読めない（tc-5/02-after-submit-invalid.png では action bar の上にエラーが見えるべきだが見えていない）。
  - 影響: validation エラーの可視性とプログラム的関連付けの両方が弱い。重要度 Medium。

- **A11y-M4 — `aria-busy` が `uploading` / `waiting` / `isPending` 時にダイアログに付与されていない**
  - 該当: `UploadDialog.tsx:308-316`（dialog ルート）, `IngestionPreviewForm.tsx:113`（submit pending）
  - 個別の input は `disabled={isPending}` で操作不能になるが、SR に「処理中」であることを区分する `aria-busy="true"` の表明が無い。`disabled` 属性の連発は SR が「全フィールド disabled」を 1 個ずつ読み上げ得る点でも望ましくない。`role="dialog"` 側に `aria-busy` を集約するのが王道。
  - 影響: 進行状況の判別性。重要度 Medium。

### Low

- **A11y-L1 — `closable={view.kind !== "uploading"}` で「アップロード中は ×・Esc・backdrop ぜんぶ閉じない」ように見えるが、`closeOnBackdropClick={!isPending}` の `isPending` は `uploading | waiting | editing` を含み、編集中も backdrop closable 不可になる**
  - 該当: `UploadDialog.tsx:303-316`
  - `editing` view では × ボタンと Esc / Cancel button で閉じられるので backdrop 不可は意図通りだが、ドキュメント化されていない（plan/adr に該当 ADR が見当たらない）。誤クリック保護として妥当だが、UX 規範としてはレビュー時に意図を明示しておきたい。重要度 Low。

- **A11y-L2 — `FailedView` / `MultiResultView` のヘッディング階層が無い**
  - 該当: `UploadDialog.tsx:491-522, 537-561`
  - Dialog ヘッダ「アップロード」h2 の次が `<p>` で本文が始まる。各 view の用途（失敗・複数結果通知）は機能的に sub-section なので、`<h3>` で見出しを付けると SR がランドマーク移動できる。重要度 Low。

- **A11y-L3 — `transition-all` / `transition-colors` のフォールバック `motion-reduce:transition-none` は正しく付与されている。ただし `motion-safe:animate-pulse`（`SkeletonBlock`）は OS の reduce-motion 設定時に pulse が消えるだけで skeleton ブロックの存在自体は分かるので OK。Skeleton 表示時間が体感長いと「処理が進んでいるか分からない」感覚になるので、`aria-live="polite"` 領域に進捗の数値（経過秒数など）を入れるとさらに親切。**
  - 該当: `UploadDialog.tsx:445-468`
  - 重要度 Low、nice-to-have。

---

## Performance

### Critical
- なし。

### High

- **Perf-H1 — Polling 中の `setView` が `transientFailures` だけ更新する用途でも view object 全体を再生成して effect 依存（`view`）を再走らせ、結果として「polling tick が走るたびに polling effect も unmount→mount」相当の挙動になる**
  - 該当: `UploadDialog.tsx:156-217, 201-206`
  - `useEffect(..., [view, getJob, onClose])` の依存に `view` が入っているため、`setView({ kind: "waiting", ..., transientFailures: nextFailures })` で polling 失敗カウントを進めるたびに effect cleanup → 再 mount → `setTimeout(tick, POLL_INTERVAL_MS)` が再キックされる。
  - 実害は薄い（polling のリスケジュール自体は新しいタイマー 1 本）が、`pollTimerRef` が cleanup 経路で正しく clear されているので二重発火は起きない。ただし `cancelled = true` をセットしてから直後に新しい closure で `cancelled` が再 false になるレース構造で、コード意図と実装の認知的距離が大きい。`transientFailures` を `useRef` で持ち view discriminant に含めないようにすると effect の依存が減って読みやすい。
  - また、`POLL_INTERVAL_MS = 1800` × 最大 180 秒 = 約 100 回のリクエスト。Cloudflare Workers の billable invocation を増やす点で軽視できない（複数ユーザー × 複数タブ × 複数ジョブで線形に増える）。重要度 High（コスト面）。

### Medium

- **Perf-M1 — `useEffect` で directory tree を毎回の `editing` 突入ごとに loading 状態にしているが、`tree.length > 0` で短絡しても、`view` 全体を依存にしているため `setView` で view object の identity が変わると effect 自身が再走る**
  - 該当: `UploadDialog.tsx:126-148`
  - 内部で `if (view.kind !== "editing") return;` の早期 return があるので副作用は無いが、依存配列に `view` を入れるのは過剰。`view.kind === "editing"` の boolean を依存にする方がよい。重要度 Medium。

- **Perf-M2 — `IngestionPreviewForm` で `useMemo` を 3 つ使っているが、依存は `preview`（オブジェクト reference）で、`preview` は親 `view.job.preview`。`editing` view 突入時に 1 度だけ計算されれば十分なのにメモ化のコストが見合わない可能性**
  - 該当: `IngestionPreviewForm.tsx:83-99`
  - これは micro-optimisation で実害は無いが、`useMemo` よりもただの定数で十分。重要度 Medium、nice-to-have。

- **Perf-M3 — 本文プレビューは `dangerouslySetInnerHTML` で渡される。`READONLY_CONTENT` の `max-h-[280px] overflow-y-auto` 領域内に潜在的に大きな HTML（画像、長文）が来るとレイアウト計算コストが高い**
  - 該当: `IngestionPreviewForm.tsx:243-248, 44-45`
  - サニタイズ済み HTML のサイズ上限は usecase 側でガードされているか不明。Dialog の `max-h-[90vh]` と組み合わせると body の reflow が連鎖する。重要度 Medium。

### Low

- **Perf-L1 — `getDirectoryTreeFn` を `editing` view 突入時に必ず呼ぶが、複数ファイルアップロード後にキュー画面（同じ getDirectoryTree を loader でも使う想定）に戻る場合キャッシュ無し。React Query / TanStack Query 系のキャッシュレイヤーを使えば再 fetch 不要にできる。**
  - 重要度 Low。

- **Perf-L2 — `bodyScrollLockCount` モジュールスコープ変数は HMR で破棄され、開発時に overflow:hidden がスタックすることがある（実装 comment 通り）。本番には影響しないため Low。**

---

## Theme

### Critical
- なし。

### High
- なし。

### Medium

- **Theme-M1 — `READONLY_CONTENT` が `max-h-[280px]` という任意値で、`tokens.css` 由来でない**
  - 該当: `IngestionPreviewForm.tsx:44-45`
  - モック (`P13a-upload-modal.html`) は `max-height: 240px` で、実装は `280px`。設計と実装で差異がある。`tokens.css` には `--space-*` 系しか高さトークンが無いので、ここを「コンテンツプレビュー専用の高さトークン」として `tokens.css` に追加するか、`spec/design/tokens.md` 側でこの差を許容する判断を ADR に書くか、いずれか。重要度 Medium。

- **Theme-M2 — `IngestionPreviewForm` の sticky action bar 周りで `-mx-6 -mb-6 px-6 py-4` という direct value 6 が複数箇所に**
  - 該当: `IngestionPreviewForm.tsx:257`
  - `Dialog` の `p-6`（`dialog` 共通スタイル）と整合させるための数値だが、`6` は `--spacing-6 = 24px` 経由なので token 内には収まっている。ただし「Dialog の内側 padding を打ち消す」という意図がコードからは読み取りにくい。コメントが欲しい。重要度 Medium、可読性問題。

- **Theme-M3 — モーダル背景は `bg-black/35`（`dialogBackdrop`）でハードコード**
  - 該当: `app/components/common/styles.ts:43-44`
  - `tokens.css` には backdrop 専用の色トークンが無い。本 Issue 由来ではないが、本 Issue で初めて「フォームを含む大きなモーダル」が登場し、より長時間 backdrop を凝視する文脈が増える。`--color-backdrop` を追加して透明度を中央集権化する候補。重要度 Medium、tech-debt。

- **Theme-M4 — `bg-bg` を action bar に使っているが、`dialog` 内の panel 背景も `bg-bg`。action bar の境界（border-top）と panel 背景が両方 white で、コントラストが border-hairline (rgba 0.12) のみに依存している**
  - 該当: `IngestionPreviewForm.tsx:257`
  - tc-2/03、tc-1/03 のスクショで実際に「action bar が浮いている感」が薄く、textarea のコンテンツが action bar の下に見切れている（border-top はあるが、半透明 hairline は明度コントラストが弱い）。`bg-surface-elevated` か `bg-bg` + `shadow-sm` の上方影で立体感を出すと、sticky action bar の境界が読み取りやすい。重要度 Medium、視認性。

### Low

- **Theme-L1 — `data-*` 属性パターン（`data-primary=""`、`data-danger=""`、`data-dragover={...||undefined}`）は CLAUDE.md ADR-003 に正しく従っている。**
  - 良好。

- **Theme-L2 — `pillBtn` / `PILL_BTN` の二重定義**
  - 該当: `app/components/common/styles.ts:12-13` と `app/components/layout/styles.ts:19-20`
  - `PILL_BTN` (layout) は `max-sm:min-h-[44px]` を含むが `pillBtn` (common) は含まない。本 Issue では `IngestionPreviewForm` が `PILL_BTN` を使い、`UploadDialog` が `pillBtn`（小文字）を使っており**モバイルタッチターゲット保証が不揃い**。重要度 Low（実害は Responsive セクション参照）。

---

## Responsive

### Critical
- なし。

### High

- **Resp-H1 — `Dialog` panel の `max-h-[90vh] overflow-y-auto`（`app/components/common/styles.ts:55-56`）と `IngestionPreviewForm` の sticky action bar (`sticky bottom-0 -mx-6 -mb-6`) の組み合わせで、モバイル縦長時に「action bar が常に画面に貼り付くが、本文プレビュー領域の高さが詰まりすぎてスクロール 2 重」になる**
  - 該当: `app/components/common/styles.ts:55`, `IngestionPreviewForm.tsx:44-45, 257`
  - panel 全体が `overflow-y-auto`、その内部の `READONLY_CONTENT` がさらに `overflow-y-auto`、その下に sticky action bar。スマホ縦長で textarea (`min-h-[160px]`) + 本文プレビュー (`max-h-[280px]`) + action bar (sticky) を引くと、可視のフォーム領域が極端に狭くなる。
  - tc-1/02 のスクショ（デスクトップ Chrome 1280×640 想定）でも、Front Matter textarea が action bar の真下にチラッと見える状態。モバイルでは更に詰まる。
  - 想定外: viewport 高さが 600px 程度のスマートフォン横向き時、`max-h-[90vh]` が ~540px → タイトル + ディレクトリ + タグ + textarea + 本文プレビュー + action bar が 100% 入らないため、`overflow-y-auto` で内側スクロールするが、sticky action bar が overflowed area の bottom に貼り付くか panel の bottom に貼り付くかは UA 依存（仕様としては closest scrollport の bottom）。本実装では panel が closest scrollport なので panel bottom に sticky するが、これは「画面の最下端」とは限らない。
  - 影響: モバイル横向きで action bar が読みづらい。重要度 High。

- **Resp-H2 — `pillBtn` (common/styles.ts) はモバイル時の `min-h-[44px]` を含まない。`UploadDialog` の `SelectView` / `FailedView` / `MultiResultView` / `TimedOutView` は `pillBtn` を使用しており、Tap target 44px ガイドライン（WCAG 2.5.5 / Apple HIG）を満たさない**
  - 該当: `app/components/common/styles.ts:12-13` vs `app/components/layout/styles.ts:19-20`
  - `UploadDialog.tsx` 内のボタン (`421, 510, 553, 556, 574, 577`) は全て `pillBtn` で 36px。一方 `IngestionPreviewForm.tsx` 内（`PILL_BTN`）は 44px 保証あり。Issue #226 のモック (`P13a-upload-modal.html:184` `.pill { height: 36px; }`) もデスクトップ前提で 36px だが、Mobile sample (line 327-) は同じクラスを使い、44px ガイドラインに反する。
  - 影響: モバイル誤タップ率上昇。重要度 High（実装の一貫性とアクセシビリティの両面）。

### Medium

- **Resp-M1 — `dialog` token の `max-w-[480px]` 固定で、デスクトップ大画面で「フォーム + 本文プレビュー」が窮屈**
  - 該当: `app/components/common/styles.ts:55-56`
  - Editing view は他のシンプルダイアログ（ConfirmDialog の Yes/No）と同じ panel size を共有しているため、フォームの密度が高い。`max-w-[480px]` を `max-w-[min(640px,calc(100vw-32px))]` のように増やす（または editing view 専用に override する）と本文プレビューが横長で読みやすくなる。
  - モック (`P13a-upload-modal.html:53-54`) は `grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));` で 3 状態を横並べに見せているだけで、Dialog 自身の最大幅は規定されていない。設計判断として `editing` だけ広めにする選択肢を ADR に残すと良い。重要度 Medium。

- **Resp-M2 — `safe-area-inset-bottom` 対応無し（モバイル × home indicator）**
  - 該当: `IngestionPreviewForm.tsx:257`（sticky action bar）
  - iOS Safari の home indicator 重なり領域に sticky action bar が被る。`pb-[max(1rem,env(safe-area-inset-bottom))]` のような対応が欲しい。重要度 Medium。

- **Resp-M3 — `flex-wrap` で action bar のボタン折り返しは可能だが、折り返した瞬間の高さ変動で sticky 領域が再計算され、ジャンプする**
  - 該当: `IngestionPreviewForm.tsx:257`
  - 「キャンセル / 破棄 / 登録」の 3 ボタンが狭幅で 2 段になると panel scroll が再レイアウトされる。実害は限定的だが、`min-w-0` や grid + auto-flow への切り替えで安定する。重要度 Medium、nice-to-have。

### Low

- **Resp-L1 — `--breakpoint-sm` (640px) のブレークポイント以下を `max-sm:` で扱う規約に従っているが、`UploadDialog` 系で `max-sm:` を一切使っていない**
  - 該当: `UploadDialog.tsx` 全般
  - dropzone (`px-6 py-12`) や action bar も responsive variant 無し。640px 以下で詰める必要が無いと判断したのか、ADR / plan に記載が無く意図が読みにくい。重要度 Low、ドキュメント化要望。

- **Resp-L2 — `tokens.css` の `--bp-sm: 640px` と `index.css` の `--breakpoint-sm: 640px` の二重定義は規約通り（CLAUDE.md に明記）で問題なし**

---

## 良かった点

- `Dialog` 共通プリミティブが堅牢: focus trap, Esc 抑止 IME 配慮, backdrop origin-guard, scroll lock count, portal, SSR ガード, `closable` ガード, alertdialog 分岐がすべて 1 箇所に集約され、`UploadDialog` / `ConfirmDialog` / `IngestionPreviewForm` の `ConfirmDialog` ネストにも耐えている。
- `cancelledRef` と `pollTimerRef` の対で「dialog 閉じた後の stale setState」「stale timer」を両方ガードしているのは丁寧。
- `displayError(error)` と `FORM_ERROR` の組み合わせが既存の error contract に綺麗に乗っている。`role="alert"` の付与も適切。
- `motion-reduce:` / `motion-safe:` のペアでアニメーション設定を尊重している。
- `data-*` 属性パターンと `data-[primary]:` 系の Tailwind variant が CLAUDE.md ADR-003 に整合。
- `Dialog` の `ConfirmDialog` ネスト（破棄確認）が `aria-labelledby` 配線まで含めて模範的に動いている（tc-2/05 で確認）。
- `multiResult` view の「失敗ファイル名リスト」表示は分かりやすい (tc-4/01)。
- `formatInitialFrontMatterJson` の「空オブジェクトを `""` として表示」する小さな配慮は UX として丁寧。
- `closable={view.kind !== "uploading"}` で「アップロード中は閉じられない」という防御は正しい。

---

## 推奨対応順序

1. **A11y-H1** — `Dialog` に `ariaLabelledBy` を渡すよう `UploadDialog` を修正（h2 に `useId` を当てて `dialogTitle` を関連付け）。最小 diff・最高インパクト。
2. **Resp-H2** — `pillBtn` (common) にも `max-sm:min-h-[44px]` を入れて `PILL_BTN` (layout) と統一。`UploadDialog` 内の全ボタンが恩恵を受ける。
3. **A11y-H3** — `Dialog` ルートに `aria-live="polite"` または各 view に `role="status"` を付与し、状態遷移を announce する。
4. **Resp-H1** — モバイル縦/横の挙動を確認し、`READONLY_CONTENT` の `max-h-[280px]` を `clamp` か `max-h-[40vh]` に変更、`safe-area-inset-bottom` を action bar 余白に組み込む。
5. **A11y-M4** — `aria-busy={isPending}` を `Dialog` panel か `<form>` ルートに付与。
6. **A11y-H2** — `IngestionPreviewForm` 側の `titleInputRef.focus()` を `Dialog` の初期フォーカスに委譲（タイトル input が最初の focusable である前提で）するか、`Dialog` の `INITIAL_FOCUS_SELECTOR` を意識した実装方針を ADR に残す。
7. **A11y-M3** — Front Matter エラーを textarea の `aria-describedby` で紐付け、エラーが visible になるようスクロール / focus 移動を入れる。
8. **Theme-M4** — sticky action bar の境界視認性を `bg-surface-elevated` ベース + `shadow-sm` 上方シャドウで上げる。
9. **Theme-M1 / Resp-M1** — Dialog 内のフォーム専用に `max-w` と本文プレビューの `max-h` をトークン化（あるいは設計差を ADR で明示）。
10. **Perf-H1** — polling effect の依存から `view` を外し、`transientFailures` を `useRef` に移す（読みやすさとリクエスト数削減）。
11. **A11y-M1 / M2 / L1 / L2 / L3** — SR ナビゲーション細部の改善（dropzone aria-label、select placeholder、見出し階層、closable 仕様明文化）。
12. **Theme-M3 / Perf-M*** — backdrop トークン化、micro-optimisation 系。

---

## 補足: スクリーンショット参照

- `tc-1/02-after-upload.png` — editing view 初期状態。タイトル / ディレクトリ / タグまでが見える。Front Matter textarea は action bar の下に見切れている → Resp-H1 の根拠。
- `tc-1/03-edited-fields.png` — 編集後。`{"source": "tc-1", "verified": true}` が textarea に見えるが、action bar の下なのでスクロール必須。
- `tc-2/05-confirm-dialog.png` — `ConfirmDialog` ネスト動作確認。良好。
- `tc-4/01-multi-result.png` — `MultiResultView` の閉じる/キュー画面を開くボタンが両方 36px (pillBtn) で隣接、モバイルではタッチターゲット不足 → Resp-H2 の根拠。
- `tc-5/02-after-submit-invalid.png` — Front Matter invalid 投入後、エラー文が action bar に隠れて見えない可能性 → A11y-M3 の根拠。
- `tc-5/02-invalid-error.png` — エラー文 visible だが textarea 直下ではなく form 末尾。`aria-describedby` で紐付け要 → A11y-M3。
