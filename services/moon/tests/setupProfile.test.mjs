import test from "node:test";
import assert from "node:assert/strict";

import {
    buildSetupProfileSnapshot,
    deriveSetupProfileSelection,
    deriveSetupProfileValues,
    hydrateSetupProfileState,
    SETUP_PROFILE_VERSION,
    shouldShowSetupDebugDetails,
} from "../src/components/noona/setupProfile.mjs";

test("deriveSetupProfileSelection maps managed modes to the implied services", () => {
    assert.deepEqual(
        deriveSetupProfileSelection({kavitaMode: "managed", komfMode: "managed"}),
        ["noona-kavita", "noona-komf", "noona-portal", "noona-raven"],
    );
    assert.deepEqual(
        deriveSetupProfileSelection({kavitaMode: "external", komfMode: "external"}),
        ["noona-portal", "noona-raven"],
    );
});

test("buildSetupProfileSnapshot emits the minimal v3 browser contract", () => {
    const snapshot = buildSetupProfileSnapshot({
        storageRoot: " /srv/noona ",
        kavitaMode: "external",
        kavitaBaseUrl: " https://kavita.example ",
        kavitaApiKey: "secret-key",
        kavitaSharedLibraryPath: " /mnt/manga ",
        komfMode: "external",
        komfBaseUrl: " https://komf.example ",
        values: {
            "noona-portal": {
                DISCORD_BOT_TOKEN: "bot-token",
                DISCORD_CLIENT_ID: "client-id",
                DISCORD_CLIENT_SECRET: "client-secret",
                DISCORD_GUILD_ID: "guild-id",
                REQUIRED_GUILD_ID: "guild-id",
                DISCORD_SUPERUSER_ID: "123456789012345678",
            },
            "noona-komf": {
                KOMF_APPLICATION_YML: "komf:\n  enabled: true\n",
            },
        },
    });

    assert.equal(snapshot.version, SETUP_PROFILE_VERSION);
    assert.deepEqual(Object.keys(snapshot).sort(), ["discord", "kavita", "komf", "storageRoot", "version"]);
    assert.equal(snapshot.storageRoot, "/srv/noona");
    assert.equal(snapshot.kavita.mode, "external");
    assert.equal(snapshot.kavita.baseUrl, "https://kavita.example");
    assert.equal(snapshot.kavita.sharedLibraryPath, "/mnt/manga");
    assert.equal(snapshot.komf.mode, "external");
    assert.equal(snapshot.komf.baseUrl, "https://komf.example");
    assert.equal(snapshot.komf.applicationYml, "komf:\n  enabled: true");
    assert.equal(snapshot.discord.botToken, "bot-token");
    assert.equal(snapshot.discord.requiredGuildId, "guild-id");
    assert.equal(snapshot.discord.superuserId, "123456789012345678");
});

test("deriveSetupProfileValues keeps storageRoot metadata out of per-service env state", () => {
    const derived = deriveSetupProfileValues({
        values: {
            "noona-vault": {
                MONGO_URI: "mongodb://mongo:27017/admin",
            },
            "noona-portal": {},
            "noona-raven": {},
            "noona-kavita": {},
            "noona-komf": {},
        },
        serviceNames: ["noona-vault", "noona-portal", "noona-raven", "noona-kavita", "noona-komf"],
        kavitaMode: "external",
        kavitaBaseUrl: "https://kavita.example",
        kavitaApiKey: "secret-key",
        kavitaSharedLibraryPath: "/mnt/manga",
        komfMode: "external",
        komfBaseUrl: " https://komf.example ",
    });

    assert.equal(derived["noona-portal"].KOMF_BASE_URL, "https://komf.example");
    assert.equal(derived["noona-raven"].KAVITA_BASE_URL, "https://kavita.example");
    assert.equal(derived["noona-raven"].KAVITA_DATA_MOUNT, "/mnt/manga");
    assert.equal(Object.prototype.hasOwnProperty.call(derived["noona-vault"], "NOONA_DATA_ROOT"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(derived["noona-raven"], "NOONA_DATA_ROOT"), false);
});

test("deriveSetupProfileValues clears Portal Komf URL when Komf is managed", () => {
    const derived = deriveSetupProfileValues({
        values: {
            "noona-portal": {
                KOMF_BASE_URL: "https://komf.example",
            },
            "noona-raven": {},
            "noona-kavita": {},
            "noona-komf": {},
        },
        serviceNames: ["noona-portal", "noona-raven", "noona-kavita", "noona-komf"],
        kavitaMode: "managed",
        kavitaApiKey: "secret-key",
        komfMode: "managed",
        komfBaseUrl: "https://komf.example",
    });

    assert.equal(derived["noona-portal"].KOMF_BASE_URL, "");
});

test("hydrateSetupProfileState restores wizard fields from a persisted snapshot", () => {
    const hydrated = hydrateSetupProfileState({
        snapshot: {
            version: 3,
            storageRoot: "/srv/noona",
            kavita: {
                mode: "external",
                baseUrl: "https://kavita.example",
                apiKey: "restored-key",
                sharedLibraryPath: "/mnt/manga",
                account: {
                    username: "",
                    email: "",
                    password: "",
                },
            },
            komf: {
                mode: "managed",
                baseUrl: "",
                applicationYml: "server:\n  port: 8085\n",
            },
            discord: {
                botToken: "bot-token",
                clientId: "client-id",
                clientSecret: "client-secret",
                guildId: "guild-id",
                requiredGuildId: "guild-id",
                superuserId: "123456789012345678",
                joinDefaultRoles: "Members",
                joinDefaultLibraries: "Manga",
            },
        },
        values: {
            "noona-portal": {},
            "noona-komf": {},
        },
        defaultStorageRoot: "/default/root",
        defaultSharedLibraryPath: "/default/manga",
    });

    assert.equal(hydrated.storageRoot, "/srv/noona");
    assert.equal(hydrated.kavitaMode, "external");
    assert.equal(hydrated.kavitaBaseUrl, "https://kavita.example");
    assert.equal(hydrated.kavitaApiKey, "restored-key");
    assert.equal(hydrated.kavitaSharedLibraryPath, "/mnt/manga");
    assert.equal(hydrated.komfMode, "managed");
    assert.equal(hydrated.values["noona-portal"].DISCORD_BOT_TOKEN, "bot-token");
    assert.equal(hydrated.values["noona-portal"].REQUIRED_GUILD_ID, "guild-id");
    assert.equal(hydrated.values["noona-portal"].DISCORD_SUPERUSER_ID, "123456789012345678");
    assert.equal(hydrated.values["noona-portal"].PORTAL_JOIN_DEFAULT_LIBRARIES, "Manga");
    assert.equal(hydrated.values["noona-komf"].KOMF_APPLICATION_YML, "server:\n  port: 8085\n");
});

test("shouldShowSetupDebugDetails only enables raw controls in debug mode", () => {
    assert.equal(shouldShowSetupDebugDetails(true), true);
    assert.equal(shouldShowSetupDebugDetails(false), false);
    assert.equal(shouldShowSetupDebugDetails(undefined), false);
});
