// Typed server builders before the first account-backed `convex dev` run.
// These use Convex's public generic API; this is not a generated file.
import { queryGeneric, mutationGeneric, type DataModelFromSchemaDefinition, type QueryBuilder, type MutationBuilder, type GenericQueryCtx, type GenericMutationCtx } from "convex/server";
import schema from "./schema";
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export const query = queryGeneric as QueryBuilder<DataModel, "public">;
export const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
