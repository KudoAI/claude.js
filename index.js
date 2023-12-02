class ApiRequestTypes {
    constructor(url) {
        this.url = url;
        Object.freeze(this);
    }

    #base(method, options = {}) {
        if (options?.method) delete options.method;
        return fetch(this.url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            ...options,
        });
    }

    get(options = {}) {
        return this.#base('GET', options);
    }

    post(options = {}) {
        return this.#base('POST', options);
    }

    put(options = {}) {
        return this.#base('PUT', options);
    }

    delete(options = {}) {
        return this.#base('DELETE', options);
    }
}

const API_BASE_URL = 'https://claude.ai/api';
const endpoints = {
    ACCOUNT: new ApiRequestTypes(API_BASE_URL + '/account'),
    ORGANIZATIONS: new ApiRequestTypes(API_BASE_URL + '/organizations'),
    ALL_CHATS: function (orgUUID) {
        return new ApiRequestTypes(this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations');
    },
    SINGLE_CHAT: function (orgUUID, chatUUID) {
        return new ApiRequestTypes(this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations/' + chatUUID);
    },
    SEND_MESSAGE: new ApiRequestTypes(API_BASE_URL + '/append_message'),
    GENERATE_CHAT_TITLE: new ApiRequestTypes(API_BASE_URL + '/generate_chat_title'),
};

let oldLog = console.log;
console.log = (...args) => oldLog.apply(console, ['\x1b[32m[INFO]\x1b[0m', ...args]);
console.warn = (...args) => oldLog.apply(console, ['\x1b[33m[WARN]\x1b[0m', ...args]);
console.error = (...args) => oldLog.apply(console, ['\x1b[31m[ERROR]\x1b[0m', ...args]);
console.debug = (...args) => oldLog.apply(console, ['\x1b[36m[DEBUG]\x1b[0m', ...args]);

const claudejs = {
    orgUUID: undefined,

    /**
     * Get the details of the currently logged in user
     * @returns {Promise<object>} The user details
     */
    getUserDetails: async function () {
        const userData = await (await endpoints.ACCOUNT.get()).json();
        if (!claudejs.orgUUID) claudejs.orgUUID = userData.memberships[0].organization.uuid;
        return userData;
    },

    /**
     * Get the details of all the chats in the account
     * @returns {Promise<object>} The details of all the chats
     */
    getAllChatsDetails: async function () {
        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        return await (await endpoints.ALL_CHATS(claudejs.orgUUID).get()).json();
    },

    /**
     * Get the details of a specific chat
     * @param {Number} chatIndex The index of the chat to retrieve the details for
     * @returns {Promise<object>} The details of the chat
     */
    getChatDetails: async function (chatIndex) {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        return await (await endpoints.SINGLE_CHAT(claudejs.orgUUID, chatUUID).get()).json();
    },

    /**
     * Delete a specific chat
     * @param {Number} chatIndex The index of the chat to delete
     * @returns {Promise<void>}
     */
    deleteChat: async function (chatIndex) {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        await endpoints.SINGLE_CHAT(claudejs.orgUUID, chatUUID).delete();
        console.log('Chat deleted');
    },

    /**
     * Delete all the chats present in the account
     * @returns {Promise<void>}
     */
    deleteAllChats: async function () {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (!chats.length) return console.warn('No chats found');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();

        await Promise.all(chats.map((chat) => endpoints.SINGLE_CHAT(claudejs.orgUUID, chat.uuid).delete()));
        console.log('Deleted all chats');
    },

    /**
     * Send a message to a specific chat
     * @param {Number} chatIndex The index of the chat to send the message to
     * @param {String} message The message to send
     * @returns {Promise<void>}
     */
    sendMessage: async function (chatIndex, message) {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!message) throw new Error('Message must be included');
        if (typeof message !== 'string') throw new Error('Message must be a string');
        if (!message.length || !message.trim()) throw new Error('Message must not be empty');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        await endpoints.SEND_MESSAGE.post({
            body: JSON.stringify({
                completion: {
                    prompt: message,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    model: 'claude-2.1',
                },
                organization_uuid: claudejs.orgUUID,
                conversation_uuid: chatUUID,
                text: message,
                attachments: [],
            }),
        });
    },

    /**
     * Automatically generate the title for a chat based off a message hint.
     * THE CHAT TITLE WILL BE SET AUTOMATICALLY
     * @param {Number} chatIndex The index of the chat to rename the title of
     * @param {String} messageHint The hint for the title of the chat
     * @returns {Promise<String>} The new chat title
     */
    generateChatTitle: async function (chatIndex, messageHint) {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!messageHint) throw new Error('Message hint is required');
        if (typeof messageHint !== 'string') throw new Error('Message hint must be a string');
        if (!messageHint.length || !messageHint.trim()) throw new Error('Message hint must not be empty');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        return (
            await (
                await endpoints.GENERATE_CHAT_TITLE.post({
                    body: JSON.stringify({
                        organization_uuid: claudejs.orgUUID,
                        conversation_uuid: chatUUID,
                        message_content: messageHint,
                        recent_titles: [],
                    }),
                })
            ).json()
        )?.title;
    },

    /**
     * Manually update the title of a chat
     * @param {Number} chatIndex The index of the chat to rename the title of
     * @param {String} newName The new name of the chat's title
     * @returns {Promise<void>}
     */
    renameChatTitle: async function (chatIndex, newName = '') {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        await endpoints.SINGLE_CHAT(claudejs.orgUUID, chatUUID).put({
            body: JSON.stringify({
                name: newName,
            }),
        });
    },

    /**
     * Create a new empty chat
     * @param {String} chatName (optional) The name of the chat
     * @returns {Promise<object>} The details of the new chat
     */
    createChat: async function (chatName = '') {
        if (!window || !window?.crypto) throw new Error('Cannot get UUID, aborting...');
        if (!claudejs.orgUUID) await claudejs.getUserDetails();

        const chatData = await (
            await endpoints.ALL_CHATS(claudejs.orgUUID).post({
                body: JSON.stringify({
                    uuid: window.crypto.randomUUID(),
                    name: chatName,
                }),
            })
        ).json();

        console.log('Chat created successfully with UUID ' + chatData.uuid);
        return chatData;
    },
};
