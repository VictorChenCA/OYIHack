Source: https://gbrain.io/cli



 Install GBrain once, and the accounts become commands

 Gmail, the calendar and a web search, each one a line you type.
 Anything else you connect works the same way.

 Read and write Gmail
 from the command line

 Eight steps, start to finish: sign in, connect the account,
 read what came in, get refused, allow it, then file the
 message and draft a reply.

 Sign in

 Connect Gmail

 See what came in

 Try to file one

 Turn it on

 File it

 Clear it out

 Draft a reply

 brad@macbook · gbrainio

```
$ gbrainio loginOpening your browser to connect this terminal.Or open this link in any browser: https://gbrain.io/workspace/terminals/connect/SFMyNTY.g2gDbQAAABh0ZXJtWaiting for approval… (Ctrl+C to cancel)SIGNED IN Brad's MacBook (org 1) No services in this permission yet. Connect one with: auth grant <service>$ gbrainio auth grant gmailOpening https://gbrain.io/workspace/account/connections/google …Finish in the browser, then the gmail tools can read it.$ gbrainio tool gmail search --unread --newer-than 2daccount: brad@gbrain.iopreview_is: Gmail's first ~200 characters of each message, not the whole message. read_whole_message reads one; read_whole_conversation reads its thread.query: newer_than:2d is:unread1. Your invoice from Rocketship, LLC account: brad@gbrain.io date: Thu, 27 Aug 2026 09:12:04 -0700 from: Stripe <receipts@stripe.com> id: 198f2c1a9b7e4d02 preview: Invoice A41C-0092 for $240.00 was paid automatically. received_at: 2026-08-27T16:12:04.000Z thread_id: 198f2c1a9b7e4d02 to: brad@gbrain.io2. Your August payouts are on the way account: brad@gbrain.io date: Wed, 26 Aug 2026 06:02:11 -0700 from: Stripe <notifications@stripe.com> id: 198dbb40c7a1f88e preview: $4,182.55 will arrive in your account ending 4021 on Tuesday. received_at: 2026-08-26T13:02:11.000Z thread_id: 198dbb40c7a1f88e to: brad@gbrain.io3. Tuesday account: brad@gbrain.io date: Wed, 26 Aug 2026 14:20:41 -0700 from: Jenny Okafor <jenny@example.com> id: 198f4a7c02b31d55 preview: Can we push Tuesday's review to noon? I have the planning... received_at: 2026-08-26T21:20:41.000Z thread_id: 198f4a7c02b31d55 to: brad@gbrain.ioNEXT gbrainio tool gmail read-thread <thread_id> -a <account> read whole conversation gbrainio tool gmail read-message <id> -a <account> read whole message$ gbrainio tool gmail label 198f2c1a9b7e4d02 --name Receipts --createERROR Not granted File a message is not enabled for this client.FIX This client can only use what you granted it. Run gbrainio permission to open the page where you turn on File a message, then run gmail label again.$ gbrainio permissionTurn tools on for this terminal here: https://gbrain.io/users/7/clients/42/permissionsOpening it in your browser. Grant what you need, then run your command again.$ gbrainio tool gmail label 198f2c1a9b7e4d02 --name Receipts --createid: 198f2c1a9b7e4d02label: Receiptslabelled: trueremoved: false$ gbrainio tool gmail move 198f2c1a9b7e4d02 --to archiveid: 198f2c1a9b7e4d02moved: archive$ gbrainio tool gmail draft --reply-to 198f4a7c02b31d55 --body "Noon works."drafted: trueid: r-8830219940512subject: Re: Tuesdaythread_id: 198f4a7c02b31d55to: jenny@example.com$ 
```

 A link to approve in a browser, with no token to copy back. The command returns signed in and reaching nothing, until you connect an account.

 Google's own consent screen, once. The account credential stays on GBrain's servers and never reaches the laptop.

 Three unread messages as plain text: who sent it, when, and a preview of it, each with the account it came from. The answer says the preview is not the whole message, and ends with the commands that read one whole.

 Reading was allowed. Changing the mailbox was not, so the command stops. The refusal names what is missing and what to run to fix it.

 The command prints a link and opens it, and does nothing else. No typed command can widen its own access. Only a signed-in person can.

 The same command as before, allowed this time. The message comes back carrying its new Receipts label.

 Out of the inbox, still in the mailbox. Nothing here deletes mail. The furthest anything goes is the trash, which Gmail keeps for 30 days.

 The reply lands in Drafts, on the right conversation, and stays there. Sending it is a separate permission.

 Check the calendar
 from the command line

 The calendar is set to Read: GBrain can tell you what the day looks like and cannot move anything.

 brad@macbook · gbrainio

```
$ gbrainio tool gcal list-events --limit 31. Standup 09:302. Review with Jenny 12:003. Planning Commission hearing 13:00
```

 The next three things on the day, times and titles only. Nothing here can move a meeting or add one.

 Search the live web
 from the command line

 The same terminal and the same permissions, pointed at the open web instead of one of the accounts.

 brad@macbook · gbrainio

