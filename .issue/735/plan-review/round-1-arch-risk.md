# Issue #735 計画レビュー — アーキテクチャ整合性・実現可能性・リスク（round 1）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性 / 実現可能性 / リスク
対象: `.issue/735/plan.md` / `.issue/735/adr.md`
調査済み実コード: 3公開ルート / `errorResponseMiddleware.ts` / `errorResponse.ts` / `publicNoteMeta.ts` / `PublicNoteDetail.tsx` / `ErrorPage.tsx` / `csrfMiddleware.test.ts` / `renderServerComponent.ts`（src）/ `serialization.server.js`（`__RSC_SSR__.decode`）/ `server-functions-handler.js` / `.issue/12/adr.md`（ADR-004）

総評: 方式選定（ADR-001 (C) + ADR-002 (ii)）はアーキテクチャ的に妥当で、レイヤー分離（presentation のみで完結、domain/usecase 無改変、列挙耐性維持）を正しく守っている。最大の不確実点（`setResponseStatus` の SSR ドキュメントへの反映）を実装前 PoC で潰す判断も適切。ただし **PoC の検証設計に致命的な穴**があり、いくつかの実現可能性・整合性の問題がある。

---

#### 問題点（要修正）

- **[P-001] PoC（ステップ1）の検証手段が、本方式の成否を判定できない**
  - 理由: 計画は「`curl -i http://localhost:PORT/notes/public/<存在しないid>` で **HTTP ステータス行が 410** になること」を PoC の成否判定にしている。しかし本 Issue が対象とする「初回 SSR ドキュメントレスポンス」のステータスは、loader が **in-process で GET server fn を呼んだ結果のステータス**が、外側の HTML ドキュメント Response に伝播するかという問題である。`server-functions-handler.js` を読むと、server fn の Response は確かに `status: alsResponse.status`（= `setResponseStatus` の値）で組み立てられる（126-127, 166-167, 175-176行）。だが SSR の初回ドキュメント描画では loader は HTTP を介さず in-process で呼ばれ、その server fn のステータスが**ドキュメント全体の Response status へ伝播する保証はソース上どこにもない**。`curl` で 410 が出れば確かに「伝播した」と言えるが、**dev サーバ（Vite/plugin-rsc）と本番（Cloudflare Workers）で SSR レスポンス組み立て経路が異なり得る**。dev の curl で 410 が出ても本番で 200 のまま、という乖離が起こり得るため、「dev の curl」だけを PoC ゲートにすると誤った GO 判定を出す危険がある。
  - 提案: PoC ゲートを「**dev と本番ランタイム（`pnpm build && pnpm start`）の両方で curl 410 を確認できたとき**のみ GO」と明記する（現状は「両方確認するのが望ましい」という努力目標止まり）。本 Issue の本質は本番クローラ向けステータスなので、本番ランタイムでの観測こそがゲート条件であるべき。dev のみ通過・本番未確認の状態でステップ2以降に進めない、と plan に強制条件として書く。

- **[P-002] ヘルパー `renderPublicOrStatus` の戻り値型と「成功時のレンダリングが二重デコードされる」リスクが未検討**
  - 理由: `renderServerComponent` の実ソース（`react-start-rsc/src/renderServerComponent.ts`）を確認すると、SSR/router 経路では **`renderServerComponent` 自身が `async` で、内部で `renderToReadableStream(<node>)` を実行しコンポーネントをレンダリングしたうえで `await ssrHandler.decode(stream)` する**。plan の擬似コードでは `renderOk: () => renderServerComponent(<PublicNoteDetail .../>)` を「成功時に呼ぶ」設計だが、これは**前段 `ensureExists()` で `getPublicNote` を1回呼んだ後、`renderOk()` 内の RSC レンダリングで `PublicNoteDetail` がさらに `getPublicNote` を呼ぶ**ため、正常系で確実に2回 `getPublicNote` が走る（ADR-001 が「メモ化が効けば回避」と書く点）。`PublicNoteDetail` の `loadPublicNote` は `cache(serverData(...))`（`React.cache`）でメモ化されているが、**`cache` のスコープは React のレンダリングコンテキスト**であり、server fn ハンドラ本体（`ensureExists` の呼び出し）は `renderToReadableStream` の外側＝別レンダリングスコープなので、**メモ化は構造的に効かない**（plan も「効かない可能性」を認めるが、実コードのキャッシュ機構を読めば「効かない」とほぼ断定できる）。
  - 提案: ADR-001 / plan のリスク欄の「メモ化が効けば追加コスト無視可」という楽観的記述を、「`React.cache` は server fn ハンドラと RSC レンダリングで別スコープのため**正常系は常に二重取得になる**」と確定的に書き換える。そのうえで「read-only 単一取得（D1 O(1)）なので許容」という結論自体は妥当なので残してよい。誤った前提（メモ化に期待）で実装者が最適化を試みて時間を浪費するのを防ぐ。

