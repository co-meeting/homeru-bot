const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { WebClient } = require('@slack/web-api');

const { token, channel } = functions.config().slack;

const web = new WebClient(token);

admin.initializeApp();
const db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const showHomeruView = async (payload, res) => {
  try {
    const view = {
        "type": "modal",
        "title": {
            "type": "plain_text",
            "text": "褒めボット",
            "emoji": true
        },
        "submit": {
            "type": "plain_text",
            "text": "褒める",
            "emoji": true
        },
        "close": {
            "type": "plain_text",
            "text": "閉じる",
            "emoji": true
        },
        "blocks": [
            {
                "type": "input",
                "block_id": "user",
                "element": {
                    "type": "users_select",
                    "placeholder": {
                        "type": "plain_text",
                        "text": "ユーザを選択してください",
                        "emoji": true
                    },
                    "action_id": "user"
                },
                "label": {
                    "type": "plain_text",
                    "text": "褒める対象",
                    "emoji": true
                }
            },
            {
                "type": "input",
                "block_id": "praise",
                "element": {
                    "action_id": "praise",
                    "type": "plain_text_input",
                    "placeholder": {
                        "type": "plain_text",
                        "text": "とにかく褒めてください",
                        "emoji": true
                    }
                },
                "label": {
                    "type": "plain_text",
                    "text": "褒めコメント",
                    "emoji": true
                }
            }
        ]
    };
    let response = await web.views.open({
      token,
      trigger_id: payload.trigger_id,
      view: view
    });

    return;
  } catch (err) {
    console.error(err);
  }
}

const showCompleteView = async (payload) => {
  try {
    const view = {
      "type": "modal",
      "callback_id": payload.callback_id,
      "title": {
        "type": "plain_text",
        "text": "褒めボット"
      },
      "blocks": [
        {
          "type": "section",
          "text": {
            "type": "plain_text",
            "text": "褒めコメントを投稿しました。\n\nもっともっと褒めましょう！"
          }
        }
      ]
    };
    let response = await web.views.update({
      view_id: payload.view.id,
      view: view
    });

    return;
  } catch (err) {
    console.error(err);
  }
}

const postHomeruComment = async (payload) => {
  const docRef = db.collection('praises').doc();
  const res = await docRef.set({
    from: payload.user.id,
    to: payload.view.state.values.user.user.selected_user,
    message: payload.view.state.values.praise.praise.value,
    postedAt: admin.firestore.Timestamp.fromDate(new Date())
  });
}

exports.shortcut = functions.region('asia-northeast1').https.onRequest(async (req, res) => {
  const payload = req.body.payload
    ? JSON.parse(req.body.payload)
    : req.body;
  switch (payload.type) {
    case 'shortcut':
      switch (payload.callback_id) {
        case 'homeru':
          showHomeruView(payload, res);
        default:
          res.sendStatus(404);
      }
      break;
    case 'view_submission':
      showCompleteView(payload);
      await postHomeruComment(payload, res);
      res.send('OK');
      break;
    default:
      res.sendStatus(404);
  }
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
