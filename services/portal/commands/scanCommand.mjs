/**
 * @fileoverview Defines the `/scan` Discord flow for triggering Kavita library scans.
 * Related files:
 * - commands/index.mjs
 * - commands/utils.mjs
 * - tests/discordCommands.test.mjs
 * Times this file has been edited: 6
 */

import {ApplicationCommandOptionType, MessageFlags} from 'discord.js';
import {respondWithError} from './utils.mjs';

const MAX_AUTOCOMPLETE_RESULTS = 25;
const MAX_LISTED_LIBRARIES = 10;

const normalizeValue = value => (typeof value === 'string' ? value.trim() : '');

/**
 * Extracts an HTTP-like status code from a Portal/Kavita error.
 *
 * @param {*} error - Input passed to the function.
 * @returns {*} The function result.
 */
const extractErrorStatus = error => {
    const parsed = Number.parseInt(String(error?.status ?? ''), 10);
    return Number.isInteger(parsed) ? parsed : null;
};

/**
 * Extracts a friendly message from a Portal/Kavita error.
 *
 * @param {*} error - Input passed to the function.
 * @returns {*} The function result.
 */
const extractErrorMessage = error => {
    const direct = normalizeValue(error?.message);
    const fromBody = normalizeValue(error?.body?.message) || normalizeValue(error?.body?.error);
    const candidate = direct || fromBody;
    if (!candidate) {
        return '';
    }

    return candidate
        .replace(/^Kavita request failed with status \d+:\s*/i, '')
        .replace(/^Kavita request failed with status \d+\.?$/i, '')
        .trim();
};

const resolveLibraryName = library =>
    normalizeValue(library?.name)
    || normalizeValue(library?.title)
    || `Library ${library?.id ?? 'unknown'}`;

const filterLibraries = (libraries, query) => {
    const normalizedQuery = normalizeValue(query).toLowerCase();
    if (!normalizedQuery) {
        return libraries;
    }

    return libraries.filter(library => {
        const name = resolveLibraryName(library).toLowerCase();
        return name.includes(normalizedQuery) || String(library?.id ?? '').includes(normalizedQuery);
    });
};

const findLibraryMatch = (libraries, rawValue) => {
    const value = normalizeValue(rawValue);
    if (!value) {
        return null;
    }

    if (/^\d+$/.test(value)) {
        return libraries.find(library => String(library?.id ?? '') === value) ?? null;
    }

    const normalizedValue = value.toLowerCase();
    return libraries.find(library => resolveLibraryName(library).toLowerCase() === normalizedValue) ?? null;
};

/**
 * Builds a user-facing error for library list lookups.
 *
 * @param {*} error - Input passed to the function.
 * @returns {*} The function result.
 */
const describeLibraryFetchFailure = error => {
    const status = extractErrorStatus(error);
    if (status === 401 || status === 403) {
        return 'Noona could not load library options from Kavita. Ask a server admin to verify Portal\'s `KAVITA_API_KEY` is valid.';
    }

    const message = extractErrorMessage(error);
    return message
        ? `Noona could not load library options from Kavita: ${message}`
        : 'Noona could not load library options from Kavita right now. Check the Portal logs and Kavita connection settings.';
};

/**
 * Builds a user-facing error for a library scan request.
 *
 * @param {*} error - Input passed to the function.
 * @param {*} libraryName - Input passed to the function.
 * @returns {*} The function result.
 */
const describeLibraryScanFailure = (error, libraryName) => {
    const status = extractErrorStatus(error);
    const resolvedLibraryName = normalizeValue(libraryName) || 'that Noona library';

    if (status === 401 || status === 403) {
        return `Noona could not refresh **${resolvedLibraryName}** because Kavita denied the scan request. Ask a server admin to verify Portal's \`KAVITA_API_KEY\` belongs to an admin-capable Kavita account.`;
    }

    if (status === 404) {
        return `Noona could not refresh **${resolvedLibraryName}** because Kavita could not find that library yet. Try again in a moment.`;
    }

    const message = extractErrorMessage(error);
    return message
        ? `Noona could not refresh **${resolvedLibraryName}**: ${message}`
        : `Noona could not refresh **${resolvedLibraryName}** right now. Check the Portal logs and Kavita connection settings.`;
};

/**
 * Creates scan command.
 *
 * @param {object} options - Named function inputs.
 * @returns {*} The function result.
 */
export const createScanCommand = ({
                                      kavita,
                                  } = {}) => ({
    definition: {
        name: 'scan',
        description: 'Refresh a Noona library.',
        options: [
            {
                name: 'library',
                description: 'Library to refresh in Noona.',
                type: ApplicationCommandOptionType.String,
                required: true,
                autocomplete: true,
            },
            {
                name: 'force',
                description: 'Force a full refresh for the selected library.',
                type: ApplicationCommandOptionType.Boolean,
                required: false,
            },
        ],
    },
    autocomplete: async interaction => {
        if (!kavita?.fetchLibraries) {
            await interaction.respond?.([]);
            return;
        }

        const focused = interaction.options?.getFocused?.(true);
        const query = typeof focused === 'object' ? focused?.value : focused;
        const libraries = await kavita.fetchLibraries();
        const results = filterLibraries(Array.isArray(libraries) ? libraries : [], query)
            .filter(library => library?.id != null)
            .slice(0, MAX_AUTOCOMPLETE_RESULTS)
            .map(library => ({
                name: resolveLibraryName(library),
                value: String(library.id),
            }));

        await interaction.respond?.(results);
    },
    execute: async interaction => {
        await interaction.deferReply?.({flags: MessageFlags.Ephemeral});

        if (!kavita?.fetchLibraries || !kavita?.scanLibrary) {
            throw new Error('Kavita client is not configured.');
        }

        const rawLibrary = interaction.options?.getString('library') ?? '';
        const force = interaction.options?.getBoolean('force') === true;
        const libraryValue = normalizeValue(rawLibrary);

        if (!libraryValue) {
            await respondWithError(interaction, 'Choose a Noona library to refresh.');
            return;
        }

        let libraries;
        try {
            libraries = await kavita.fetchLibraries();
        } catch (error) {
            await respondWithError(interaction, describeLibraryFetchFailure(error));
            return;
        }

        if (!Array.isArray(libraries) || libraries.length === 0) {
            await interaction.editReply?.({
                content: 'No Noona libraries are available to refresh.',
            });
            return;
        }

        const library = findLibraryMatch(libraries, libraryValue);
        if (!library?.id) {
            const available = libraries
                .slice(0, MAX_LISTED_LIBRARIES)
                .map(resolveLibraryName)
                .join(', ');

            await interaction.editReply?.({
                content: available
                    ? `Could not find that Noona library. Available libraries: ${available}`
                    : 'Could not find that Noona library.',
            });
            return;
        }

        try {
            await kavita.scanLibrary(library.id, {force});
        } catch (error) {
            await respondWithError(interaction, describeLibraryScanFailure(error, resolveLibraryName(library)));
            return;
        }

        await interaction.editReply?.({
            content: `Queued a ${force ? 'forced ' : ''}Noona library refresh for **${resolveLibraryName(library)}**.`,
        });
    },
});

export default createScanCommand;