- **[P-003] 共通ヘルパー `publicStatusBridge` に JSX を持たせる設計は `.tsx` 化が必須で、presentation 層の現状と整合しない点が未記載**
  - 理由: plan の擬似コードはヘルパー内で `renderServerComponent(<ErrorPage kind={...} />)` と **JSX を生成**している。`app/core/presentation/` 配下は現在 **`.tsx` ファイルが1つも存在しない**（全て `.ts`）。JSX を含むヘルパーは `.tsx` にする必要があり、これは presentation 層に初の `.tsx` を持ち込む。さらに `ErrorPage` import をヘルパーに集約すると、ヘルパーが `@/components/public/ErrorPage`（components 層）に依存することになり、「presentation の cross-cutting ユーティリティ」という層の役割（CLAUDE.md: server-function entry point / error-response middleware / 等）からやや逸脱する（presentation が特定の公開系コンポーネントを名指しで知る）。
  - 提案: 2案を plan に明記して実装時選択させる。(a) ヘルパーは **renderable を引数で受け取る**設計にし、JSX 生成（`<ErrorPage/>` と `<PublicNoteDetail/>` の両方）は各ルート `.tsx` 側に残す。ヘルパーは `setResponseStatus` 呼び出しと「NotFound なら notFoundRenderable を return、成功なら okRenderable を return」の制御だけを担う純粋な `.ts` 関数になり、components 依存も JSX 化も回避できる（型安全に書きやすい / 層の責務もきれい）。(b) どうしても `<ErrorPage/>` をヘルパーに置くなら `publicStatusBridge.tsx` とし、presentation 初の `.tsx` であることと components 依存を ADR に明記。**(a) を推奨**。これにより plan の「`renderServerComponent` を JSX 込みでヘルパーに渡す設計が型安全に書けるか」という懸念自体が解消する。

- **[P-004] ヘルパーの型安全性: `renderServerComponent` の戻り値型と `renderOk`/NotFound 分岐の戻り値型が一致するか未検証**
  - 理由: `renderServerComponent<TNode>` は `Promise<RenderableServerComponentBuilder<TNode>>` を返し、`TNode` ごとに型が変わる。plan 擬似コードでは成功時 `renderServerComponent(<PublicNoteDetail/>)`、NotFound 時 `renderServerComponent(<ErrorPage/>)` と **異なる TNode** を返すため、ヘルパーの戻り値型は両者のユニオン（または広い型）になる。ルートの `loader` はこの戻り値を `useLoaderData` 経由で `{Rendered}` として描画するだけなので実害は出にくいが、`exactOptionalPropertyTypes` 等の厳格設定下で型が `unknown`/`any` に潰れないか、`ValidateRenderableServerComponent<TNode>` の制約を満たすかは要確認。plan は「実装時に型を厳密化」とだけ書いており、ここが書けない場合 P-003(a) 案がより安全。
  - 提案: P-003(a)（renderable を引数で受ける）を採れば、ヘルパーは `(args: { ensureExists; notFoundStatus; notFound: T; ok: T }) => Promise<T>` のジェネリック1本で型が通り、この懸念が消える。plan のテスト方針（renderServerComponent を `vi.mock`）とも噛み合う。

---

#### 改善提案（検討推奨）

