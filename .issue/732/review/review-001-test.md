# PR #733 レビュー（Test 観点） — Issue #732

対象差分: `gh pr diff 733`
参照: `.issue/732/plan.md`（受け入れ基準・テスト方針）/ `docs/test.md` / 既存 `useAuthGuardEffect.test.tsx`

実行確認: `pnpm vitest run app/components/common/__tests__/useAuthGuardEffect.test.tsx app/routes/_app/__tests__/selectUnauthenticatedView.test.tsx` → 2 files / 12 tests 全 green。

## Test

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001] 既存 invalidate 契約 6 ケースは無改修で維持されている（AC-4(a) 担保 OK）**
  場所: `app/components/common/__tests__/useAuthGuardEffect.test.tsx:97-176`
  `git diff main...HEAD` 上、既存テストファイルへの変更は**追加のみ・削除ゼロ**（`grep '^-'` で deletions なし）。既存 `Probe`（戻り値を捨てる）と 6 ケース（fresh no-op / 不整合 1 回+filter shape / 認証済み no-op / 不可能ケース no-op / 同一 id 非再発火 / id 変化で再発火）は byte 等価で温存され、plan の arch-risk S-003（戻り値検証を `Probe` に混ぜない）・AC-4(a)（発火回数等価のピン留め）方針どおり。発火回数 assert（`toHaveBeenCalledTimes(1/2)`）と filter shape assert（`/_app` true / `/_app/notes` false）が `appShellInvalidate` 経由を間接証明している点も維持。実装側 hook は `useEffect` 本体の発火条件・依存配列を変更前と byte 等価に保っており（`adr.md` ADR-002 実装メモ、`useAuthGuardEffect.ts:499-502`）、戻り値用 `isAuthMismatch` は同一式をトップで 1 回算出するのみ。発火回数契約への regression リスクは構造的に排除されている。

- **[N-002] `BoolProbe` の戻り値契約 3 ケース＋収束遷移は意味のある検証（偽 green でない）**
  場所: `useAuthGuardEffect.test.tsx:69-78, 184-232`
  `BoolProbe` は `String(isResolvingAuthMismatch)` を `[data-testid="flag"]` に描画し `"true"/"false"` を assert する。文字列化のため `undefined`（hook が戻り値を返し忘れた等）は `"undefined"` となり 3 ケースいずれも fail する。分岐の真偽が反転すれば各 assert が落ちるためミューテーション感応性あり。収束テスト（214-231）は同一 `root` への 2 回目の `render`（unmount/remount でない正しい再 render）で `shellUserDto` を user→null に変化させ `"true"→"false"` を確認しており、AC-5 の「shell null 化でフラグが落ちる」遷移を hook 単体で確定する plan ステップ 6 の意図どおり。fresh 未認証ケース（198-203）は AC-2 の hook 側ピン留めとして機能している。

- **[N-003] `selectUnauthenticatedView` 純関数テストは AC-2（分岐の向き・誤抑制防止）を確実に担保**
  場所: `app/routes/_app/__tests__/selectUnauthenticatedView.test.tsx:37-47`、実装 `app/routes/_app/index.tsx:587-594`
  plan ステップ 5（原則必須）どおり分岐選択が純関数として切り出され（`export function selectUnauthenticatedView`）、`true→null` / `false→LandingPage` がユニットでピン留めされている。`flag false → LandingPage` は `isValidElement(view) && view.type === LandingPage` で要素型を直接照合しており、`LandingPage` を `() => null` にモックしても型同一性で識別できる堅い assertion。分岐が反転すれば `selectUnauthenticatedView(false)` が `null` を返し `isValidElement` が false になって fail するため、最重要リスク（fresh 未認証の誤抑制）を捕捉できる。`getRouteApi` モックは module-load 時の `createFileRoute("/_app/")` クラッシュ回避目的で、純関数自体は `Route`/`appLayoutRoute` に依存しないため副作用なく安全。

- **[N-004] テストの命名・配置・モック戦略は docs/test.md と既存作法に整合**
  配置は両ファイルとも `__tests__/*.test.tsx`（docs/test.md「`**/__tests__/<target>.test.ts`」準拠、tsx は React harness のため妥当）。`// @vitest-environment happy-dom`・`vi.mock("@tanstack/react-router", ...)` は既存 `useAuthGuardEffect.test.tsx` の手法を踏襲。Frontend は docs/test.md で「必要最小限」とされており、本変更（純関数 + hook 戻り値の薄い検証）はその粒度に収まる。`selectUnauthenticatedView.test.tsx` の `importOriginal` spread で `getRouteApi` のみ差し替える手法も、route module 全体のモック化を避けた最小介入で適切。

- **[N-005] カバレッジの穴: `HomeRoute` 本体の配線（hook 戻り値→`selectUnauthenticatedView`→`!data.authenticated` 分岐 / 認証済み→`data.Home`）は自動テスト対象外**
  場所: `app/routes/_app/index.tsx:177-187`
  分岐選択（純関数）と hook 戻り値（`BoolProbe`）は個別にピン留めされているが、両者を `HomeRoute` 内で結線している箇所（`if (!data.authenticated) return selectUnauthenticatedView(isResolvingAuthMismatch)` / 認証済みで `data.Home` を返す = AC-3）は server component のフルレンダリングが重いため自動テストが無く、手動テストに委ねられている。これは plan ステップ 5 / テスト方針（「server component の都合でフルレンダリングが重いので分岐選択を純関数として切り出し」「AC-3 は手動テスト」）で明示的に受容された設計判断であり、plan 逸脱ではない。残存リスクは「配線の取り違え（例: 認証済み分岐で誤って `selectUnauthenticatedView` を呼ぶ、引数取り違え）」だが、コードは 3 行と単純で `.issue/732/testing.md` 確認項目 3（AC-3）/ 項目 2（AC-2）の手動目視で補完される。指摘というより plan 整合の確認として記録。

- **[N-006] 過渡フレーム「未認証 UI ゼロフレーム」（AC-1）と RPC 回数維持（AC-4(b)）は本質的に手動担当で plan どおり**
  AC-1（不整合観測の 1 フレームで `LandingPage` が描かれない）と AC-4(b)（初回 1・以降 0 RPC・`staleTime: Infinity` 維持）は、fire-and-forget の過渡フレームや実 RPC 回数を純ユニットで観測しにくいため、plan は手動ブラウザ検証（`.issue/732/testing.md` 確認項目 1・エッジケース 1）を主担当としている。ユニット側は AC-1 を「不整合中フラグ true → null 描画」（`selectUnauthenticatedView(true)===null`）に、AC-4 を「発火回数等価」に分解して代替担保しており、検証手段の分担は plan の AC 表・テスト方針と一致。自動化の追加要求は過剰であり妥当な線引き。
