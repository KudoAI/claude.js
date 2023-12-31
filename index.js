class ApiRequestTypes {
    /**
     * @param {String} url The api endpoint to connect to
     * @param {HeadersInit} headers The headers to add to the request
     */
    constructor(url, headers = {}) {
        if (typeof url !== 'string') throw new Error('Url must be a string');
        this.url = url;
        if (typeof headers !== 'object') throw new Error('Headers must be an object');
        this.headers = headers;
        Object.freeze(this);
    }

    /**
     * Send a request with a given method
     * @param {String} method The method to use for the request
     * @param {RequestInit} options The request options
     * @returns {Promise<Response>} The response object
     */
    #base(method, options = {}) {
        if (typeof options !== 'object') return console.error('Options must be an object');
        if (options?.method) delete options.method;

        return fetch(this.url, {
            method: method,
            headers: this.headers,
            ...options,
        });
    }

    /**
     * Send a GET request
     * @param {RequestInit} options The request options
     * @returns {Promise<Response>} The response object
     */
    get(options = {}) {
        return this.#base('GET', options);
    }

    /**
     * Send a POST request
     * @param {RequestInit} options The request options
     * @returns {Promise<Response>} The response object
     */
    post(options = {}) {
        return this.#base('POST', options);
    }

    /**
     * Send a PUT request
     * @param {RequestInit} options The request options
     * @returns {Promise<Response>} The response object
     */
    put(options = {}) {
        return this.#base('PUT', options);
    }

    /**
     * Send a DELETE request
     * @param {RequestInit} options The request options
     * @returns {Promise<Response>} The response object
     */
    delete(options = {}) {
        return this.#base('DELETE', options);
    }
}

const API_BASE_URL = 'https://claude.ai/api';
const REQUEST_HEADERS = {
    'content-type': 'application/json',
    authority: 'claude.ai',
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    dnt: '1',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'upgrade-insecure-requests': '1',
    connection: 'keep-alive',
};

