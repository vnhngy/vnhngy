import Foundation
import SwiftData
import UserNotifications

/// Schedules local notifications for reminders and handles the Done / Snooze actions on them.
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()

    private let center = UNUserNotificationCenter.current()
    private var container: ModelContainer?
    private let category = "REMINDER"
    static let focusID = "focus.end"
    /// iOS keeps at most 64 pending notifications per app; stay under it.
    private let pendingLimit = 60

    func configure(container: ModelContainer) {
        self.container = container
        center.delegate = self
        let actions = [
            UNNotificationAction(identifier: "DONE", title: "Mark Done", options: []),
            UNNotificationAction(identifier: "SNOOZE_10", title: "Snooze 10 Minutes", options: []),
            UNNotificationAction(identifier: "SNOOZE_60", title: "Snooze 1 Hour", options: []),
            UNNotificationAction(identifier: "SNOOZE_TOMORROW", title: "Tomorrow Morning", options: []),
        ]
        center.setNotificationCategories([
            UNNotificationCategory(identifier: category, actions: actions, intentIdentifiers: [], options: [])
        ])
    }

    @discardableResult
    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    private func ids(for r: Reminder) -> [String] {
        let base = r.uuid.uuidString
        return [base + ".due", base + ".early", base + ".snooze"]
    }

    func cancel(_ r: Reminder) {
        center.removePendingNotificationRequests(withIdentifiers: ids(for: r))
    }

    func schedule(_ r: Reminder) {
        cancel(r)
        for request in requests(for: r) { center.add(request) }
    }

    /// Replaces every pending reminder notification with the soonest ones, up to the system limit.
    @MainActor
    func rescheduleAll(_ reminders: [Reminder]) async {
        let pending = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0 != Self.focusID })
        let upcoming = reminders
            .flatMap { requests(for: $0) }
            .sorted { fireDate($0) < fireDate($1) }
            .prefix(pendingLimit)
        for request in upcoming { try? await center.add(request) }
    }

    private func fireDate(_ request: UNNotificationRequest) -> Date {
        (request.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate() ?? .distantFuture
    }

    private func requests(for r: Reminder) -> [UNNotificationRequest] {
        guard r.isActive, let due = r.effectiveDue else { return [] }
        let now = Date.now
        let base = r.uuid.uuidString
        if let snooze = r.snoozedUntil, snooze > now {
            return [request(id: base + ".snooze", reminder: r, body: "Snoozed reminder", at: snooze)]
        }
        var out: [UNNotificationRequest] = []
        if r.earlyMinutes > 0 {
            let t = due.addingTimeInterval(-Double(r.earlyMinutes) * 60)
            if t > now {
                out.append(request(id: base + ".early", reminder: r, body: "Coming up · " + Fmt.due(r), at: t))
            }
        }
        if due > now {
            out.append(request(id: base + ".due", reminder: r, body: r.notes.isEmpty ? Fmt.due(r) : r.notes, at: due))
        }
        return out
    }

    private func request(id: String, reminder r: Reminder, body: String, at date: Date) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = r.title.isEmpty ? "Reminder" : r.title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = category
        content.threadIdentifier = r.list?.name ?? "reminders"
        content.userInfo = ["rid": r.uuid.uuidString]
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return UNNotificationRequest(identifier: id, content: content,
                                     trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
    }

    func scheduleFocusEnd(at date: Date, title: String) {
        let content = UNMutableNotificationContent()
        content.title = "Focus session done"
        content.body = title
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
        center.add(UNNotificationRequest(identifier: Self.focusID, content: content, trigger: trigger))
    }

    func cancelFocusEnd() {
        center.removePendingNotificationRequests(withIdentifiers: [Self.focusID])
    }

    func setBadge(_ count: Int) {
        center.setBadgeCount(count)
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let raw = response.notification.request.content.userInfo["rid"] as? String,
              let rid = UUID(uuidString: raw) else { return }
        let action = response.actionIdentifier
        await MainActor.run { self.handle(action: action, reminderID: rid) }
    }

    @MainActor
    private func handle(action: String, reminderID rid: UUID) {
        guard let container else { return }
        let context = container.mainContext
        let descriptor = FetchDescriptor<Reminder>(predicate: #Predicate { $0.uuid == rid })
        guard let r = try? context.fetch(descriptor).first else { return }
        switch action {
        case "DONE":
            if !r.isDone { ReminderActions.toggleDone(r, context: context) }
        case "SNOOZE_10":
            ReminderActions.snooze(r, until: .now.addingTimeInterval(10 * 60))
        case "SNOOZE_60":
            ReminderActions.snooze(r, until: .now.addingTimeInterval(60 * 60))
        case "SNOOZE_TOMORROW":
            ReminderActions.snooze(r, until: ReminderActions.tomorrowMorning())
        default:
            break
        }
        try? context.save()
    }
}
