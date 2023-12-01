class RequestTypes {
    constructor(url) {
        this.url = url;
        Object.freeze(this);
    }

    #base(method, options = {}) {
        if (options?.method) delete options.method;
        return fetch(this.url, { method: method, ...options });
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
};

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
        const chats = await claudejs.getAllChatsDetails();

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        return await (await endpoints.SINGLE_CHAT(claudejs.orgUUID, chatUUID).get()).json();
    },

    deleteChat: async function (chatIndex) {
        const chats = await claudejs.getAllChatsDetails();

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
};
