# Slackアプリ「褒めボット」

「褒めボット」はいわゆる褒め会をSlack上で行うツールです。  
各ユーザは好きなときにSlackのショートカットから他のユーザを褒めます。  
すると、毎月1日に各ユーザ宛にみんなからの褒めレポートが届きます。  

## インストール手順

### Slackアプリの設定手順

#### 1. [Slack API: Applications](https://api.slack.com/apps) を開き、アプリを新規作成( `Create New App` )
```
例）
App Name:褒めボット
Development Slack Workspace: アプリをインストールしたい組織を選択
```

#### 2. Basic Information を開き、 `Display Information` の内容を変更
```
例）
App Name: 褒めボット
Short description: 褒めボット
App icon & Preview: 任意のアイコン
Background color: 任意のカラー
```

#### 3. Interactivity & Shortcuts を開き、`Interactivity` を ON に変更
その後、以下の設定を行い `Save Changes`する
   - `Request URL` は後ほど正式に入力するとして、適当に`https://localhost` と入力する
   - `Create New Shortcut` ボタンをクリックして、ショートカットを作成する

```
Where should this shortcut appear? :Global
Name: 褒める（homeru）
Short Description: 褒める
Callback ID: homeru
```

```
Where should this shortcut appear? :Global
Name: 褒めコメント一覧（homeru-list）
Short Description: 褒めコメント一覧
Callback ID: show_posted
```

#### 4. OAuth & Permissions を開き、以下Scopesを追加
 - `chat:write`
 - `users:read`
 - `channels:read`

 
#### 5. App Home を開き、Your App’s Presence in Slackを入力
```
例）
Display Name:褒めボット
Default username: homeru_bot
```

#### 6. Install App を開き、 `Install to Workspace` ボタンをクリックして組織にへインストール

一度、インストールすると、それ以後、APIの各設定を変更状況に応じて、Reinstall を求められるため、メッセージに応じて`Reinstall App` ボタンをクリッックして、再インストールする


#### 7. SlackのチャンネルにAppを追加
 1. 任意のチャンネルを開き、[詳細]を開く
 2. [その他]を選択し、[アプリを追加する]を選択する
 3. リストから[褒めボット]を探して、[追加]ボタンをクリックして追加する

### Firebaseにデプロイ

#### 事前準備

 1. nodeのバージョン14をインストールする。
 2. [Firebase console](https://console.firebase.google.com/?hl=ja)にログインする。
 3. consoleで新しいFirebaseのプロジェクトを作成する。プロジェクト名は `homeru-bot` に設定する。
 4. 作成したFirebaseプロジェクトをBlaze（従量課金）にアップグレードする。
 5. [Firebase CLI](https://firebase.google.com/docs/functions/get-started?authuser=0)をローカルにインストールする。

※別のプロジェクト名を使用する場合は、 `.firebaserc` の内容を書き換えてください。

#### 1.プロジェクトでfirebaseにログイン
```
firebase login
```

#### 2.アクセストークンを登録する

```
firebase functions:config:set slack.channel=<投稿先のチャンネルID>
firebase functions:config:set slack.token=<ボットのアクセストークン>
```

 - <投稿先のチャンネルID> : 「今日のひとこと」を投稿するチャンネルID。Slackの投稿をブラウザで開くとURLから確認できます。
 - <ボットのアクセストークン> : Slackアプリ設定ページの `Install App` > `Bot User OAuth Token`

#### 3.デプロイする
```
npm run deploy
```

#### 4. Slackアプリ設定の `Request URL`へ設定

FirebaseプロジェクトコンソールでFunctionsを開き、デプロイされた関数のURLを確認する。  
`https://asia-northeast1-<プロジェクト名>.cloudfunctions.net/shortcut` のようなURLになる。  
Slackアプリ設定ページの「Interactivity & Shortcuts」を開き、`Request URL` へそのURLを設定する。

### 以上で、Slackのショートカットから投稿できるようになります。

## ローカル開発手順

### 事前準備
 - [ngrok](https://ngrok.com/)コマンドをローカルから実行できるようにインストールする。
 - [Firebase CLI](https://firebase.google.com/docs/functions/get-started?authuser=0)をローカルにインストールする。

### 1.runtimeconfig.jsonファイルを生成

```
cp functions/.runtimeconfig.json.example functions/.runtimeconfig.json
```

`functions/.runtimeconfig.json` を適切に設定する
 - "channel" : 褒めレポートを投稿するチャンネルID
 - "token" : Slackアプリ設定ページの `Install App` > `Bot User OAuth Token`

### 2.npm パッケージのインストール
```
npm --prefix functions install
```

### 3.Firebaseエミュレータの実行

```
firebase emulators:start
```

Emulator UIのURLがターミナルに出力されます。Firestoreの内容はEmulator UIから確認できます。

### 4.ngrokを利用しローカルサーバーを外部公開
```
ngrok http 5001
```
上記を実行すると以下のようなメッセージがターミナルに出力される
```
ngrok by @inconshreveable                                                           (Ctrl+C to quit)
                                                                                                    
Session Status                online                                                                
Session Expires               6 hours, 19 minutes                                                   
Version                       2.3.35                                                                
Region                        United States (us)                                                    
Web Interface                 http://127.0.0.1:4040                                                 
Forwarding                    http://xxxxxxxxxxxxxx.ngrok.io -> http://localhost:5001                 
Forwarding                    https://xxxxxxxxxxxxxx.ngrok.io -> http://localhost:5001                
                                                                                                    
Connections                   ttl     opn     rt1     rt5     p50     p90                           
                              16      0       0.00    0.00    1.59    60.92                         
```

### 5.外部公開URLをSlackアプリ設定の `Request URL`へ設定

Slackアプリ設定の「Interactivity & Shortcuts」を開き、`Request URL` へ以下の値を設定

```
<ngrokのHTTPSのURL>/homeru-bot/us-central1/shortcut
```

例えば、上記のコマンド出力の場合は以下の値になります。
```
https://xxxxxxxxxxxxxx.ngrok.io/homeru-bot/us-central1/shortcut
```
    
### 以上で、ローカルでSlackアプリを動かすことができます。
