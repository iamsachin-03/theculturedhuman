# Sending the weekly question for people

The weekly question normally goes out from the family member's own phone: the app opens WhatsApp with the message ready. This sender can do it for them instead, from a WhatsApp Business number belonging to The Cultured Human, every morning their day comes round.

It only messages a person when:

- the family member switched on **Send it for me** for them in the app, which says that person has agreed to get the question from this number;
- today is their day, counted in India time;
- no question is waiting: after a send, nothing more goes out until the family member marks it answered or skipped.

The message asks the person to send their answer to the family member, not to this number.

| File | What it is |
| --- | --- |
| `backend/weekly/sender.mjs` | Chooses who is due, sends the template, marks them asked |
| `api/weekly-send.mjs` | The Vercel function the daily cron job calls |
| `vercel.json` → `crons` | Runs it at 04:30 UTC (10:00 in India) every day |
| `test/weekly-sender.test.mjs` | Checks the choosing, the message, dry runs, failures and the secret |

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
4. **Replies.** Some people will reply to the business number anyway. In WhatsApp Manager, set an away message such as "Thank you! Please send your answer to the person who asked you."
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
   | `WEEKLY_TIMEZONE` | Optional. Defaults to `Asia/Kolkata` |
   | `WEEKLY_DEFAULT_COUNTRY` | Optional. Added to 10-digit numbers. Defaults to `91` |

6. **Try it without sending.** Open `https://<your-site>/api/weekly-send?dry=1` with the header `Authorization: Bearer <CRON_SECRET>`, for example `curl -H "Authorization: Bearer $CRON_SECRET" "https://theculturedhuman.vercel.app/api/weekly-send?dry=1"`. It answers with how many people are due today; nothing is sent.
7. **Offer it in the app.** In `content/site.json`, set `"weeklyAuto": true` inside `backend`, then build and push. The **Send it for me** choice then appears on the weekly question for people with a WhatsApp number.

Vercel's logs for the function show each day's result: the day, how many were sent and any failures (for example a number without its country code).