- **[S-001] ADR-004（`.issue/12`）の「同期 return」記述と本 Issue 調査結果の食い違いを ADR に明記して上書きする**
  - 理由: ADR-004 line 109 は「`renderServerComponent(<Page/>)` は server fn handler から**同期 return される**。async render 中のエラーは handler の try/catch にも errorResponseMiddleware にも届かない」と断言している。だが実ソースでは現バージョンの `renderServerComponent` は SSR/router 経路で `async` + `await decode` であり、この前提は変化している。本 Issue の ADR-001 はこの変化に気づいて方式(B)を慎重に不採用にしているが、**ADR-004 の旧記述が将来の実装者を誤導する**。本 Issue の ADR に「ADR-004 の『同期 return』前提は現バージョンで変化（renderServerComponent が async 化）。ただし decode の notFound re-throw 挙動は不確定のため方式(C)は依然有効」と1段落で明記しておくと、知識の断絶を防げる。
  - （これは plan の調査結果欄に近いことが書かれているが、ADR-004 という一次情報源との関係を明示すると良い。）

- **[S-002] 二重防御（#599 方式(d)）温存により、TOCTOU 時に「画面 410 / ステータス 200」になる挙動を AC か注記に1行で固定する**
  - 理由: plan のリスク欄に TOCTOU 記述はあるが、受け入れ基準（AC）側には「前段通過後に非公開化した極稀ケースはステータス 200 のまま許容」という割り切りが明記されていない。レビュー/QA 時に「200 のケースを見つけた＝バグ」と誤解されないよう、AC-5 付近に「TOCTOU 競合時のみステータス 200・画面 410 を許容（二重防御の設計上の帰結）」と1行入れておくと、検証時の判断がぶれない。

- **[S-003] ステップ4 ユニットテストの検証点を P-003(a) 採用後の形に合わせて再定義する**
  - 理由: 現テスト方針は「`renderServerComponent` を `vi.mock` し、渡した JSX の `kind` を検証」だが、P-003(a) を採るとヘルパーは renderable を引数で受け取るだけになり、`renderServerComponent` のモックすら不要になる（ヘルパーのテストは「NotFound→`setResponseStatus(410/404)` 呼出 + notFound 引数を return」「成功→未呼出 + ok 引数 return」「非NotFound→re-throw」で完結し、`csrfMiddleware.test.ts` の `setResponseStatus` モックパターンにそのまま乗る）。テストがより素直になる旨を反映すると良い。

---

#### 良い点

- 方式選定がアーキテクチャ的に正しい。HTTP ステータスマッピングを presentation に閉じ込め（CLAUDE.md「HTTP status mapping is presentation-only」準拠）、domain/usecase/エラーシリアライズ契約（`HTTP_STATUS_BY_KIND`）を一切触らない。410 を kind マップに足す案（副作用大）を正しく退けている（ADR-002 (i) 不採用）。
- 列挙耐性をステータス経由でも破らない設計（ADR-003、ノート一律410 / ユーザー一律404）が #599 の不変条件と一貫。`getPublicNote`/`getPublicProfile` 無改変で自然に保たれる点も正しい。
- 最大の不確実点（`setResponseStatus` の SSR 反映）を最初の PoC で潰し、ダメなら ADR-001 (D)（フレームワーク待ち）へ退避するというリスク駆動の進め方が適切。スコープ（認証系・usecase 変更・kind マップ変更を除外）も明快で、Issue 範囲を超えていない。
- 既存の確立パターン（meta loader が usecase を直接呼び `errorResponseMiddleware` を通す二段構成）への自然な適用として位置づけており、新規抽象の導入を最小化している。フレームワーク内部 decode の re-throw 挙動に依存しない方式(C)を選んだのは、バージョンアップ耐性の観点でも妥当。
- usecase シグネチャ（`ServiceArgs<Input>` = `{ container, input }`）と plan 擬似コードの呼び出し形が一致しており、ensureExists の実装は素直に書ける。`getPublicProfile` 1本でユーザー存在判定が完結する点も実コードで裏取り済み（一覧/タグ0件は NotFound を投げない）。

---

#### 補足: PoC が失敗した場合の扱い（確認事項）

plan は「PoC 失敗時は ADR-001 (D) フレームワーク待ちへ退避」とするが、その場合 **本 Issue は実質クローズできず追跡 Issue のまま**になる。これは Issue 本文自体が「将来やりたくなった場合の追跡用」と認めているため許容範囲だが、PoC 失敗時に「未解決事項として記録し Issue を open のまま残す」のか「現バージョンでは実現不可と判定して close するのか」を plan の退避手順に1行で決めておくと、PoC 後の判断が機械的になる（要修正ではなく確認事項）。
