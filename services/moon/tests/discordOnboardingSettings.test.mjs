import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPagePath = path.join(testDir, "..", "src", "components", "noona", "SettingsPage.tsx");
const onboardingTestRoutePath = path.join(
    testDir,
    "..",
    "src",
    "app",
    "api",
    "noona",
    "settings",
    "discord",
    "onboarding-message",
    "test",
    "route.ts",
);

test("Discord onboarding settings expose a send-test action without auto-saving", async () => {
    const file = await readFile(settingsPagePath, "utf8");

    assert.match(file, /Send test/);
    assert.match(file, /Send test uses this current rendered preview and channel draft without saving first\./);
    assert.match(file, /fetch\("\/api\/noona\/settings\/discord\/onboarding-message\/test"/);
    assert.match(file, /body: JSON\.stringify\(\{channelId, content\}\)/);
});

test("Moon proxies Discord onboarding test sends to Sage", async () => {
    const file = await readFile(onboardingTestRoutePath, "utf8");

    assert.match(file, /export async function POST/);
    assert.match(file, /\/api\/settings\/discord\/onboarding-message\/test/);
    assert.match(file, /method: "POST"/);
});
