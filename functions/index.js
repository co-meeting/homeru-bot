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
            "text": "褒める相手",
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
              "text": "褒めたり、感謝を伝えたりしましょう！",
              "emoji": true
            }
          },
          "label": {
            "type": "plain_text",
            "text": "メッセージ",
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
      console.error(err.stack);
    }
    return;
  }
}

// 月初に設定されたチャンネルにメッセージを投稿
exports.scheduledFunction = functions.region('asia-northeast1').pubsub.schedule('1 of month 09:00')
  .timeZone(timezone)
  .onRun(sendMonthlyReport);

async function openPostedList(payload) {
  try {
    const openedModalResponse = await web.views.open({
      token,
      trigger_id: payload.trigger_id,
      view: {
        "type": "modal",
        "close": {
          "type": "plain_text",
          "text": "閉じる",
          "emoji": true
        },
        "title": {
          "type": "plain_text",
          "text": "褒めボット",
          "emoji": true
        },
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "褒めコメントを取得しています...\nなかなか切り替わらない場合は開き直してください"
            }
          }
        ]
      }
    });
    await web.views.update({
      view_id: openedModalResponse.view.id,
      view: await getPostedListView(payload)
    }).catch(async (err) => await web.views.update({
      view_id: openedModalResponse.view.id,
      view: getErrorView(err)
    }));
  } catch (err) {
    await web.views.open({
      token,
      trigger_id: payload.trigger_id,
      view: getErrorView(err)
    })
  }
}

function getErrorView(err) {
  return {
    "type": "modal",
    "close": {
      "type": "plain_text",
      "text": "閉じる",
      "emoji": true
    },
    "title": {
      "type": "plain_text",
      "text": "褒めボット",
      "emoji": true
    },
    "blocks": [{
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*エラーが発生しました。* " + (typeof err === 'string' && err) || err.message || ''
      }
    }]
  }
}

async function getPostedListView(payload) {
  const praises = (
    await db.collection('praises')
      .orderBy('isNotified', 'asc')
      .orderBy('postedAt', 'desc')
      .where('from', '==', payload.user.id)
      .where('isNotified', '!=', true)
      .get()
  ).docs;
  return {
    "type": "modal",
    "close": {
      "type": "plain_text",
      "text": "閉じる",
      "emoji": true
    },
    "title": {
      "type": "plain_text",
      "text": "褒めボット",
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
        const homeComment = `
            *${data.postedAt.toDate().toLocaleDateString(dateFormatConfig.locale, dateFormatConfig.formatOptions)} @${data.toName}*\n${data.message}
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
const sendDailyReport = async (context) => {
  try {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const yesterday = new Date(now.setDate(now.getDate() - 1));
    const thisMonth = new Date(now.setDate(1));
    const nextMonth = new Date(now.setMonth(now.getMonth() + 1 ));
    const yesterdayStartAt = admin.firestore.Timestamp.fromDate(yesterday);
    const yesterdayEndAt = admin.firestore.Timestamp.fromDate(today);
    const thisMonthStartAt = admin.firestore.Timestamp.fromDate(thisMonth);
    const thisMonthEndAt = admin.firestore.Timestamp.fromDate(nextMonth);
    const yesterdayQuerySnapshot = (await admin.firestore().collection('praises')
      .orderBy('postedAt').startAt(yesterdayStartAt).endBefore(yesterdayEndAt).get());
    const thisMonthQuerySnapshot = (await admin.firestore().collection('praises')
      .orderBy('postedAt').startAt(thisMonthStartAt).endBefore(thisMonthEndAt).get());
    const yesterdayCount = yesterdayQuerySnapshot.docs.length;
    const thisMonthCount = thisMonthQuerySnapshot.docs.length;
    // TODO:レポート本文の内容は、使ってみて、良い文面が思いついたら見直す
    let reportText = '今日の褒め状況レポートです。\n\n';
    if ( yesterdayCount > 0 ) {
      reportText += '昨日は *' + yesterdayCount + '回* 褒めています。\n';
    }
    reportText += '今月は *' + thisMonthCount + '回* 褒めています。\n\n';
    reportText += '今日も1日どんどんみんなを褒めましょう🎉';

    await web.chat.postMessage({
      token: token,
      text: reportText,
      channel: channel
    });
  } catch (error) {
    console.error(error);
  }
}

exports.scheduledDailyReportFunc = functions.region('asia-northeast1')
  .pubsub
  .schedule('every day 10:30')
  .timeZone(timezone)
  .onRun(sendDailyReport);
