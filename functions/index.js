const functions = require('firebase-functions');
const { WebClient } = require('@slack/web-api');

const { token, channel } = functions.config().slack;

const web = new WebClient(token);

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.helloWorld = functions.region('asia-northeast1').https.onRequest((req, res) => {
  functions.logger.info('Hello logs!', { structuredData: true });
  res.status(200).send('Hello from Firebase!');
});

// 月初にダイレクトメッセージに投稿
exports.scheduledFunction = functions.pubsub.schedule('1 of month 09:00')
  .onRun((context) => {
    web.chat.postMessage({
      text: 'Hello world!',
      channel: '@hiroyukiendoh',
    });
    return null;
  });
