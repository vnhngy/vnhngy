import Foundation
import Observation
import SwiftData

/// A single focus session at a time. A notification fires at the end even if the app is in the background.
@Observable
@MainActor
final class FocusTimer {
    private(set) var reminderID: UUID?
    private(set) var title = ""
    private(set) var minutes = 25
    private(set) var endsAt: Date?
    private(set) var pausedRemaining: TimeInterval?
    private(set) var startedAt: Date?
    /// Set when a session ends, so the UI can say what was logged.
    var lastResult: String?

    @ObservationIgnored private let container: ModelContainer
    @ObservationIgnored private var ticker: Task<Void, Never>?

    init(container: ModelContainer) {
        self.container = container
    }

    var isActive: Bool { endsAt != nil || pausedRemaining != nil }
    var isPaused: Bool { pausedRemaining != nil }

    func remaining(at now: Date = .now) -> TimeInterval {
        if let pausedRemaining { return pausedRemaining }
        guard let endsAt else { return 0 }
        return max(0, endsAt.timeIntervalSince(now))
    }

    func progress(at now: Date = .now) -> Double {
        let total = Double(minutes * 60)
        return total > 0 ? min(1, max(0, 1 - remaining(at: now) / total)) : 0
    }

    func start(_ reminder: Reminder, minutes: Int) {
        if isActive { finish(completed: false) }
        reminderID = reminder.uuid
        title = reminder.title
        self.minutes = minutes
        startedAt = .now
        pausedRemaining = nil
        let end = Date.now.addingTimeInterval(Double(minutes * 60))
        endsAt = end
        UserDefaults.standard.set(minutes, forKey: "focusMinutes")
        NotificationManager.shared.scheduleFocusEnd(at: end, title: title)
        startTicker()
    }

    func togglePause() {
        if let paused = pausedRemaining {
            let end = Date.now.addingTimeInterval(paused)
            endsAt = end
            pausedRemaining = nil
            NotificationManager.shared.scheduleFocusEnd(at: end, title: title)
            startTicker()
        } else if let endsAt {
            pausedRemaining = max(0, endsAt.timeIntervalSinceNow)
            self.endsAt = nil
            NotificationManager.shared.cancelFocusEnd()
            ticker?.cancel()
        }
    }

    func addFive() {
        minutes += 5
        if let paused = pausedRemaining {
            pausedRemaining = paused + 300
        } else if let end = endsAt {
            let newEnd = end.addingTimeInterval(300)
            endsAt = newEnd
            NotificationManager.shared.scheduleFocusEnd(at: newEnd, title: title)
        }
    }

    func stop() {
        finish(completed: false)
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self else { return }
                if self.endsAt != nil && self.remaining() <= 0 {
                    self.finish(completed: true)
                    return
                }
            }
        }
    }

    private func finish(completed: Bool) {
        guard let rid = reminderID else { return }
        let used = completed ? minutes : Int(((Double(minutes * 60) - remaining()) / 60).rounded())
        if used >= 1 {
            let context = container.mainContext
            context.insert(FocusSession(start: startedAt ?? .now, minutes: used, reminderID: rid))
            try? context.save()
            lastResult = completed ? "Focus done: \(Fmt.minutes(used)) on “\(title)”" : "Logged \(Fmt.minutes(used)) of focus"
        }
        if !completed { NotificationManager.shared.cancelFocusEnd() }
        ticker?.cancel()
        ticker = nil
        reminderID = nil
        title = ""
        endsAt = nil
        pausedRemaining = nil
        startedAt = nil
    }
}
