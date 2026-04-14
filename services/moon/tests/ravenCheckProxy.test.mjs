import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const titleCheckRoutePath = path.join(
    testDir,
    "..",
    "src",
    "app",
    "api",
    "noona",
    "raven",
    "title",
    "[uuid]",
    "checkForNew",
    "route.ts",
);
const libraryCheckRoutePath = path.join(
    testDir,
    "..",
    "src",
    "app",
    "api",
    "noona",
    "raven",
    "library",
    "checkForNew",
    "route.ts",
);

test("Moon title check proxy gives Sage a longer timeout and forwards Raven status", async () => {
    const file = await readFile(titleCheckRoutePath, "utf8");

    assert.match(file, /timeoutMs:\s*60_000/);
    assert.match(file, /sageJson\(`\/api\/raven\/title\/\$\{encodeURIComponent\(uuid\)\}\/checkForNew`/);
    assert.match(file, /return NextResponse\.json\(payload, \{status\}\);/);
});

test("Moon library check proxy gives Sage a longer timeout and forwards Raven status", async () => {
    const file = await readFile(libraryCheckRoutePath, "utf8");

    assert.match(file, /timeoutMs:\s*120_000/);
    assert.match(file, /sageJson\("\/api\/raven\/library\/checkForNew"/);
    assert.match(file, /return NextResponse\.json\(payload, \{status\}\);/);
});
