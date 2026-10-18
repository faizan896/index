import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loginErrorMessage, loginNextPath } from "./login-params";

describe("loginErrorMessage", () => {
  it("explains the codes the auth routes send", () => {
    assert.equal(loginErrorMessage("auth"), "That sign-in link has expired or was already used. Request a new one.");
    assert.equal(loginErrorMessage("not_allowed"), "This account isn't allowed to use this library.");
    assert.match(loginErrorMessage("oauth") ?? "", /Google/);
  });

  it("is null without a code", () => {
    assert.equal(loginErrorMessage(undefined), null);
    assert.equal(loginErrorMessage(""), null);
    assert.equal(loginErrorMessage([]), null);
  });

  it("gives a general line for unknown codes, never echoing them", () => {
    assert.equal(loginErrorMessage("<b>gotcha</b>"), "Signing in didn't work. Please try again.");
    assert.equal(loginErrorMessage("toString"), "Signing in didn't work. Please try again.");
  });

  it("reads the first of repeated params", () => {
    assert.equal(loginErrorMessage(["not_allowed", "auth"]), "This account isn't allowed to use this library.");
  });
});

describe("loginNextPath", () => {
  it("keeps same-site paths", () => {
    assert.equal(loginNextPath("/collections/abc?sort=alpha"), "/collections/abc?sort=alpha");
    assert.equal(loginNextPath(["/settings", "/"]), "/settings");
  });

  it("falls back to / for anything that could leave the site", () => {
    assert.equal(loginNextPath(undefined), "/");
    assert.equal(loginNextPath("//evil.example"), "/");
    assert.equal(loginNextPath("https://evil.example/"), "/");
    assert.equal(loginNextPath("/\\evil.example"), "/");
    assert.equal(loginNextPath("settings"), "/");
  });
});
