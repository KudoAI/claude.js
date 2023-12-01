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

const BASE_URL = 'https://claude.ai/api';
const endpoints = {
    ACCOUNT: new RequestTypes(BASE_URL + '/account'),
    ORGANIZATIONS: new RequestTypes(BASE_URL + '/organizations'),
    ALL_CHATS: function (orgUUID) {
        return new RequestTypes(this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations');
    },
    SINGLE_CHAT: function (orgUUID, chatUUID) {
        return new RequestTypes(this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations/' + chatUUID);
    },
};

const claudejs = {
    getUserDetails: async () => {
        return await (await endpoints.ACCOUNT.get()).json();
    },

    getAllChatsDetails: async () => {
        const orgUUID = (await claudejs.getUserDetails()).memberships[0].organization.uuid;
        return await (await endpoints.ALL_CHATS(orgUUID).get()).json();
    },

    getChatMessagesDetails: async (chatIndex) => {
        const chats = await claudejs.getAllChatsDetails();

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        const orgUUID = (await claudejs.getUserDetails()).memberships[0].organization.uuid;
        const chatUUID = chats[chatIndex].uuid;

        return await (await endpoints.SINGLE_CHAT(orgUUID, chatUUID).get()).json();
    },

    deleteChat: async (chatIndex) => {
        const chats = await claudejs.getAllChatsDetails();

        if (typeof chatIndex !== 'number') throw new Error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) throw new Error('Chat index is out of bounds');

        const orgUUID = (await claudejs.getUserDetails()).memberships[0].organization.uuid;
        const chatUUID = chats[chatIndex].uuid;

        await endpoints.SINGLE_CHAT(orgUUID, chatUUID).delete();
        console.log('Chat deleted');
    },

    deleteAllChats: async () => {
        const chats = await claudejs.getAllChatsDetails();

        if (!chats.length) return console.warn('No chats found');

        const orgUUID = (await claudejs.getUserDetails()).memberships[0].organization.uuid;

        chats.forEach(async (chat) => await endpoints.SINGLE_CHAT(orgUUID, chat.uuid).delete());
        console.log('Deleted all chats');
    },
};
