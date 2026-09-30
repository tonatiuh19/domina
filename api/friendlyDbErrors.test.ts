import { describe, expect, it } from "vitest";
import { isDuplicateKeyError, mapFriendlyDbError } from "./index";

describe("isDuplicateKeyError", () => {
  it("detects ER_DUP_ENTRY and errno 1062", () => {
    expect(isDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
  });

  it("detects TiDB Duplicate entry messages", () => {
    expect(
      isDuplicateKeyError({
        message: "Duplicate entry '?' for key 'courses.slug'",
      }),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isDuplicateKeyError({ code: "ER_BAD_FIELD", message: "x" })).toBe(false);
  });
});

describe("mapFriendlyDbError", () => {
  it("maps duplicates to 409", () => {
    expect(mapFriendlyDbError({ code: "ER_DUP_ENTRY" })).toEqual({
      status: 409,
      error: "That record already exists.",
    });
  });

  it("maps foreign-key errors to 400", () => {
    expect(mapFriendlyDbError({ code: "ER_NO_REFERENCED_ROW_2" })).toEqual({
      status: 400,
      error: "That record is linked to something else.",
    });
    expect(mapFriendlyDbError({ code: "ER_ROW_IS_REFERENCED_2" })?.status).toBe(400);
  });

  it("returns null for unknown errors", () => {
    expect(mapFriendlyDbError({ message: "boom" })).toBeNull();
  });
});
