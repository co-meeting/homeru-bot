const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { WebClient } = require('@slack/web-api');

const { token, channel } = functions.config().slack;

const web = new WebClient(token);
const timezone = 'Asia/Tokyo';
process.env.TZ = timezone;

const dateFormatConfig = {
  locale: 'ja-JP',
  formatOptions: { weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timezone }
};

admin.initializeApp();
const db = admin.firestore();

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

const showHomeruCompleteView = (payload, res) => {
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
            "text": "登録してくださりありがとうございます！\nあなたのお陰でチームの空気がまた一つ良くなりました。\nご協力ありがとうございました！"
          }
        }
      ]
    };

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

const showPostPraiseValidationErrorView = (res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    response_action: "errors",
    errors: {
      user: 'チャンネル内のユーザを選択してください。'
    }
  }));
}

const postPraise = async (payload, res) => {
  const membersRes = await web.conversations.members({
    channel: channel
  });
  const toUser = payload.view.state.values.user.user.selected_user;
  if (!membersRes.members.includes(toUser)) {
    showPostPraiseValidationErrorView(res);
    return;
  }
  const userRes = await web.users.info({user: toUser});
  const toUserName = userRes.user.name;
  const docRef = db.collection('praises').doc();
  await docRef.set({
    from: payload.user.id,
    fromName: payload.user.username,
    to: toUser,
    toName: toUserName,
    message: payload.view.state.values.praise.praise.value,
    postedAt: admin.firestore.Timestamp.fromDate(new Date()),
    isNotified: false
  });
  showHomeruCompleteView(payload, res);
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
      await postPraise(payload, res);
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

const getSlackUserMap = async () => {
  const allUsers = await web.users.list();
  return allUsers.members.reduce((map, user) => {
    map[user.id] = user;
    return map;
  }, {})
}

const sendMonthlyReport = async (context) => {
  try {
    const userMap = await getSlackUserMap();
    const res = await web.conversations.members({
      channel: channel
    })
    const baseDate = new Date();
    const startDate = new Date(baseDate.getFullYear(), (baseDate.getMonth() - 1), 1, 0, 0, 0);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0);
    console.log(startDate, endDate);
    res.members.forEach(async (userId) => {
      const querySnapshot = await db.collection('praises')
        .where('to', '==', userId)
        .where('postedAt' , '>=', startDate)
        .where('postedAt' , '<', endDate).get();
      const userDocMap = querySnapshot.docs.reduce((map, docSnapshot) => {
        const data = docSnapshot.data();
        if (!data.from) return map;

        if (!map[data.from]) {
          map[data.from] = [];
        }
        map[data.from].push(data);
        return map;
      }, {});

      let message = '';
      for (const [from, docs] of Object.entries(userDocMap)) {
        const user = userMap[from];
        if (!user) continue;

        const userName = user.real_name;
        message += `🎉 *${userName}さんから* 🎉\n\n`;
        const praises = [];
        docs.forEach((data) => {
          praises.push(`• ${data.message}\n`);
        });
        message += praises.join('\n');
        message += '\n';
      }
      // TODO: isNotificationのセット
      if (message) {
        const user = userMap[userId];
        // 設定されたチャンネルに投稿
        await web.chat.postMessage({
          text: `<@${user.id}>\n${user.real_name}さん、今月の褒められレポートが送られました。\n\n${message}`,
          channel: channel,
        });

        querySnapshot.docs.forEach(docSnapshot => {
          docSnapshot.ref.update({
            isNotified: true
          });
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

// 月初にダイレクトメッセージに投稿
exports.scheduledFunction = functions.region('asia-northeast1').pubsub.schedule('1 of month 09:00')
  .timeZone(timezone)
  .onRun(sendMonthlyReport);

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
  const praises = (
    await admin.firestore().collection('praises')
      .orderBy('isNotified', 'asc')
      .orderBy('postedAt', 'desc')
      .where('from', '==', payload.user.id)
      .where('isNotified', '!=', true)
      .get()
  ).docs;
  const userMap = await getSlackUserMap();
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
    "blocks": praises.length === 0
      ?  [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "未通知の褒めコメントはありません。"
          }
        }
      ]
      : praises.map(praise => {
        const data = praise.data();
        const toUser = userMap[data.to];
        const homeComment = `
            *${data.postedAt.toDate().toLocaleDateString(dateFormatConfig.locale, dateFormatConfig.formatOptions)} @${toUser.real_name}*\n${data.message}
        `;
        return {
          "type": "section",
          "text": {
            "type": "mrkdwn",
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

// 毎日の情報レポート生成
const createInfoReport = async () => {
  var yesterdayCount = 0;
  var thisMonthCount = 0;
  try {
    var now = new Date();
    console.log(now);
    const today = new Date(now.setHours(0, 0, 0, 0));
    const yesterday = new Date(now.setDate(now.getDate() - 1));
    const thisMonth = new Date(now.setDate(1));
    const nextMonth = new Date(now.setMonth(now.getMonth() + 1 ));
    console.log('期間(昨日)', yesterday, '~', today);
    console.log('期間(今月)', thisMonth, '~', nextMonth);
    const yesterdayStartAt = admin.firestore.Timestamp.fromDate(yesterday);
    const yesterdayEndAt = admin.firestore.Timestamp.fromDate(today);
    const thisMonthStartAt = admin.firestore.Timestamp.fromDate(thisMonth);
    const thisMonthEndAt = admin.firestore.Timestamp.fromDate(nextMonth);
    const yesterdayQuerySnapshot = (await admin.firestore().collection('praises')
      .orderBy('postedAt').startAt(yesterdayStartAt).endBefore(yesterdayEndAt).get());
    const thisMonthQuerySnapshot = (await admin.firestore().collection('praises')
      .orderBy('postedAt').startAt(thisMonthStartAt).endBefore(thisMonthEndAt).get());
    yesterdayQuerySnapshot.docs.forEach((doc) => { yesterdayCount++; }, {});
    thisMonthQuerySnapshot.docs.forEach((doc) => { thisMonthCount++; }, {});
  } catch (error) {
    console.error(error);
  }
  // TODO:レポート本文の内容は、使ってみて、良い文面が思いついたら見直す
  var reportText = '今日の褒め状況レポートです。\n\n';
  if ( yesterdayCount > 0 ) {
    reportText += '昨日は *' + yesterdayCount + '回* 褒めています。\n';
  }
  reportText += '今月は *' + thisMonthCount + '回* 褒めています。\n\n';
  reportText += '今日も1日どんどんみんなを褒めましょう🎉';
  console.log(reportText);
  return reportText;
}

exports.scheduledDailyReportFunc = functions.region('asia-northeast1')
  .pubsub
  .schedule('every day 10:30')
  .timeZone(timezone)
  .onRun(async (context) => {
    console.log('channel',channel);
    const reportText = await createInfoReport();
    await web.chat.postMessage({
      token: token,
      text: reportText,
      channel: channel
    });
    return null;
  });
