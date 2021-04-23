const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { WebClient } = require('@slack/web-api');

const { token, channel } = functions.config().slack;

const web = new WebClient(token);

const dateFormatConfig = {
  locale: 'ja-JP',
  formatOptions: { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' }
};

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
            "multiline": true,
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

const showHomeruCompleteView = async (payload, res) => {
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

    await postPraise(payload, res);

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      response_action: "update",
      view
    }));

    return;
  } catch (err) {
    console.error(err);
  }
}

const postPraise = async (payload) => {
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
          res.send('OK');
          break;
        case 'show_posted':
          openPostedList(payload);
          res.send('OK');
          break;
        default:
          res.sendStatus(404);
      }
      break;
    case 'view_submission': {
      await showHomeruCompleteView(payload, res);
      break;
    }
    case 'block_actions':
      await deleteDoc(payload);
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

async function openPostedList(payload) {
  try {
    await web.views.open({
      token,
      trigger_id: payload.trigger_id,
      view: await getPostedListView(payload)
    });
  } catch (err) {
    console.error(err);
  }
}

async function getPostedListView(payload) {
  // TODO: 投稿済みを絞り込み条件に入れる
  const praises = (await admin.firestore().collection('praises').where('from', '==', payload.user.username).orderBy('postedAt', 'desc').get()).docs;
  // TODO: praisesが空の場合のビュー
  return {
      "type": "modal",
      "close": {
          "type": "plain_text",
          "text": "閉じる",
          "emoji": true
      },
      "title": {
          "type": "plain_text",
          "text": "褒めbot",
          "emoji": true
      },
      "blocks": praises.map(praise => {
        const data = praise.data();
        const homeComment = `
          ${data.postedAt.toDate().toLocaleDateString(dateFormatConfig.locale, dateFormatConfig.formatOptions)} @${data.to}\n
          ${data.message}
        `;
        return {
              "type": "section",
              "text": {
                  "type": "mrkdwn",
                  // TODO: 日付のフォーマットが 2021 4 23, Fri の用になってしまう
                  "text": homeComment
              },
              "accessory": {
                  "type": "button",
                  "text": {
                      "type": "plain_text",
                      "text": "削除",
                      "emoji": true
                  },
                  "value": praise.id,
                  "action_id": "button-action",
                  "style": "danger",
                  "confirm": {
                    "title": {
                      "type": "plain_text",
                      "text": "以下の褒めコメントを本当に削除して良いですか？"
                    },
                    "text": {
                      "type": "mrkdwn",
                      "text": homeComment
                    },
                    "confirm": {
                      "type": "plain_text",
                      "text": "削除する"
                    },
                    "deny": {
                      "type": "plain_text",
                      "text": "戻る"
                    }
                  }
              }
          };
      })
  };
}

async function deleteDoc(payload) {
  try{
    await admin.firestore().collection('praises').doc(payload.actions[0].value).delete();
    await web.views.update({
      view_id: payload.view.id,
      view: await getPostedListView(payload)
    });

  } catch(err) {
    console.error(err);
  }
}
