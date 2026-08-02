import type { Environment, Folder, HttpRequest } from "../collection/types.js";

export interface PlanCreate {
  operationId: string;
  filePath: string;
  request: HttpRequest;
  bodySchemaHash?: string;
  generatedParamNames: string[];
  generatedHeaderNames: string[];
}

export interface PlanUpdate {
  operationId: string;
  filePath: string;
  request: HttpRequest;
  bodySchemaHash?: string;
  generatedParamNames: string[];
  generatedHeaderNames: string[];
}

export interface PlanMove {
  operationId: string;
  fromPath: string;
  toPath: string;
}

export interface PlanDelete {
  operationId: string;
  filePath: string;
}

export interface PlanSkip {
  operationId: string;
  filePath: string;
  reason: string;
}

export interface PlanFolder {
  path: string;
  folder: Folder;
}

export interface PlanEnvironment {
  fileName: string;
  environment: Environment;
}

/**
 * The full sync plan. Ticket 02 only ever populates `bootstrapCollection`, `folders`,
 * `creates`, and `environments` — `updates`/`moves`/`deletes`/`skips` are always empty
 * until tickets 03/06/05 land, but are typed now since the shape is already committed to
 * in the spec (see spec.md "Module layout").
 */
export interface SyncPlan {
  bootstrapCollection: { name: string } | null;
  folders: PlanFolder[];
  creates: PlanCreate[];
  updates: PlanUpdate[];
  moves: PlanMove[];
  deletes: PlanDelete[];
  skips: PlanSkip[];
  warnings: string[];
  environments: PlanEnvironment[];
}
