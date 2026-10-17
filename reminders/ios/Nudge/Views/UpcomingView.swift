import SwiftData
import SwiftUI

struct UpcomingView: View {
    @Query(sort: \Reminder.createdAt) private var reminders: [Reminder]
    @State private var day = Calendar.current.startOfDay(for: .now)
    @State private var editing: Reminder?
    @State private var showAdd = false

    private var onDay: [Reminder] {
        reminders.filter { r in
            guard r.deletedAt == nil, let due = r.due else { return false }
            return Calendar.current.isDate(due, inSameDayAs: day)
        }
        .sorted(by: Sorts.due)
    }

    /// Repeating reminders that will come round again on the picked day.
    private var repeatsOnDay: [Reminder] {
        let cal = Calendar.current
        let start = cal.startOfDay(for: day)
        guard let end = cal.date(byAdding: .day, value: 1, to: start) else { return [] }
        return reminders.filter { r in
            guard r.isActive, let rule = r.repeatRule, let due = r.due, due < start else { return false }
            var t = due
            for _ in 0..<500 {
                t = rule.next(after: t)
                if let until = rule.until, t > until { return false }
                if t >= end { return false }
                if t >= start { return true }
            }
            return false
        }
    }

    private var nextDays: [ReminderGroup] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        return (1...7).compactMap { offset -> ReminderGroup? in
            guard let d = cal.date(byAdding: .day, value: offset, to: today) else { return nil }
            let items = reminders.filter { r in
                guard r.isActive, let due = r.due else { return false }
                return cal.isDate(due, inSameDayAs: d)
            }
            .sorted(by: Sorts.due)
            return items.isEmpty ? nil : ReminderGroup(title: Fmt.day(d), items: items)
        }
    }

    var body: some View {
        List {
            Section {
                DatePicker("Day", selection: $day, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding(10)
                    .glassEffect(.regular, in: .rect(cornerRadius: 28))
                    .padding(.vertical, 6)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            Section(Fmt.day(day)) {
                if onDay.isEmpty && repeatsOnDay.isEmpty {
                    Text("Nothing on this day. Tap + to add something here.")
                        .foregroundStyle(.secondary)
                        .listRowBackground(Rectangle().fill(.regularMaterial))
                }
                ReminderRows(items: onDay, editing: $editing)
                ForEach(repeatsOnDay) { r in
                    Label("\(r.title) (repeats)", systemImage: "repeat")
                        .foregroundStyle(.secondary)
                        .listRowBackground(Rectangle().fill(.regularMaterial))
                }
            }

            if Calendar.current.isDateInToday(day) {
                ForEach(nextDays, id: \.title) { group in
                    Section(group.title) {
                        ReminderRows(items: group.items, editing: $editing)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { GlassBackdrop() }
        .navigationTitle("Upcoming")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if !Calendar.current.isDateInToday(day) {
                    Button("Today") { withAnimation { day = Calendar.current.startOfDay(for: .now) } }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New reminder on this day")
            }
        }
        .sheet(isPresented: $showAdd) { QuickAddSheet(addContext: .day(day)) }
        .sheet(item: $editing) { ReminderEditor(reminder: $0) }
    }
}
