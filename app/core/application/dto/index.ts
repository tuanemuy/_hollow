/**
 * Common DTO module aggregating the projection types and `to{Entity}DTO`
 * helpers consumed by every usecase. See `spec/usecases/index.md` for the
 * canonical definitions; the types here implement that contract.
 *
 * Brand convention:
 *   DTO id brands use `string & { readonly __brand: 'XId' }`. Domain ids
 *   use a `unique symbol` brand. The two are structurally compatible
 *   (both are `string` underneath); projections bridge with `as unknown
 *   as` casts at exactly one boundary — `to{Entity}DTO` — so call sites
 *   never need to know about the discrepancy.
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
