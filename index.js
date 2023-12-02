class RequestTypes {
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
    ACCOUNT: new RequestTypes(API_BASE_URL + '/account'),
    ORGANIZATIONS: new RequestTypes(API_BASE_URL + '/organizations'),
    ALL_CHATS: function (orgUUID) {
        return new RequestTypes(this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations');
    },
    SINGLE_CHAT: function (orgUUID, chatUUID) {
        return new RequestTypes(this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations/' + chatUUID);
    },
    SEND_MESSAGE: new RequestTypes(API_BASE_URL + '/append_message'),
};

let oldLog = console.log;
console.log = (...args) => oldLog.apply(console, ['\x1b[32m[INFO]\x1b[0m', ...args]);
console.warn = (...args) => oldLog.apply(console, ['\x1b[33m[WARN]\x1b[0m', ...args]);
console.error = (...args) => oldLog.apply(console, ['\x1b[31m[ERROR]\x1b[0m', ...args]);
console.debug = (...args) => oldLog.apply(console, ['\x1b[36m[DEBUG]\x1b[0m', ...args]);

const claudejs = {
    orgUUID: undefined,

    getUserDetails: async function () {
        const userData = await (await endpoints.ACCOUNT.get()).json();
        if (!claudejs.orgUUID) claudejs.orgUUID = userData.memberships[0].organization.uuid;
        return userData;
    },

    getAllChatsDetails: async function () {
        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        return await (await endpoints.ALL_CHATS(claudejs.orgUUID).get()).json();
    },

    getChatMessagesDetails: async function (chatIndex) {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        return await (await endpoints.SINGLE_CHAT(claudejs.orgUUID, chatUUID).get()).json();
    },

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

    deleteAllChats: async function () {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (!chats.length) return console.warn('No chats found');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();

        await Promise.all(chats.map((chat) => endpoints.SINGLE_CHAT(claudejs.orgUUID, chat.uuid).delete()));
        console.log('Deleted all chats');
    },

    sendMessage: async function (chatIndex, message) {
        const chats = Array.from(await claudejs.getAllChatsDetails());

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!message) throw new Error('Message must be included');
        if (!message.length || !message.trim()) throw new Error('Message must not be empty');
        if (typeof message !== 'string') throw new Error('Message must be a string');

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

    renameChat: async function (chatIndex, newName) {
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
