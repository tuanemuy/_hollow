# Plan Review (round-2) — Issue #803: タグ入力候補パネルの viewport クランプ / 外側クリッククローズ

**視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**対象:** `.issue/803/plan.md` / `.issue/803/adr.md`
**確認基準:** round-1 指摘（P-001 / S-002 / S-003）の反映確認 ＋ 新規リスク。`usePopover.ts` の `computeShiftY` 実装で natural 復元の数学的妥当性を再検証。

---

## round-1 指摘の反映確認

### P-001（natural 復元補正）— 反映済み・正確

- **実装ステップ2:** `computeShiftY({ top: rect.top - shiftY, bottom: rect.bottom - shiftY }, window.innerHeight)` の補正が明記され、`shiftY` を依存に含め同値バイルアウトで収束する旨も記載（plan L87-88）。
- **設計（UI item 1）:** L67 に「natural（未シフト）rect への復元補正（必須）」として、不変条件・transform フィードバックの原因・補正式・収束・初回等価まで丁寧に説明。
- **リスク欄:** L127 に再掲し、具体例（viewport 633 / natural top=500/bottom=760 → shiftY=-135 → 候補減で補正無しだと 95px はみ出し残存）を提示。
- **ADR-004:** 本件専用 ADR を新設（plan L73-101 の adr.md）。不変条件・usePopover で前提が満たされる理由・本件で破れる理由・補正式・収束根拠・「reset→再測定の二段構え」代替案の却下理由（ちらつき）まで網羅。
- **テスト是正（ステップ5）:** L106-109 で「固定 rect では transform フィードバックを検出できず緑になる」問題を明示し、(a) spy が現在の transform を読みシフト後 rect を返す形 / (b) `mockReturnValueOnce` で段階 rect を返す形、の2案を提示。「固定 rect では緑だが補正を外すと落ちる」テストにすることを必須要件として明記。round-1 で求めた「バグ検出能力の担保」を満たす。

**数学的検証（usePopover.ts L88-101 実装に照合）:** `computeShiftY` は `rect.bottom > vh - margin` を先に、次に `rect.top + shift < margin` を補正し、`natural` のみから決まる絶対オフセットを返す。`transform: translateY(shiftY)` 適用時 `rect = natural + shiftY` なので `rect - shiftY = natural` で正しく復元される。useLayoutEffect は commit のスタイル適用後・paint 前に走るため、2 パス目の `getBoundingClientRect()` は transform を反映する＝補正前提が成立。2 パス目の算出値は natural 不変ゆえ初回と同一 → `setShiftY` が `Object.is` でバイルアウト → 収束（無限ループなし）。補正式・収束ロジックともに**数学的に正しい**。

### S-002（outside-click listener churn / exhaustive-deps）— 反映済み

- 実装ステップ4（L98）に専用の対策節。「ハンドラ内で closePanel（毎レンダー再生成）を呼ぶと churn / biome 指摘」という問題認識のうえで、setter 直呼び（`setOpen(false)`/`setActiveIndex(-1)`）または ref 経由で deps を `[panelOpen]` に限定、`usePopover.onDocMouseDown` と同方針・既存の `biome-ignore` 方針との一貫性まで記載。round-1 提案と一致。

### S-003（測定 effect の null / 環境ガード）— 反映済み

- 実装ステップ2（L87）に `const el = panelRef.current; if (el === null) return;` ガードの踏襲を明記。SSR で `panelOpen` 初期 false → パネル未描画 → effect 早期 return ゆえ `window`/`getBoundingClientRect` 不在が実害なしの根拠も記載。round-1 提案と一致。

---

#### 問題点（要修正）

問題点ゼロ。round-1 の P-001 / S-002 / S-003 はいずれも plan・ADR・リスク・テストの各所に正確に反映され、natural 復元補正は `computeShiftY` 実装に照らして数学的に妥当。新規の P 級リスク（補正導入による別の不整合・SSR/初回・無限ループ）は確認されない。

- **無限ループ/フィードバック:** `shiftY` を deps に含めるが、補正後 natural は不変で 2 パス目が同値バイルアウトするため収束する（検証済み）。
- **初回（shiftY=0）:** 補正項ゼロで usePopover 流と等価。transform 未適用の natural を測定する経路も保たれる。
- **SSR:** `panelOpen` 初期 false でパネル未描画、effect 早期 return。新たな SSR 警告は増えない。
- **0 への復帰:** 非 open で `setShiftY(0)`、open でオーバーフロー解消時は `computeShiftY` が 0 を返し `setShiftY(0)` → バイルアウト。usePopover の `if (next !== 0)` ガードと異なり無条件 set だが、本件は「はみ出し解消時に 0 へ戻す」要件があるため無条件 set が正しく、副作用なし。

#### 改善提案（検討推奨）

改善提案ゼロ。round-1 の S 級はすべて解消済みで、新たに足すべき構造的改善は見当たらない（resize/scroll 再クランプ非対応は usePopover と同じ既存挙動かつ本 Issue スコープ外のため指摘しない）。

#### 良い点

- **P-001 を専用 ADR（ADR-004）に昇格させた判断が的確。** 「開いたまま再測定するか否か」という usePopover との本質差分・不変条件・収束根拠・代替案却下理由まで設計判断として固定化されており、実装者が補正を落とす事故を構造的に防いでいる。
- **テストの「バグ検出能力」を要件化した点が良い。** 固定 rect spy では P-001 が緑になる落とし穴を明記し、transform 反映 rect / 段階 mock で「補正を外すと落ちる」テストを必須化。round-1 の核心懸念（誤った安心）を正面から潰している。
- **natural 復元の数学が `computeShiftY` 実装と完全整合。** `rect - shiftY` が natural を厳密復元し、絶対オフセット返却＋layout effect の適用順序により収束が保証される。
- **スコープ・レイヤー方向は round-1 同様に健全。** 変更は `TagsInput.tsx` に閉じ、`usePopover.ts` 無改変（純粋 export 再利用のみ）で他の popover 利用者に非干渉。arch S-001（共有モジュール切り出し）はスコープ外として明示的に見送り、判断が一貫。
