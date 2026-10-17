import Foundation
import SwiftData

@MainActor
enum ReminderActions {
    static func toggleDone(_ r: Reminder, context: ModelContext) {
        let now = Date.now
        if r.isDone {
            r.isDone = false
            r.doneAt = nil
        } else {
            context.insert(Completion(at: now, reminderID: r.uuid, listName: r.list?.name ?? ""))
            if let rule = r.repeatRule, let due = r.due {
                let cal = Calendar.current
                var next = rule.next(after: due)
                let startOfToday = cal.startOfDay(for: now)
                var guardCount = 0
                while next < startOfToday && guardCount < 1000 {
                    next = rule.next(after: next)
                    guardCount += 1
                }
                r.history.append(now)
                if r.history.count > 400 { r.history.removeFirst(r.history.count - 400) }
                let end = rule.until.flatMap { cal.date(bySettingHour: 23, minute: 59, second: 59, of: $0) }
                if let end, next > end {
                    r.isDone = true
                    r.doneAt = now
                } else {
                    r.due = next
                    r.subtasks = r.subtasks.map { var s = $0; s.done = false; return s }
                    r.snoozedUntil = nil
                }
            } else {
                r.isDone = true
                r.doneAt = now
            }
        }
        r.updatedAt = now
        NotificationManager.shared.schedule(r)
        refreshBadge(context)
    }

    static func snooze(_ r: Reminder, until date: Date) {
        r.snoozedUntil = date
        r.updatedAt = .now
        NotificationManager.shared.schedule(r)
    }

    static func delete(_ r: Reminder, context: ModelContext) {
        r.deletedAt = .now
        r.updatedAt = .now
        NotificationManager.shared.cancel(r)
        refreshBadge(context)
    }

    static func restore(_ r: Reminder, context: ModelContext) {
        r.deletedAt = nil
        r.updatedAt = .now
        NotificationManager.shared.schedule(r)
        refreshBadge(context)
    }

    static func purge(_ r: Reminder, context: ModelContext) {
        NotificationManager.shared.cancel(r)
        context.delete(r)
    }

    /// Moves a reminder to another day, keeping its time when it has one.
    static func reschedule(_ r: Reminder, toDay day: Date?) {
        let cal = Calendar.current
        if let day {
            if let due = r.due, !r.allDay {
                let t = cal.dateComponents([.hour, .minute], from: due)
                r.due = cal.date(bySettingHour: t.hour ?? 9, minute: t.minute ?? 0, second: 0, of: day)
            } else {
                r.due = cal.startOfDay(for: day)
                r.allDay = true
            }
        } else {
            r.due = nil
            r.allDay = false
        }
        r.snoozedUntil = nil
        r.updatedAt = .now
        NotificationManager.shared.schedule(r)
    }

    @discardableResult
    static func duplicate(_ r: Reminder, context: ModelContext) -> Reminder {
        let copy = Reminder(title: r.title + " (copy)")
        context.insert(copy)
        copy.notes = r.notes
        copy.due = r.due
        copy.allDay = r.allDay
        copy.repeatRule = r.repeatRule
        copy.earlyMinutes = r.earlyMinutes
        copy.priorityRaw = r.priorityRaw
        copy.flagged = r.flagged
        copy.tags = r.tags
        copy.subtasks = r.subtasks.map { Subtask(title: $0.title) }
        copy.url = r.url
        copy.location = r.location
        copy.estimateMinutes = r.estimateMinutes
        copy.list = r.list
        NotificationManager.shared.schedule(copy)
        return copy
    }

    static func refreshBadge(_ context: ModelContext) {
        let all = (try? context.fetch(FetchDescriptor<Reminder>())) ?? []
        NotificationManager.shared.setBadge(all.filter(\.isOverdue).count)
    }

    static func tomorrowMorning() -> Date {
        AppSettings.allDayDate(for: Calendar.current.startOfTomorrow)
    }

    static var snoozeChoices: [(title: String, date: Date)] {
        let now = Date.now
        var out: [(String, Date)] = [
            ("10 minutes", now.addingTimeInterval(600)),
            ("1 hour", now.addingTimeInterval(3600)),
            ("3 hours", now.addingTimeInterval(3 * 3600)),
        ]
        if Calendar.current.component(.hour, from: now) < 18,
           let evening = Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: now) {
            out.append(("This evening", evening))
        }
        out.append(("Tomorrow morning", tomorrowMorning()))
        return out
    }

    /// Creates the starter lists the first time the app runs.
    static func seedIfNeeded(context: ModelContext) {
        let count = (try? context.fetchCount(FetchDescriptor<ReminderList>())) ?? 0
        guard count == 0 else { return }
        for (i, pair) in [("Personal", "#2F5BEA"), ("Work", "#E07A10"), ("Errands", "#1F9D55")].enumerated() {
            context.insert(ReminderList(name: pair.0, colorHex: pair.1, order: i))
        }
        try? context.save()
    }

    /// Clears Recently Deleted entries older than 30 days.
    static func purgeOldTrash(context: ModelContext) {
        let cutoff = Date.now.addingTimeInterval(-30 * 86_400)
        let all = (try? context.fetch(FetchDescriptor<Reminder>())) ?? []
        for r in all where (r.deletedAt ?? .distantFuture) < cutoff {
            context.delete(r)
        }
    }
}
