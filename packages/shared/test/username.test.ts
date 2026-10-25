import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize, skeleton, validateUsername, RESERVED_USERNAMES } from "../src/index.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../../shared/username-vectors.json", import.meta.url), "utf8"),
);

test("reserved list matches the shared fixture", () => {
  assert.deepEqual([...RESERVED_USERNAMES].sort(), [...vectors.reserved].sort());
});

for (const v of vectors.valid) {
  test(`valid: ${JSON.stringify(v.input)} -> ${v.normalized} / ${v.skeleton}`, () => {
    assert.equal(normalize(v.input), v.normalized);
    assert.equal(skeleton(v.normalized), v.skeleton);
    assert.deepEqual(validateUsername(v.input), {
      ok: true,
      normalized: v.normalized,
      skeleton: v.skeleton,
    });
  });
}

for (const v of vectors.invalid) {
  test(`invalid: ${JSON.stringify(v.input)} (${v.why}) -> ${v.error}`, () => {
    assert.deepEqual(validateUsername(v.input), { ok: false, error: v.error });
  });
}
