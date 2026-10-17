import Foundation
import SwiftData
import SwiftUI

struct Subtask: Codable, Hashable, Identifiable {
    var id: UUID = UUID()
    var title: String
    var done: Bool = false
}

struct RepeatRule: Codable, Hashable {
    enum Frequency: String, Codable, CaseIterable, Identifiable {
        case hourly, daily, weekdays, weekly, monthly, yearly

        var id: String { rawValue }

        var title: String {
            switch self {
            case .hourly: "Hourly"
            case .daily: "Daily"
            case .weekdays: "Weekdays"
            case .weekly: "Weekly"
            case .monthly: "Monthly"
            case .yearly: "Yearly"
            }
        }

        var unit: String {
            switch self {
            case .hourly: "hour"
            case .daily, .weekdays: "day"
            case .weekly: "week"
            case .monthly: "month"
            case .yearly: "year"
            }
        }
    }

    var frequency: Frequency
    var interval: Int = 1
    var until: Date? = nil
    /// Day of month a monthly repeat sticks to, so the 31st survives short months.
    var anchorDay: Int? = nil
}

enum Priority: Int, CaseIterable, Identifiable {
    case none = 0, low, medium, high

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .none: "None"
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        }
    }

    var marks: String { String(repeating: "!", count: rawValue) }

    var color: Color {
        switch self {
        case .none: .secondary
        case .low: .blue
        case .medium: .orange
        case .high: .red
        }
    }
}

@Model
final class ReminderList {
    var uuid: UUID = UUID()
    var name: String = ""
    var colorHex: String = "#2F5BEA"
    var order: Int = 0
    var createdAt: Date = Date()
    @Relationship(deleteRule: .nullify, inverse: \Reminder.list)
    var reminders: [Reminder]? = []

    init(name: String, colorHex: String, order: Int) {
        self.name = name
        self.colorHex = colorHex
        self.order = order
    }

    var color: Color { Color(hex: colorHex) }
}

@Model
final class Reminder {
    var uuid: UUID = UUID()
    var title: String = ""
    var notes: String = ""
    var due: Date? = nil
    var allDay: Bool = false
    var repeatRule: RepeatRule? = nil
    var earlyMinutes: Int = 0
    var priorityRaw: Int = 0
    var flagged: Bool = false
    var tags: [String] = []
    var subtasks: [Subtask] = []
    var url: String = ""
    var location: String = ""
    var estimateMinutes: Int = 0
    var isDone: Bool = false
    var doneAt: Date? = nil
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var deletedAt: Date? = nil
    var snoozedUntil: Date? = nil
    var history: [Date] = []
    var list: ReminderList? = nil

    init(title: String) {
        self.title = title
        self.earlyMinutes = AppSettings.defaultEarlyMinutes
    }

    var priority: Priority {
        get { Priority(rawValue: priorityRaw) ?? Priority.none }
        set { priorityRaw = newValue.rawValue }
    }

    /// The moment the reminder is due; all-day reminders use the alert hour from Settings.
    var effectiveDue: Date? {
        guard let due else { return nil }
        return allDay ? AppSettings.allDayDate(for: due) : due
    }

    var isActive: Bool { deletedAt == nil && !isDone }

    var isOverdue: Bool {
        guard isActive, let due else { return false }
        return allDay ? due < Calendar.current.startOfDay(for: .now) : due < .now
    }

    var isDueToday: Bool {
        guard isActive, let due else { return false }
        return due < Calendar.current.startOfTomorrow
    }

    var subtaskProgress: (done: Int, total: Int) {
        (subtasks.filter(\.done).count, subtasks.count)
    }
}

/// One completion, kept for statistics and streaks even after a reminder is deleted.
@Model
final class Completion {
    var at: Date = Date()
    var reminderID: UUID = UUID()
    var listName: String = ""

    init(at: Date, reminderID: UUID, listName: String) {
        self.at = at
        self.reminderID = reminderID
        self.listName = listName
    }
}

@Model
final class FocusSession {
    var start: Date = Date()
    var minutes: Int = 0
    var reminderID: UUID = UUID()

    init(start: Date, minutes: Int, reminderID: UUID) {
        self.start = start
        self.minutes = minutes
        self.reminderID = reminderID
    }
}

enum AppSettings {
    static var allDayHour: Int {
        UserDefaults.standard.object(forKey: "allDayHour") as? Int ?? 9
    }

    static var defaultEarlyMinutes: Int {
        UserDefaults.standard.integer(forKey: "defaultEarly")
    }

    static func allDayDate(for day: Date) -> Date {
        Calendar.current.date(bySettingHour: allDayHour, minute: 0, second: 0, of: day) ?? day
    }

    static let listColors = ["#2F5BEA", "#E0483E", "#E07A10", "#D4A106", "#1F9D55", "#0E9AA7", "#7B4FE0", "#D6408F", "#6B7280", "#8B5E34"]
}

extension Calendar {
    var startOfTomorrow: Date {
        date(byAdding: .day, value: 1, to: startOfDay(for: .now)) ?? .now
    }
}

extension Color {
    init(hex: String) {
        var value: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
