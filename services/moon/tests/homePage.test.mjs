import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const homePagePath = path.join(testDir, "..", "src", "components", "noona", "HomePage.tsx");

test("home page keeps the welcome card user-facing", async () => {
    const file = await readFile(homePagePath, "utf8");

    assert.match(file, /Welcome to Noona Dashboard\./);
    assert.match(file, /Start Reading/);
    assert.match(file, /Chat with fellow readers or get support/);
    assert.match(file, /Have a request\? Try using Discord\./);
    assert.match(file, /\/recommend/);
    assert.match(file, /Naruto/);
    assert.match(file, /My requests/);
    assert.doesNotMatch(file, /Noona Moon/);
    assert.doesNotMatch(file, /Raven library feed/);
    assert.doesNotMatch(file, /\/kavita\/complete/);
    assert.doesNotMatch(file, /Open libraries/);
    assert.doesNotMatch(file, /Open downloads/);
    assert.doesNotMatch(file, /Refresh/);
});
