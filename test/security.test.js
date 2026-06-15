import assert from "node:assert/strict";
import test from "node:test";
import { validateStudentPayload } from "../lib/supabaseResources.js";

const validPayload = {
  accessToken: "class-code",
  zip: "44106",
  categoryKey: "library",
  name: "Test Library",
  address: "123 Main St",
  website: "https://example.org",
  createdBy: "Test"
};

test("student resource writes require the configured class access token", () => {
  const previous = process.env.STUDENT_ACCESS_TOKEN;
  process.env.STUDENT_ACCESS_TOKEN = "class-code";
  try {
    assert.equal(validateStudentPayload(validPayload).ok, true);
    const denied = validateStudentPayload({ ...validPayload, accessToken: "wrong" });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 403);
  } finally {
    if (previous == null) {
      delete process.env.STUDENT_ACCESS_TOKEN;
    } else {
      process.env.STUDENT_ACCESS_TOKEN = previous;
    }
  }
});

test("student resource websites must be http or https URLs", () => {
  const previous = process.env.STUDENT_ACCESS_TOKEN;
  delete process.env.STUDENT_ACCESS_TOKEN;
  try {
    const denied = validateStudentPayload({
      ...validPayload,
      website: "javascript:alert(1)"
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 400);
  } finally {
    if (previous != null) process.env.STUDENT_ACCESS_TOKEN = previous;
  }
});
