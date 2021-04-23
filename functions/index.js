const functions = require('firebase-functions');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.helloWorld = functions.region('asia-northeast1').https.onRequest((req, res) => {
  functions.logger.info('Hello logs!', {structuredData: true});
  res.status(200).send('Hello from Firebase!');
});
