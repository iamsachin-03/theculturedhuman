# Sending the weekly question for people

The weekly question normally goes out from the family member's own phone: the app opens WhatsApp with the message ready. This sender can do it for them instead, from a WhatsApp Business number belonging to The Cultured Human, every morning their day comes round.

It only messages a person when:

- the family member switched on **Send it for me** for them in the app, which says that person has agreed to get the question from this number;
- today is their day, counted in India time;
- no question is waiting: after a send, nothing more goes out until the family member marks it answered or skipped.

The message asks the person to send their answer to the family member, not to this number.

| File | What it is |
| --- | --- |
| `backend/weekly/sender.py` | Chooses who is due, sends the template, marks them asked |
| `backend/weekly/questions.json` | The questions, copied from `public/scripts/app-core.js` by `npm run build` |
| `api/weekly-send.py` | The Vercel function (Python) the daily cron job calls |
| `vercel.json` → `crons` | Runs it at 04:30 UTC (10:00 in India) every day |
| `test/test_weekly_sender.py` | Checks the choosing, the message, dry runs, failures and the secret |

Until the steps below are done, the function refuses to run (no `CRON_SECRET`) or only reports what it would send (no WhatsApp details). Nothing is sent by accident.

## Setting it up

1. **Database.** Run the current `backend/schema.sql`, which has the `auto_send` column on `weekly_elders`.
2. **A WhatsApp Business number.** In [Meta for Developers](https://developers.facebook.com/), create an app with the WhatsApp product and add a phone number that is not used on a phone with WhatsApp. Note the **phone number ID** and create a **permanent access token** for a system user with `whatsapp_business_messaging`.
3. **The message template.** In WhatsApp Manager, create a template named `weekly_question`, language English, with this body (the three numbered parts are filled in for each person):

   ```
   {{1}}, this week's question from {{2}}:

   {{3}}

   Send your answer to {{2}} whenever you like, as a voice note in whichever language feels right. This number only sends the questions.
   ```

   Sample values for the review: `Nani`, `Asha`, `Which story did you love to hear as a child, and who told it?`. Meta reviews it and chooses its category, which sets the price of each message; see Meta's current WhatsApp pricing.

   For people asked in Hindi, add a second language to the same template, Hindi, with this body (the parts are filled in the same way, and the question is sent in Hindi):

   ```
   {{1}}, {{2}} की ओर से इस हफ़्ते का सवाल:

   {{3}}

   जब मन करे, अपना जवाब {{2}} को वॉइस नोट में भेजिए, जिस भी भाषा में आप सहज हों। यह नंबर सिर्फ़ सवाल भेजता है।
   ```
4. **Replies.** Until answers are kept (the next section), some people will reply to the business number anyway. In WhatsApp Manager, set an away message such as "Thank you! Please send your answer to the person who asked you."
5. **Vercel environment variables** (Project → Settings → Environment Variables, Production):

   | Name | Value |
   | --- | --- |
   | `CRON_SECRET` | A long random string. Vercel sends it with each cron call. |
   | `SUPABASE_URL` | The project URL, as in `content/site.json` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key. Server only; never put it in the site. |
   | `WHATSAPP_TOKEN` | The permanent access token |
   | `WHATSAPP_PHONE_NUMBER_ID` | The phone number ID |
   | `WHATSAPP_TEMPLATE` | Optional. Defaults to `weekly_question` |
   | `WHATSAPP_TEMPLATE_LANG` | Optional. Defaults to `en` |
   | `WHATSAPP_TEMPLATE_LANG_HI` | Optional. The template language used for people asked in Hindi. Defaults to `hi` |
   | `WEEKLY_TIMEZONE` | Optional. Defaults to `Asia/Kolkata` |
   | `WEEKLY_DEFAULT_COUNTRY` | Optional. Added to 10-digit numbers. Defaults to `91` |

6. **Try it without sending.** Open `https://<your-site>/api/weekly-send?dry=1` with the header `Authorization: Bearer <CRON_SECRET>`, for example `curl -H "Authorization: Bearer $CRON_SECRET" "https://theculturedhuman.vercel.app/api/weekly-send?dry=1"`. It answers with how many people are due today; nothing is sent.
7. **Offer it in the app.** In `content/site.json`, set `"weeklyAuto": true` inside `backend`, then build and push. The **Send it for me** choice then appears on the weekly question for people with a WhatsApp number.

Vercel's logs for the function show each day's result: the day, how many were sent and any failures (for example a number without its country code).

## Keeping the answers people send back

Once this is set up, the person can reply to the question with a voice note (or a photo, video or message) and it goes straight into the family member's archive. `api/whatsapp-webhook.py` and `backend/whatsapp/replies.py` do it:

- Only messages from the number of someone with **Send it for me** switched on are kept; anything else is ignored. If two people share a number, the one asked most recently is taken to be answering.
- The first message after a question becomes an entry under that question, told by that person and kept as **Only me**. Anything else they send within twelve hours joins the same entry: more voice notes, a photo, a few words.
- The question then counts as answered, so the next one goes out on their next day.
- They get a short thank-you in their language, and the family member gets an email with a link (when `RESEND_API_KEY` and `EMAIL_FROM` are set, as for the notifier).
- Each message is kept once, even when Meta sends it twice. Files over 50 MB are not downloaded; the entry says one arrived.

1. **Database.** Run the current `backend/schema.sql`, which has the `whatsapp_messages` table.
2. **The webhook.** In the Meta app, open WhatsApp → Configuration → Webhook. Set the callback URL to `https://<your-site>/api/whatsapp-webhook` and the verify token to a long random string, then subscribe to the **messages** field. Note the app secret (App settings → Basic).
3. **Vercel environment variables**, as well as the ones above:

   | Name | Value |
   | --- | --- |
   | `WHATSAPP_VERIFY_TOKEN` | The verify token from step 2 |
   | `WHATSAPP_APP_SECRET` | The app secret. Every message is checked against it; without it the webhook refuses everything. |

4. **A template that asks for the reply here.** Create a template named `weekly_question_reply` (English, and Hindi for people asked in Hindi) and set `WHATSAPP_TEMPLATE=weekly_question_reply`:

   ```
   {{1}}, this week's question from {{2}}:

   {{3}}

   Reply here with a voice note whenever you like, in whichever language feels right. It goes straight to {{2}}'s family archive, seen only by the family.
   ```

   ```
   {{1}}, {{2}} की ओर से इस हफ़्ते का सवाल:

   {{3}}

   जब मन करे, यहीं वॉइस नोट में जवाब दीजिए, जिस भी भाषा में आप सहज हों। यह सीधे {{2}} के पारिवारिक संग्रह में जाता है, जिसे सिर्फ़ परिवार देखता है।
   ```

   Remove the away message from step 4 above.
5. **Tell the app.** In `content/site.json`, set `"whatsappReplies": true` inside `backend`, then build and push. The weekly question then tells the family member that answers arrive by themselves.

The thank-you is a reply inside a conversation the person started, which Meta's current pricing does not charge for; check its pricing page.

