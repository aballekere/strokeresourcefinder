import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("trusted resources include required brochure fields", async () => {
  const resources = await readJson("../data/trusted-resources.json");
  assert.ok(resources.length > 0);

  for (const resource of resources) {
    assert.match(resource.id, /^trusted-/);
    assert.ok(resource.name);
    assert.ok(resource.category);
    assert.ok(resource.address);
    assert.ok(Array.isArray(resource.zipCodes));
    assert.ok(resource.zipCodes.length > 0);
  }
});

test("sample resources include display and contact fields", async () => {
  const resources = await readJson("../data/mock-places.json");
  assert.ok(resources.length > 0);

  for (const resource of resources) {
    assert.ok(resource.id);
    assert.ok(resource.name);
    assert.ok(resource.category);
    assert.ok(resource.address);
    assert.equal(resource.source, "Sample");
  }
});

test("at least one trusted resource applies across ZIP codes", async () => {
  const resources = await readJson("../data/trusted-resources.json");
  assert.ok(resources.some((resource) => resource.zipCodes.includes("*")));
});
