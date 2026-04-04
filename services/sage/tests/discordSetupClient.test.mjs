import assert from "node:assert/strict";
import test from "node:test";

import {createDiscordSetupClient} from "../clients/discordSetupClient.mjs";

test("fetchResources includes sorted Discord slash command diagnostics", async () => {
    const fetchCalls = [];
    const fetchImpl = async (url) => {
        fetchCalls.push(url);

        if (url.endsWith("/applications/app-123/commands")) {
            return {
                ok: true,
                json: async () => ([
                    {id: "2", name: "scan", description: "Scan library", type: 1},
                    {id: "1", name: "ding", description: "Health check", type: 1},
                ]),
            };
        }

        if (url.endsWith("/applications/app-123/guilds/guild-123/commands")) {
            return {
                ok: true,
                json: async () => ([
                    {id: "4", name: "recommend", description: "Recommend title", type: 1},
                    {id: "3", name: "ding", description: "Guild health", type: 1},
                ]),
            };
        }

        throw new Error(`Unexpected URL: ${url}`);
    };

    const createClient = () => ({
        client: {
            user: {
                id: "bot-user-1",
                username: "Noona Bot",
                tag: "Noona Bot#0001",
            },
        },
        login: async () => {
        },
        destroy: () => {
        },
        fetchApplication: async () => ({
            id: "app-123",
            name: "Noona App",
        }),
        fetchGuilds: async () => ([
            {
                id: "guild-123",
                name: "Noona Guild",
            },
        ]),
        fetchGuildById: async () => ({
            id: "guild-123",
            name: "Noona Guild",
            roles: {
                fetch: async () => ([
                    {id: "role-1", name: "Bot", managed: true, position: 99},
                    {id: "role-2", name: "Members", managed: false, position: 1},
                ]),
            },
            channels: {
                fetch: async () => ([
                    {id: "channel-1", name: "general", type: 0},
                ]),
            },
        }),
    });

    const client = createDiscordSetupClient({
        createClient,
        fetchImpl,
        logger: {},
        serviceName: "test-sage",
    });

    const payload = await client.fetchResources({
        token: "bot-token",
        clientId: "provided-client-id",
        guildId: "guild-123",
    });

    assert.deepEqual(fetchCalls, [
        "https://discord.com/api/v10/applications/app-123/commands",
        "https://discord.com/api/v10/applications/app-123/guilds/guild-123/commands",
    ]);
    assert.deepEqual(payload.commands?.globalCommands?.map((command) => command.name), ["ding", "scan"]);
    assert.deepEqual(payload.commands?.guildCommands?.map((command) => command.name), ["ding", "recommend"]);
    assert.deepEqual(payload.commands?.duplicateNames, ["ding"]);
    assert.equal(payload.application?.clientIdMatches, false);
    assert.equal(payload.suggested?.clientId, "app-123");
});
