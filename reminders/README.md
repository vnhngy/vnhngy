# Nudge Reminders

A full-featured reminder app in a single HTML page, styled in a Liquid Glass look: translucent, blurred panels over a slowly drifting colour field. No build step and no dependencies.

- **Use it online:** published as a private claude.ai artifact, with reminders synced to your account.
- **Use it offline:** open `index.html` in any browser. Reminders are saved in that browser.
- **iPhone and iPad:** a native SwiftUI app with real notifications and iOS 26 Liquid Glass, in [`ios/`](ios/README.md).
- **Mac, Windows and Linux:** a desktop app with a tray icon, a global quick-add shortcut and background alerts, in [`desktop/`](desktop/README.md).

`src/app.html` is the source. After editing it, run `node build.mjs` to regenerate `index.html`.

## Features

- **Natural-language quick add:** `Call dentist tomorrow 3pm !high #health`, `Gym every monday at 7am`,
  `Pick up kids in 2 hours`, `Pay rent every month on the 1st`, `Dentist 12/24 9am 1h before`.
  Recognises dates, times, relative times, repeats, priority (`!`–`!!!`), tags (`#tag`),
  lists (`@list`), flags (`*`) and early alerts (`15m before`). A live preview shows what it understood.
- **Smart lists:** Today, Scheduled, All, Flagged, Overdue and Completed, each with a live count.
  You can also make custom lists with colours, and browse by tag.
- **Reminder details:** notes, due date and time (or all day), early alert, repeat
  (hourly, daily, weekdays, weekly, monthly, yearly, every N, with an end date), priority, flag, tags,
  subtasks with progress, location, link, and a history of completed repeats.
- **Alerts:** an in-app alert card with a chime and a tab-title badge. You can mark it done or snooze it
  (10 min, 1 hour, tomorrow…). System notifications work where the browser allows them.
- **Repeats:** completing a repeating reminder moves it to the next date and resets its subtasks.
  Monthly repeats on the 31st handle short months.
- **Views:** a grouped list (by date, priority or list), a month calendar that also shows future repeats,
  and statistics (done today and this week, streaks, on-time rate, a 14-day chart, totals per list,
  and the hours you complete the most).
- **Organising:** sort by due date, priority, newest, title, or a manual order you set by dragging.
  Drag a reminder onto a list to move it. Select several reminders to complete, flag, reschedule,
  move or delete them together.
- **Undo** after completing, deleting or adding a reminder.
- **Keyboard shortcuts:** `n` new, `/` search, `j`/`k` move, `x` complete, `e` edit, `f` flag,
  `1`–`3` priority, `t`/`m` today or tomorrow, `s` snooze, `z` focus, `r` review overdue,
  `g t` / `g b` / `g r` go to Today, Board or Recently deleted, `?` for help.
- **Settings:** light, dark or system theme; six accent colours; first day of the week; the alert time
  for all-day reminders; 24-hour clock; sound; a default early alert.
- **Focus timer:** start a 5–90 minute timer on any reminder. It shows a countdown ring you can
  pause or extend by 5 minutes, and it survives a reload. Focused time counts toward the reminder and your stats.
- **Review overdue:** step through overdue reminders one at a time and move each one to today,
  tomorrow, the weekend or next week, mark it done, delete it, or skip it.
- **Board view:** columns for Overdue, Today, Tomorrow, Next 7 days, Later and Someday.
  Drag a card to another column to reschedule it; reminders with a time keep their time.
- **Up next:** a card on Today that shows your next timed reminder with a countdown, how much is left today
  with its estimated time, and a button to review anything overdue.
- **Templates:** start reminders from reusable checklists (four built in, such as trip packing and weekly review),
  or save any reminder as a template.
- **Recently deleted:** deleted reminders stay for 30 days and can be restored one at a time or all at once.
- **Search filters:** `is:overdue`, `#tag`, `list:work`, `p:high`, `due:week`, `has:notes`, and `-` in front to exclude.
  Search covers every list.
- **Habit streaks:** repeating reminders show their current streak, with a 14-day grid in the details panel
  and a streaks panel in Statistics.
- **Time estimates:** set one in details, or type `~30m` or `~1.5h` when adding.
- **Suggest steps:** on the online version, Claude can break a reminder into checklist steps.
- **Your data:** export a JSON backup, import it again, export to `.ics` for any calendar app
  (with repeat rules and alarms), or delete everything.
