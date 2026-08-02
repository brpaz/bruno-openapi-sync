/**
 * Spike decision (ticket 01): reuse `@opencollection/types` directly rather than
 * hand-rolling shapes. It's the official, actively-maintained type package for the
 * OpenCollection YAML format and matches a real Bruno-generated collection observed
 * on disk field-for-field. `@usebruno/schema`/`@usebruno/converters` were inspected
 * too, but their Yup schemas model Bruno's legacy internal object shape (strict
 * `noUnknown`, old `http-request`/`graphql-request` type naming) rather than the
 * OpenCollection YAML-at-rest shape, so they aren't used here.
 */
export type { OpenCollection, Extensions } from "@opencollection/types";
export type { Item, Folder, FolderInfo } from "@opencollection/types/collection/item";
export type {
  HttpRequest,
  HttpRequestInfo,
  HttpRequestDetails,
  HttpRequestRuntime,
  HttpRequestSettings,
  HttpRequestHeader,
  HttpRequestParam,
  HttpRequestBody,
  RawBody,
  HttpRequestExample,
} from "@opencollection/types/requests/http";
export type { Environment } from "@opencollection/types/config/environments";
export type { CollectionConfig } from "@opencollection/types/config/collection";
export type { Auth, AuthApiKey, AuthBearer, AuthBasic } from "@opencollection/types/common/auth";
export type { Variable } from "@opencollection/types/common/variables";
export type { Info } from "@opencollection/types/common/info";

/**
 * Sync state: the operationId -> file path match-key index.
 *
 * Deliberately NOT stored inside request YAML files (see
 * docs/adr/0002-sync-state-sidecar-not-in-request-files.md) — persisted instead in
 * `.bruno-openapi-sync/state.yml` at the collection root, a sidecar this tool owns
 * exclusively. `filePath` is relative to the collection root (e.g. `pet/Find pet by ID.yml`).
 */
export interface SyncStateOperationEntry {
  filePath: string;
  bodySchemaHash?: string;
  /** Param/header names that were spec-derived as of the last sync — lets orphan
   * classification (CONTEXT.md "Orphaned request") tell a user-added entry apart from a
   * generated one without a live spec operation to diff against. */
  generatedParamNames?: string[];
  generatedHeaderNames?: string[];
}

export interface SyncState {
  version: 1;
  operations: Record<string, SyncStateOperationEntry>;
}
