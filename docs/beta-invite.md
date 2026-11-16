# Beta invite

A message to send to the first few testers, and what to ask them. Edit freely.

## The message

> I've been building a calorie and macro tracker called **Leanward**, and I'd like you to try it for a couple of weeks.
>
> It tracks food, weight and waist, and it follows a goal phase (cut, recomp, lean bulk or maintenance) and tells you in plain words whether the phase is working. It's free, has no ads, and your data is yours: you can export or delete it any time.
>
> **Set it up (2 minutes, iPhone):**
> 1. Open **https://leanward.github.io/** in **Safari**.
> 2. Tap the **Share** button, then **Add to Home Screen**. Open it from the new icon from now on.
> 3. Tap **Continue with Google** and answer the setup questions.
>
> **What to try:**
> - Log what you eat for a few days: search, scan a barcode, or quick add.
> - Weigh in most mornings (Progress → Log weight).
> - After a few days, look at Home and the Phase tab.
>
> **Please tell me:**
> - Anything confusing, slow or wrong, with a screenshot if you can.
> - Foods you couldn't find.
> - Whether you'd keep using it, and what's missing if not.
>
> It's an early version, so expect rough edges. It isn't medical advice: the targets are estimates, shown with how they're worked out.

## Notes for the owner
- **Who:** 3 to 5 people at first, ideally a mix: someone cutting, someone who just wants to eat better, someone who doesn't lift.
- **Android or desktop:** it works in Chrome, but only iPhone Safari has been tested.
- **Feedback channel:** a group chat or a shared note is enough for this size.
- **Watch:** Supabase → Table Editor → `lw_metrics` (who's active, who came back after a week) and `lw_errors` (bugs the app reported on its own).
- **Before sending:** read `terms.html` and `privacy.html` once more; they're plain-language drafts.
- **If someone wants out:** Profile → Account → Delete my account removes everything.
