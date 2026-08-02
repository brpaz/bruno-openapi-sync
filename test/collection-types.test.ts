import { describe, expect, it } from "vitest";
import type { SyncState } from "../src/collection/types.js";

describe("SyncState", () => {
  it("shapes an operationId -> file path index", () => {
    const state: SyncState = {
      version: 1,
      operations: {
        getPetById: { filePath: "pet/Find pet by ID.yml" },
      },
    };

    expect(state.operations.getPetById?.filePath).toBe("pet/Find pet by ID.yml");
  });
});