const endpoints = {
    ACCOUNT: new ApiRequestTypes(API_BASE_URL + '/account', REQUEST_HEADERS),
    ORGANIZATIONS: new ApiRequestTypes(API_BASE_URL + '/organizations', REQUEST_HEADERS),
    ALL_CHATS: function (orgUUID) {
        return new ApiRequestTypes(this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations', REQUEST_HEADERS);
    },
    SINGLE_CHAT: function (orgUUID, chatUUID) {
        return new ApiRequestTypes(
            this.ORGANIZATIONS.url + '/' + orgUUID + '/chat_conversations/' + chatUUID,
            REQUEST_HEADERS
        );
    },
    SEND_MESSAGE: new ApiRequestTypes(API_BASE_URL + '/append_message', REQUEST_HEADERS),
    GENERATE_CHAT_TITLE: new ApiRequestTypes(API_BASE_URL + '/generate_chat_title', REQUEST_HEADERS),
    ACCOUNT_AUTH: new ApiRequestTypes(API_BASE_URL + '/auth/current_account', REQUEST_HEADERS),
    LOGOUT: new ApiRequestTypes(API_BASE_URL + '/auth/logout', REQUEST_HEADERS),
};

let oldLog = console.log;
console.log = (...args) => oldLog.apply(console, ['\x1b[32m[claude.js >> INFO]\x1b[0m', ...args]);
console.warn = (...args) => oldLog.apply(console, ['\x1b[33m[claude.js >> WARN]\x1b[0m', ...args]);
console.error = (...args) => oldLog.apply(console, ['\x1b[31m[claude.js >> ERROR]\x1b[0m', ...args]);
console.debug = (...args) => oldLog.apply(console, ['\x1b[36m[claude.js >> DEBUG]\x1b[0m', ...args]);

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
     * @returns {Promise<object[]>} The details of all the chats
     */
    getAllChatsDetails: async function () {
        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        return Array.from(await (await endpoints.ALL_CHATS(claudejs.orgUUID).get()).json());
    },

    /**
     * Get the details of a specific chat
     * @param {Number} chatIndex The index of the chat to retrieve the details for
     * @returns {Promise<object>} The details of the chat
     */
    getChatDetails: async function (chatIndex) {
        const chats = await claudejs.getAllChatsDetails();

        if (typeof chatIndex !== 'number' && !chatIndex) return console.error('Chat index must be specified');
        if (typeof chatIndex !== 'number') return console.error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) return console.error('Chat index is out of bounds');

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
        const chats = await claudejs.getAllChatsDetails();

        if (typeof chatIndex !== 'number' && !chatIndex) return console.error('Chat index must be specified');
        if (typeof chatIndex !== 'number') return console.error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) return console.error('Chat index is out of bounds');

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
        const chats = await claudejs.getAllChatsDetails();

        if (!chats.length) return console.warn('No chats found');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();

        await Promise.all(chats.map((chat) => endpoints.SINGLE_CHAT(claudejs.orgUUID, chat.uuid).delete()));
        console.log('Deleted all chats');
    },

    /**
     * Send a message to a specific chat
     * @param {Number} chatIndex The index of the chat to send the message to
     * @param {String} message (optional) The message to send. REQUIRED IF NO ATTACHMENTS
     * @param {object | object[]} attachments The attachments to include in the message (text files, PDFs, etc.). REQUIRED IF NO MESSAGE
     * @param {Boolean} returnResponse (optional) Whether to return the AI's response or not. Defaults to false
     * @returns {Promise<String|void>}
     */
    sendMessage: async function (chatIndex, message = '', attachments = [], returnResponse = false) {
        const chats = await claudejs.getAllChatsDetails();

        if (!Array.isArray(attachments)) attachments = Array.of(attachments);

        if (typeof chatIndex !== 'number' && !chatIndex) return console.error('Chat index must be specified');
        if (typeof chatIndex !== 'number') return console.error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) return console.error('Chat index is out of bounds');

        if (!message && !attachments.length) return console.error('Either message or attachments must be included');

        if (message && typeof message !== 'string') return console.error('Message must be a string');
        if (message && (!message.length || !message.trim())) return console.error('Message must not be empty');

        if (
            !attachments.every(
                (attachment) =>
                    typeof attachment === 'object' &&
                    attachment?.extracted_content !== undefined &&
                    attachment?.file_name !== undefined &&
                    attachment?.file_size !== undefined &&
                    attachment?.file_type !== undefined &&
                    Object.keys(attachment).length === 4
            )
        )
            console.error('Invalid attachments');

        if (typeof returnResponse !== 'boolean') return console.error('returnResponse must be a boolean value');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();
        const chatUUID = chats[chatIndex].uuid;

        const response = await endpoints.SEND_MESSAGE.post({
            body: JSON.stringify({
                completion: {
                    prompt: message || '',
                    timezone: 'America/New_York',
                    model: 'claude-2.1',
                },
                organization_uuid: claudejs.orgUUID,
                conversation_uuid: chatUUID,
                text: message || '',
                attachments: attachments || [],
            }),
        });

        if (returnResponse)
            return (await response.text())
                .split(/[\r\n]+/) // split by new lines
                .filter((dataString) => !!dataString) // remove possible 'undefined' values
                .map((dataString) => JSON.parse(dataString.split('data: ')[1]).completion) // parse the JSON after the 'data: ' string and get the 'completion' value
                .join('') // join the strings
                .trim(); // remove possible leading and trailing white spaces
    },

    /**
     * Automatically generate the title for a chat based off a message hint.
     * THE CHAT TITLE WILL BE SET AUTOMATICALLY
     * @param {Number} chatIndex The index of the chat to rename the title of
     * @param {String} messageHint The hint for the title of the chat
     * @returns {Promise<String>} The new chat title
     */
    generateChatTitle: async function (chatIndex, messageHint) {
        const chats = await claudejs.getAllChatsDetails();

        if (typeof chatIndex !== 'number' && !chatIndex) return console.error('Chat index must be specified');
        if (typeof chatIndex !== 'number') return console.error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) return console.error('Chat index is out of bounds');

        if (!messageHint) return console.error('Message hint is required');
        if (typeof messageHint !== 'string') return console.error('Message hint must be a string');
        if (!messageHint.length || !messageHint.trim()) return console.error('Message hint must not be empty');

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
        const chats = await claudejs.getAllChatsDetails();

        if (typeof chatIndex !== 'number' && !chatIndex) return console.error('Chat index must be specified');
        if (typeof chatIndex !== 'number') return console.error('Chat index must be a number');
        if (!chats.length) return console.warn('No chats found');
        if (chatIndex < 0 || chatIndex >= chats.length) return console.error('Chat index is out of bounds');

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
     * @param {String} chatTitle (optional) The name of the chat
     * @returns {Promise<object>} The details of the new chat
     */
    createEmptyChat: async function (chatTitle = '') {
        if (!window || !window?.crypto) return console.error('Cannot get UUID, aborting...');
        if (!claudejs.orgUUID) await claudejs.getUserDetails();

        const chatData = await (
            await endpoints.ALL_CHATS(claudejs.orgUUID).post({
                body: JSON.stringify({
                    uuid: window.crypto.randomUUID(),
                    name: chatTitle,
                }),
            })
        ).json();

        console.log('Chat created successfully with UUID ' + chatData.uuid);
        return chatData;
    },

    /**
     * Update the current user's display name and full name
     * @param {String} displayName (optional) The new display name
     * @param {String} fullName (optional) The new full name
     * @returns {Promise<void>}
     */
    updateAccountInfo: async function (displayName = '', fullName = '') {
        const { display_name: old_display_name, full_name: old_full_name } = await claudejs.getUserDetails();

        const userData = await (
            await endpoints.ACCOUNT_AUTH.put({
                body: JSON.stringify({
                    display_name: displayName || old_display_name,
                    full_name: fullName || old_full_name,
                }),
            })
        ).json();

        if (userData?.success)
            return console.log(
                'Successfully updated user information:\n\nDisplay name: ' +
                    userData.account.display_name +
                    '\nFull name: ' +
                    userData.account.full_name
            );
        else return console.error("Couldn't update user information");
    },

    /**
     * Logs the user out of the session
     * @returns {Promise<void>}
     */
    logout: async function () {
        if ((await (await endpoints.LOGOUT.post()).json())?.success) return console.log('Successfully logged out');
        else return console.error('Could not log out');
    },

    /**
     * Create a new chat and send a first message in it
     * @param {String} message The message to send in the new chat
     * @param {String} title (optional) The title of the new chat (generated automatically if not specified)
     * @returns {Promise<object>} The details of the new chat
     */
    startNewChat: async function (message, title = '') {
        if (!message) return console.error('Message must be included');
        if (typeof message !== 'string') return console.error('Message must be a string');
        if (!message.length || !message.trim()) return console.error('Message must not be empty');

        if (title && typeof title !== 'string') return console.error('Title must be a string');

        if (!claudejs.orgUUID) await claudejs.getUserDetails();

        const chatData = await claudejs.createEmptyChat(title);
        const chatIndex = (await claudejs.getAllChatsDetails()).findIndex((chat) => chat.uuid === chatData.uuid);

        if (!title) await claudejs.generateChatTitle(chatIndex, message);

        await claudejs.sendMessage(chatIndex, message);

        console.log('Chat started successfully');
        return chatData;
    },

    /**
     * Transform a text-based file into a format readable by the AI
     * @param {File | File[] | FileList} files The list of files to transform
     * @returns {Promise<object[]>} The files transformed into a format readable by the AI
     */
    prepareFiles: async function (files) {
        if (!Array.isArray(files)) files = Array.of(files);
        files = Array.from(...files);

        if (!files || !Array.isArray(files) || (Array.isArray(files) && !files.length))
            return console.error('Please provide at least one file');
        if (!files.every((element) => element instanceof File))
            return console.error('files must be an array of File items');

        files = files.map((file) => {
            return new Promise(function (resolve, reject) {
                const reader = new FileReader();

                reader.addEventListener(
                    'load',
                    () => {
                        resolve({
                            extracted_content: reader.result,
                            file_name: file.name,
                            file_size: file.size,
                            file_type: file.type,
                        });
                    },
                    false
                );

                if (file) reader.readAsText(file);
                else reject('Missing file');
            });
        });

        return await Promise.all(files);
    },
};
