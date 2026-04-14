import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPagePath = path.join(testDir, "..", "src", "components", "noona", "SettingsPage.tsx");
const chapterNotificationsRoutePath = path.join(
    testDir,
    "..",
    "src",
    "app",
    "api",
    "noona",
    "settings",
    "discord",
    "chapter-notifications",
    "route.ts",
);

test("Discord chapter notification settings expose the 15-minute grouped post controls", async () => {
    const file = await readFile(settingsPagePath, "utf8");

    assert.match(file, /Chapter release posts/);
    assert.match(file, /Every 15 minutes Portal checks Raven for newly finished chapters/);
    assert.match(file, /fetch\("\/api\/noona\/settings\/discord\/chapter-notifications"/);
    assert.match(file, /Turning this on only posts future chapter completions\./);
});

test("Moon proxies Discord chapter notification settings to Sage", async () => {
    const file = await readFile(chapterNotificationsRoutePath, "utf8");

    assert.match(file, /export async function GET/);
    assert.match(file, /export async function PUT/);
    assert.match(file, /\/api\/settings\/discord\/chapter-notifications/);
    assert.match(file, /method: "PUT"/);
});
