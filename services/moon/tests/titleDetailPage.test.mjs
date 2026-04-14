import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const titleDetailPagePath = path.join(testDir, "..", "src", "components", "noona", "TitleDetailPage.tsx");

test("title detail delete warning stays destructive and explicit", async () => {
    const file = await readFile(titleDetailPagePath, "utf8");

    assert.match(
        file,
        /This removes the title record from the library and deletes the managed download folder on disk\./,
    );
    assert.match(
        file,
        /Raven now tracks a stored chapter index for this title[\s\S]*refreshes it[\s\S]*from the downloaded files,/,
    );
});
