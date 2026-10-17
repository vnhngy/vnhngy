import SwiftData
import SwiftUI

/// The soft colour field the glass panels float over.
struct GlassBackdrop: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let light: [Color] = [
            Color(hex: "#C7D4FF"), Color(hex: "#E6DDFF"), Color(hex: "#FFD3EA"),
            Color(hex: "#D3E2FF"), Color(hex: "#F3F0FF"), Color(hex: "#FFE1CF"),
            Color(hex: "#C4F0E8"), Color(hex: "#DCF3FF"), Color(hex: "#FFE8C4"),
        ]
        let dark: [Color] = [
            Color(hex: "#1B2560"), Color(hex: "#160F2E"), Color(hex: "#4A1238"),
            Color(hex: "#0C1330"), Color(hex: "#07090F"), Color(hex: "#3A2408"),
            Color(hex: "#063B35"), Color(hex: "#0A1424"), Color(hex: "#2A1A06"),
        ]
        MeshGradient(
            width: 3, height: 3,
            points: [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.55, 0.45], [1, 0.5], [0, 1], [0.5, 1], [1, 1]],
            colors: scheme == .dark ? dark : light
        )
        .ignoresSafeArea()
    }
}

enum Sorts {
    static func due(_ a: Reminder, _ b: Reminder) -> Bool {
        let x = a.effectiveDue ?? .distantFuture
        let y = b.effectiveDue ?? .distantFuture
        if x != y { return x < y }
        if a.priorityRaw != b.priorityRaw { return a.priorityRaw > b.priorityRaw }
        return a.createdAt < b.createdAt
    }
}

struct ReminderGroup {
    let title: String
    let items: [Reminder]
}

enum DateGroups {
    static func make(_ items: [Reminder]) -> [ReminderGroup] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let tomorrow = cal.date(byAdding: .day, value: 1, to: today) ?? today
        let dayAfter = cal.date(byAdding: .day, value: 2, to: today) ?? today
        let week = cal.date(byAdding: .day, value: 7, to: today) ?? today
        var buckets: [String: [Reminder]] = [:]
        for r in items {
            let key: String
            if r.isDone {
                key = "Completed"
            } else if let due = r.due {
                if r.isOverdue { key = "Overdue" }
                else if due < tomorrow { key = "Today" }
                else if due < dayAfter { key = "Tomorrow" }
                else if due < week { key = "This Week" }
                else { key = "Later" }
            } else {
                key = "No Date"
            }
            buckets[key, default: []].append(r)
        }
        return ["Overdue", "Today", "Tomorrow", "This Week", "Later", "No Date", "Completed"].compactMap { key in
            buckets[key].map { ReminderGroup(title: key, items: $0) }
        }
    }
}

enum SmartList: String, CaseIterable, Identifiable, Hashable {
    case today, scheduled, all, flagged, overdue, completed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .scheduled: "Scheduled"
        case .all: "All"
        case .flagged: "Flagged"
        case .overdue: "Overdue"
        case .completed: "Completed"
        }
    }

    var icon: String {
        switch self {
        case .today: "sun.max.fill"
        case .scheduled: "calendar"
        case .all: "tray.fill"
        case .flagged: "flag.fill"
        case .overdue: "exclamationmark.circle.fill"
        case .completed: "checkmark.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .today: .blue
        case .scheduled: .red
        case .all: .gray
        case .flagged: .orange
        case .overdue: .pink
        case .completed: .green
        }
    }

    func includes(_ r: Reminder) -> Bool {
        switch self {
        case .today: r.isDueToday
        case .scheduled: r.isActive && r.due != nil
        case .all: r.isActive
        case .flagged: r.isActive && r.flagged
        case .overdue: r.isOverdue
        case .completed: r.deletedAt == nil && r.isDone
        }
    }
}

enum Destination: Hashable {
    case smart(SmartList)
    case list(ReminderList)
    case tag(String)
    case trash
}

