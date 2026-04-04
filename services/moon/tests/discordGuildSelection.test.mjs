import test from "node:test";
import assert from "node:assert/strict";

import {
    applySelectedDiscordGuild,
    applySuggestedDiscordValues,
    getDiscordGuildGateMismatch,
} from "../src/components/noona/discordGuildSelection.mjs";

test("applySelectedDiscordGuild aligns REQUIRED_GUILD_ID when it is blank", () => {
    const next = applySelectedDiscordGuild({
        DISCORD_GUILD_ID: "old-guild",
        REQUIRED_GUILD_ID: "",
    }, "new-guild");

    assert.equal(next.DISCORD_GUILD_ID, "new-guild");
    assert.equal(next.REQUIRED_GUILD_ID, "new-guild");
});

test("applySelectedDiscordGuild aligns REQUIRED_GUILD_ID when it still matches the previous guild", () => {
    const next = applySelectedDiscordGuild({
        DISCORD_GUILD_ID: "old-guild",
        REQUIRED_GUILD_ID: "old-guild",
    }, "new-guild");

    assert.equal(next.DISCORD_GUILD_ID, "new-guild");
    assert.equal(next.REQUIRED_GUILD_ID, "new-guild");
});

test("applySelectedDiscordGuild preserves a custom REQUIRED_GUILD_ID override", () => {
    const next = applySelectedDiscordGuild({
        DISCORD_GUILD_ID: "old-guild",
        REQUIRED_GUILD_ID: "custom-guild",
    }, "new-guild");

    assert.equal(next.DISCORD_GUILD_ID, "new-guild");
    assert.equal(next.REQUIRED_GUILD_ID, "custom-guild");
});

test("applySuggestedDiscordValues preserves manual guild gate overrides while filling blanks", () => {
    const next = applySuggestedDiscordValues({
        DISCORD_CLIENT_ID: "",
        DISCORD_GUILD_ID: "",
        REQUIRED_GUILD_ID: "custom-guild",
    }, {
        clientId: "client-123",
        guildId: "guild-123",
    });

    assert.equal(next.DISCORD_CLIENT_ID, "client-123");
    assert.equal(next.DISCORD_GUILD_ID, "guild-123");
    assert.equal(next.REQUIRED_GUILD_ID, "custom-guild");
});

test("getDiscordGuildGateMismatch returns the live mismatch when guild gates diverge", () => {
    assert.deepEqual(
        getDiscordGuildGateMismatch({
            DISCORD_GUILD_ID: "guild-123",
            REQUIRED_GUILD_ID: "guild-999",
        }),
        {
            guildId: "guild-123",
            requiredGuildId: "guild-999",
        },
    );

    assert.equal(
        getDiscordGuildGateMismatch({
            DISCORD_GUILD_ID: "guild-123",
            REQUIRED_GUILD_ID: "guild-123",
        }),
        null,
    );
});
