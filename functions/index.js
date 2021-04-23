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

// テスト用
exports.sendMonthlyReportFunc = functions.https.onRequest(async (request, response) => {
  await sendMonthlyReport(null)
  response.send('ok');
});

const sendMonthlyReport = async (context) => {
  try {
    const res = await web.conversations.members({
      channel: channel
    })
    res.members.forEach(async (userId) => {
      const user = await web.users.info({
        user: userId
      });
      const querySnapshot = await db.collection('praises').where("to", "==", userId).get();
      let message = '';
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`${doc.id} => ${data}`);
        message += `- ${data.message}\n`;
      });
      if (message) {
        await web.chat.postMessage({
          text: `${user.user.real_name}さん、今月の褒められレポートが送られました。\n\n` + message,
          channel: '@hiroyukiendoh', // テスト中なの今の所固定
        });
      }
    })
    return;
  } catch (err) {
    if (err) {
      console.log(err.stack);
    }
    return;
  }
}

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
  try {
    await admin.firestore().collection('praises').doc(payload.actions[0].value).delete();
    await web.views.update({
      view_id: payload.view.id,
      view: await getPostedListView(payload)
    });

  } catch (err) {
    console.error(err);
  }
}


// TODO: 毎日の情報レポート生成（集計部分がまともに動かない版）
const createInfoReport = async () => {
  try {
    var maxCount = 0;
    var praisesCollectionRef = firebase.db.collection('praises');
    await praisesCollectionRef.get()
    .then(query => {
      query.forEach((doc) => {
        var data = doc.data();
        console.log('data.postedAt=' + JSON.stringify(data.postedAt));
        console.log('data.from=' + JSON.stringify(data.from));
        console.log('data.to=' + JSON.stringify(data.to));
        console.log('data.message=' + JSON.stringify(data.message));
        console.log('data.message=' + JSON.stringify(data.message));
        maxCount++;
      });
      return query;
    })
    .catch((error)=>{
      console.error(error);
      console.log(`データの取得に失敗しました`);
    });
  
  } catch (error) {
    console.error(error);
  }
  var reportText = '[開発中：test message]\n';
  reportText += '今日の褒め状況レポートです。\n';
  reportText += '昨日は *' + maxCount + '回* 褒めています。\n';
  reportText += '今月は *' + maxCount + '回* 褒めています。\n\n';
  reportText += '今日もどんどんみんなを褒めましょう🎉';
  return reportText;
}

exports.scheduledFunctionNoticeInfoReport = functions.region('asia-northeast1')
  .pubsub
  .schedule('every day 10:30')
  .timeZone('Asia/Tokyo')
  .onRun(async (context) => {
    const reportText = await createInfoReport();

    await web.chat.postMessage({
      token: token,
      text: reportText,
      channel: 'C03P1BGLN', // TODO: randomのチャンネルIDを今固定で対応。
    });
  return null;
  });