struct ReminderRow: View {
    @Bindable var reminder: Reminder
    var showList = true
    var onOpen: () -> Void
    @Environment(\.modelContext) private var context

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                withAnimation(.snappy) { ReminderActions.toggleDone(reminder, context: context) }
            } label: {
                Image(systemName: reminder.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(reminder.isDone ? Color.accentColor : reminder.priority == Priority.none ? Color.secondary : reminder.priority.color)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.success, trigger: reminder.isDone)
            .accessibilityLabel(reminder.isDone ? "Mark not done" : "Complete")

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if reminder.priority != Priority.none {
                        Text(reminder.priority.marks).fontWeight(.bold).foregroundStyle(.red)
                    }
                    Text(reminder.title.isEmpty ? "Untitled" : reminder.title)
                        .strikethrough(reminder.isDone)
                        .foregroundStyle(reminder.isDone ? Color.secondary : Color.primary)
                }
                if !reminder.notes.isEmpty {
                    Text(reminder.notes).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                meta
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpen)

            Spacer(minLength: 0)
            if reminder.flagged {
                Image(systemName: "flag.fill").foregroundStyle(.orange).font(.footnote)
            }
        }
        .padding(.vertical, 2)
    }

    private var meta: some View {
        let progress = reminder.subtaskProgress
        let streak = Streaks.current(for: reminder)
        return HStack(spacing: 8) {
            if reminder.due != nil && !reminder.isDone {
                Text(Fmt.due(reminder)).foregroundStyle(reminder.isOverdue ? Color.red : Color.secondary)
            }
            if reminder.repeatRule != nil { Image(systemName: "repeat") }
            if streak >= 2 {
                Label("\(streak)", systemImage: "flame.fill").foregroundStyle(.orange)
            }
            if reminder.estimateMinutes > 0 { Text("~" + Fmt.minutes(reminder.estimateMinutes)) }
            if progress.total > 0 { Text("\(progress.done)/\(progress.total)") }
            if showList, let list = reminder.list {
                HStack(spacing: 3) {
                    Circle().fill(list.color).frame(width: 7, height: 7)
                    Text(list.name)
                }
            }
            ForEach(reminder.tags.prefix(2), id: \.self) { Text("#" + $0) }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}

/// Rows with the swipe actions and context menu every list shares.
struct ReminderRows: View {
    let items: [Reminder]
    var showList = true
    @Binding var editing: Reminder?
    @Environment(\.modelContext) private var context
    @Environment(FocusTimer.self) private var focus

    var body: some View {
        ForEach(items) { r in
            ReminderRow(reminder: r, showList: showList) { editing = r }
                .listRowBackground(Rectangle().fill(.regularMaterial))
                .swipeActions(edge: .leading) {
                    Button { ReminderActions.toggleDone(r, context: context) } label: {
                        Label(r.isDone ? "Undo" : "Done", systemImage: "checkmark")
                    }
                    .tint(.green)
                    Button { r.flagged.toggle() } label: {
                        Label(r.flagged ? "Unflag" : "Flag", systemImage: "flag")
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) { ReminderActions.delete(r, context: context) } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    Button { ReminderActions.reschedule(r, toDay: Calendar.current.startOfTomorrow) } label: {
                        Label("Tomorrow", systemImage: "arrow.turn.up.right")
                    }
                    .tint(.indigo)
                }
                .contextMenu {
                    Button { editing = r } label: { Label("Edit Details", systemImage: "info.circle") }
                    Button { ReminderActions.toggleDone(r, context: context) } label: {
                        Label(r.isDone ? "Mark Not Done" : "Mark Done", systemImage: "checkmark.circle")
                    }
                    if r.due != nil && !r.isDone {
                        Menu {
                            ForEach(ReminderActions.snoozeChoices, id: \.title) { choice in
                                Button(choice.title) { ReminderActions.snooze(r, until: choice.date) }
                            }
                        } label: {
                            Label("Snooze", systemImage: "zzz")
                        }
                    }
                    Button { r.flagged.toggle() } label: { Label(r.flagged ? "Unflag" : "Flag", systemImage: "flag") }
                    if !r.isDone {
                        Button {
                            focus.start(r, minutes: UserDefaults.standard.object(forKey: "focusMinutes") as? Int ?? 25)
                        } label: {
                            Label("Start Focus Timer", systemImage: "timer")
                        }
                    }
                    Button { ReminderActions.duplicate(r, context: context) } label: {
                        Label("Duplicate", systemImage: "plus.square.on.square")
                    }
                    Divider()
                    Button(role: .destructive) { ReminderActions.delete(r, context: context) } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
        }
    }
}

struct ChipsRow: View {
    let chips: [(icon: String, text: String)]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    ForEach(chips.indices, id: \.self) { i in
                        Label(chips[i].text, systemImage: chips[i].icon)
                            .font(.subheadline)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .glassEffect(.regular.tint(Color.accentColor.opacity(0.25)), in: .capsule)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }
}

struct HabitGrid: View {
    let reminder: Reminder

    var body: some View {
        let cal = Calendar.current
        let done = Set(reminder.history.map { cal.startOfDay(for: $0) })
        let today = cal.startOfDay(for: .now)
        let streak = Streaks.current(for: reminder)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                ForEach((0..<14).reversed(), id: \.self) { i in
                    let d = cal.date(byAdding: .day, value: -i, to: today) ?? today
                    RoundedRectangle(cornerRadius: 4)
                        .fill(done.contains(d) ? Color.green : Color.secondary.opacity(0.18))
                        .aspectRatio(1, contentMode: .fit)
                        .overlay {
                            if i == 0 { RoundedRectangle(cornerRadius: 4).stroke(Color.accentColor, lineWidth: 2) }
                        }
                }
            }
            Text(streak > 0
                 ? "\(streak)-\(Streaks.unit(for: reminder)) streak · \(reminder.history.count) done in total"
                 : "No current streak · \(reminder.history.count) done in total")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

enum QuickDates {
    static var weekend: Date {
        let cal = Calendar.current
        if cal.component(.weekday, from: .now) == 7 { return cal.startOfDay(for: .now) }
        return cal.nextDate(after: .now, matching: DateComponents(weekday: 7), matchingPolicy: .nextTime).map { cal.startOfDay(for: $0) } ?? .now
    }

    static var nextWeek: Date {
        let cal = Calendar.current
        return cal.nextDate(after: .now, matching: DateComponents(weekday: cal.firstWeekday), matchingPolicy: .nextTime)
            .map { cal.startOfDay(for: $0) } ?? .now
    }
}
