"use strict";
const apiai = require("apiai");
const config = require("./config/constant");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const uuid = require("uuid");
const logger = require("morgan");
const { greetUserText, isDefined, sendTextMessage, sendTypingOff, sendTypingOn } = require("./misc/payload")
const cli = require('./config/cli').console;
const axios = require('axios')
// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
  throw new Error("missing FB_PAGE_TOKEN");
}
if (!config.FB_VERIFY_TOKEN) {
  throw new Error("missing FB_VERIFY_TOKEN");
}
if (!config.API_AI_CLIENT_ACCESS_TOKEN) {
  throw new Error("missing API_AI_CLIENT_ACCESS_TOKEN");
}
if (!config.FB_APP_SECRET) {
  throw new Error("missing FB_APP_SECRET");
}
if (!config.SERVER_URL) {
  //used for ink to static files
  throw new Error("missing SERVER_URL");
}

app.use(logger("dev"));
app.set("port", process.env.PORT || 5000);

// Process application/x-www-form-urlencoded
app.use(
  bodyParser.urlencoded({
    extended: false
  })
);

// Process application/json
app.use(bodyParser.json());

// Init Dialogflow Services
const apiAiService = apiai(config.API_AI_CLIENT_ACCESS_TOKEN, {
  language: "en",
  requestSource: "fb"
});
const sessionIds = new Map();

// Index route
app.get("/", function (req, res) {
  res.send("Hello world, I am a chat bot");
});

// for Facebook verification
app.get("/webhook/", function (req, res) {
  console.log("request");
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === config.FB_VERIFY_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post("/webhook/", function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object == "page") {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function (pageEntry) {
      if (pageEntry.standby) {
        // iterate webhook events from standby channel
      } else if (pageEntry.messaging) {
        // Iterate over each messaging event
        pageEntry.messaging.forEach(function (messagingEvent) {
          if (messagingEvent.message) {
            receivedMessage(messagingEvent);
          } else if (messagingEvent.postback) {
            receivedPostback(messagingEvent);
          } else {
            console.log(
              "Webhook received unknown messagingEvent: ",
              messagingEvent
            );
          }
        });
      }
    });

    // Assume all went well.
    // You must send back a 200, within 20 seconds
    res.sendStatus(200);
  }
});

function receivedMessage(event) {
  var senderID = event.sender.id;
  var message = event.message;

  if (!sessionIds.has(senderID)) {
    sessionIds.set(senderID, uuid.v1());
  }

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;

  var quickReply = message.quick_reply;

  if (isEcho) {
    handleEcho(messageId, appId, metadata);
    return;
  } else if (quickReply) {
    handleQuickReply(senderID, quickReply, messageId);
    return;
  }
  if (messageText) {
    //send message to api.ai
    sendToApiAi(senderID, messageText);
  } else if (messageAttachments) {
    if (messageAttachments[0].payload.sticker_id) {
      handleMessageAttachments(messageAttachments, senderID)
    } else {
      sendToApiAi(senderID, messageAttachments[0].payload.url);
    }
    // handleMessageAttachments(messageAttachments, senderID);
  }
}

/**
 * Handle Attachment (sticker, image, PDF)
 * @param {*} messageAttachments 
 * @param {*} senderID 
 */
function handleMessageAttachments(messageAttachments, senderID) {
  if (messageAttachments[0].payload.sticker_id) {
    sendTextMessage(senderID, "👍🏻");
  }
  else {
    sendTextMessage(senderID, "Attachment received. Thank you.");
  }
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
  // Just logging message echoes to console
  console.log(
    "Received echo for message %s and app %d with metadata %s",
    messageId,
    appId,
    metadata
  );
}
const sendJoke = async (sender) => {
  await getRandomJoke().then(async joke => {
    const emoji = "😅😆🤣"
    await sendTextMessage(sender, joke)
    await sendTypingOn(sender)
    await sendTextMessage(sender, emoji)
  }).catch(error => {
    console.log(error);
  })
}


async function handleApiAiAction(sender, action, responseText, contexts, parameters) {
  cli.blue(action)
  switch (action) {
    case "FACEBOOK_WELCOME":
      greetUserText(sender)
      break;

    case "input.unknown":
      var responseText_ = "Sorry i am not able to get your point.";
      var responseText = "I can make you laugh.\nYou can ask me to send jokes.";
      await sendTextMessage(sender,responseText_)
      await sendTextMessage(sender,responseText)
      break;

    case "joke-bot-purpose":
      var responseText = "Hello, I can make you laugh.\nYou can ask me to send jokes.";
      sendTextMessage(sender, responseText)
      break;

    case "send-joke":
      sendJoke(sender)
      break;

    case "send-more-joke":
      sendJoke(sender)
      break;

    default:
      sendTextMessage(sender, responseText);
      break;
  }
}

/**
 * Handle DialogFlow Responses based On action , paramenters and all....
 */
function handleApiAiResponse(sender, response) {
  let responseText = response.result.fulfillment.speech;
  let responseData = response.result.fulfillment.data;
  let action = response.result.action;
  let contexts = response.result.contexts;
  let parameters = response.result.parameters;

  sendTypingOff(sender);

  if (responseText == "" && !isDefined(action)) {
    //api ai could not evaluate input.
    console.log("Unknown query" + response.result.resolvedQuery);
    sendTextMessage(
      sender,
      "I'm not sure what you want. Can you be more specific?"
    );
  } else if (isDefined(action)) {
    handleApiAiAction(sender, action, responseText, contexts, parameters);
  } else if (isDefined(responseData) && isDefined(responseData.facebook)) {
    try {
      console.log("Response as formatted message" + responseData.facebook);
      sendTextMessage(sender, responseData.facebook);
    } catch (err) {
      sendTextMessage(sender, err.message);
    }
  } else if (isDefined(responseText)) {
    sendTextMessage(sender, responseText);
  }
}

/**
 * Send Messages to DialogFlow
 */
function sendToApiAi(sender, text) {
  sendTypingOn(sender);
  let apiaiRequest = apiAiService.textRequest(text, {
    sessionId: sessionIds.get(sender)
  });

  apiaiRequest.on("response", response => {
    if (isDefined(response.result)) {
      handleApiAiResponse(sender, response);
    }
  });

  apiaiRequest.on("error", error => console.error(error));
  apiaiRequest.end();
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  console.log(event);

  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;
  cli.blue(payload);
  handleApiAiAction(senderID, payload, "", "", "")

  console.log(
    "Received postback for user %d and page %d with payload '%s' " + "at %d",
    senderID,
    recipientID,
    payload,
    timeOfPostback
  );
}

const getRandomJoke = async () => {
  const url = "https://icanhazdadjoke.com/";
  try {
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/json' // FOR GETTING RESULT IN FORM OF JSON !!
      }
    });
    return response.data['joke']
  } catch (error) {
    console.error(error);
  }
}

// Spin up the server
app.listen(app.get("port"), function () {
  console.log("Magic Started on port", app.get("port"));
});