```
$ gbrainio tool exa search "SF planning"1. Planning Commission · Agendas https://sfplanning.org/hearings2. Supervisors · Land Use Committee https://sfbos.org/land-use-committee
```

 Two results off the live web, each a title and a link. Like every other command, it lands on the activity list.

 Everything else you can connect, one command each

 Mail was the long example. Each of these reads the same way,
 and each obeys the permission you just set.

 Gmail

 Search, read, file and draft mail from a terminal or an assistant.

 Google Calendar

 List, add, change and cancel events without leaving the terminal.

 Google Drive

 Find a document, read it, change it, and get it back as a PDF.

 Web search

 Search the live web and get back text, not a page of links.

 Page fetching

 Turn a URL into readable text, including pages that need a browser.

 Company research

 Not yet

 Company bios and investor searches, from the terminal or any assistant.

 Connect an AI without handing over a password

 One setup reaches all of them: the terminal, Claude Code, Cursor, and anything else you connect. The password is copied into none of them.

 See every AI that is connected, and what it reaches

 One page lists them all. Nothing is copied into any of them,
 so switching one off here switches it off everywhere.

 Brad's MacBook

 On

 you@yourteam.com

 Oct 25, 2026

 Claude Code

 On

 you@yourteam.com

 Oct 18, 2026

 Cursor

 Not set up

 Nothing yet

 Oct 27, 2026

 Studio Mac Mini

 Off

 you@yourteam.com

 Sep 29, 2026

 Four connections on one account, with the address each one reaches and when its access runs out. Cursor has not been set up yet, so it reaches nothing, and the Mac Mini is switched off.

 Choose what each one may do, account by account

 The password never leaves GBrain's servers. What you set here is how far each AI may go.

 you@yourteam.com

 Google

 Remove

Gmail

 Off

 Read

 Draft

 Manage

 Full

Calendar

 Off

 Read

 Full

Drive

 this account has not granted it

 Needs access · Grant

 W

 Web search

 Remove

Search the web

 Off

 On

 Two accounts on one AI's permission. Gmail is set to Manage, so it can file mail as well as read it, while the calendar stops at Read. Drive is the third thing a row can say: this Google account was connected without it, so it offers a Grant rather than a level. Web search has its own card, since it belongs to no account.

 Set how long access lasts,
 and see everything the AI did

 Access ends on the date you pick, whether or not you remember
 it. Until then, every call an AI makes is on one list.

Name this connection and choose how long it stays.

 Name

 So you can tell it apart later, and know what to revoke.

 Expires

 It logs itself out after this, so nothing stays signed in forever.
 You can give it more time later.

 1 day

 Expires Sep 28, 2026

 7 days

 Expires Oct 4, 2026

 30 days

 Expires Oct 27, 2026

 1 year

 Expires Sep 27, 2027

 Create client

 The screen you get when you connect something new. You name it and pick how long it may stay connected, before it has reached anything at all.

 Give it a day, or a year

 Or a week, or a month. Access ends on its own, so a short-lived one never needs undoing.

 See what it actually did

 Every call is on one list: which AI made it, what it touched,
 what it cost. Including the ones that were refused.

 An AI cannot run up a bill

 Each one has a daily limit on how many calls it can make.
 When it is reached the calls stop, and only a person can
 raise it.

 Worked:
 Search

 "SF planning commission agenda"

 1m ago

 Worked:
 Write a draft

 "jenny@example.com"

 2m ago

 Worked:
 Move a message

 "archive"

 3m ago

 Worked:
 File a message

 "Receipts"

 4m ago

 Worked:
 Describe this connection

 5m ago

 Denied:
 File a message

 "Receipts"

 6m ago

 Worked:
 Search

 "newer_than:2d is:unread"

 8m ago

 Application

 Action

 Cost

 When

 Exa

 Worked:
 Search

 "SF planning commission agenda"

 $0.03

 1m ago

 Gmail

 Worked:
 Write a draft

 "jenny@example.com"

 2m ago

 Gmail

 Worked:
 Move a message

 "archive"

 3m ago

 Gmail

 Worked:
 File a message

 "Receipts"

 4m ago

 G

 GBrain

 Worked:
 Describe this connection

 5m ago

 Gmail

 Denied:
 File a message

 "Receipts"

 6m ago

 Gmail

 Worked:
 Search

 "newer_than:2d is:unread"

 8m ago

Tool calls

 118 of 500 today

 118 of 500

 118/500

 One afternoon of activity: every call, which connection made it, what it touched. The refused one sits among the ones that worked and says why it stopped. Underneath, today's calls against the daily limit.

 Also in Tools

 MCP

the same tools inside Claude Code, Cursor or Codex

 Install

GBrain on the dock or home screen

 All of Tools

 connect an account once, and every AI you use reaches it

 Connect Gmail in about two minutes

 Install GBrain, sign in, and choose what each AI may reach. You can
 turn any of it off whenever you want.

 Sign in

 Read the full reference

 