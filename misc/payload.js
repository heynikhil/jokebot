const { callSendAPI } = require('./apiCall')
const config = require("../config/constant")
const request = require("request-promise")
const isDefined = (obj) => {
    if (typeof obj == "undefined") {
        return false;
    }
    if (!obj) {
        return false;
    }
    return obj != null;
}

/*
 * Send an text using the Send API.
 *
 */
const sendTextMessage = async (recipientId, text) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    };

    await callSendAPI(messageData);
}

const greetUserText = async (userId) => {
    //first read user firstname
    await request(
        {
            uri: "https://graph.facebook.com/v3.0/" + userId,
            qs: {
                access_token: config.FB_PAGE_TOKEN
            }
        },
        (error, response, body) => {
            if (!error && response.statusCode == 200) {
                var user = JSON.parse(body);
                if (user.first_name) {
                    console.log(
                        "FB user: %s %s, %s",
                        user.first_name,
                        user.last_name,
                        user.gender
                    );

                    async function sendGreet() {
                        await sendTextMessage(userId, "Welcome " + user.first_name + " " + user.last_name + " 😀 " + "! " + "I am Virtual Assistant can make you laugh by sending jokes 🤖");
                    }
                    sendGreet();
                } else {
                    console.log("Cannot get data for fb user with id", userId);
                }
            } else {
                console.error(response.error);
            }
        }
    );
}
/*
 * Turn typing indicator on
 *
 */
const sendTypingOn = (recipientId) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };
    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
const sendTypingOff = (recipientId) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

module.exports = {
    sendTextMessage,
    greetUserText,
    isDefined,
    sendTypingOff,
    sendTypingOn
}