/**
 * Common DTO module aggregating the projection types and `to{Entity}DTO`
 * helpers consumed by every usecase. See `spec/usecases/index.md` for the
 * canonical definitions; the types here implement that contract.
 *
 * Id convention:
 *   DTO ids are plain `string`. The earlier `string & { readonly __brand:
 *   'XId' }` scheme was removed in #473 — it never carried a runtime
 *   guarantee (brands erase to `string`) and only forced `as unknown as`
 *   bridging casts at every projection / usecase boundary. Domain ids
 *   still carry a `unique symbol` brand, which is a structural subtype of
 *   `string`, so `to{Entity}DTO` helpers project domain ids onto DTO
 *   `string` fields by plain assignment.
 */

export * from "./adminSettings";
export * from "./common";
export * from "./directory";
export * from "./export";
export * from "./identity";
export * from "./ingestion";
export * from "./media";
export * from "./note";
export * from "./publication";
export * from "./search";
export * from "./tag";
export * from "./view";
