import Charts
import SwiftData
import SwiftUI

struct StatsView: View {
    @Query private var completions: [Completion]
    @Query private var sessions: [FocusSession]
    @Query private var reminders: [Reminder]
    @Query(sort: \ReminderList.order) private var lists: [ReminderList]

    private struct DayCount: Identifiable {
        let day: Date
        let count: Int
        var id: Date { day }
    }

    private struct ListCount: Identifiable {
        let name: String
        let count: Int
        let color: Color
        var id: String { name }
    }

    private var cal: Calendar { .current }
    private var today: Date { cal.startOfDay(for: .now) }
    private var weekStart: Date { cal.dateInterval(of: .weekOfYear, for: .now)?.start ?? today }

    private var days: [DayCount] {
        (0..<14).reversed().map { i in
            let d = cal.date(byAdding: .day, value: -i, to: today) ?? today
            return DayCount(day: d, count: completions.filter { cal.isDate($0.at, inSameDayAs: d) }.count)
        }
    }

    private var streaks: (current: Int, best: Int) {
        let doneDays = Set(completions.map { cal.startOfDay(for: $0.at) })
        var current = 0
        var d = doneDays.contains(today) ? today : (cal.date(byAdding: .day, value: -1, to: today) ?? today)
        while doneDays.contains(d) {
            current += 1
            d = cal.date(byAdding: .day, value: -1, to: d) ?? d
        }
        var best = 0, run = 0
        var previous: Date?
        for day in doneDays.sorted() {
            if let previous, cal.date(byAdding: .day, value: 1, to: previous) == day { run += 1 } else { run = 1 }
            best = max(best, run)
            previous = day
        }
        return (current, best)
    }

    private var byList: [ListCount] {
        let monthAgo = cal.date(byAdding: .day, value: -30, to: today) ?? today
        let recent = completions.filter { $0.at >= monthAgo }
        return lists.map { list in
            ListCount(name: list.name, count: recent.filter { $0.listName == list.name }.count, color: list.color)
        }
    }

    private var onTimeRate: Int? {
        let dated = reminders.filter { $0.isDone && $0.due != nil && $0.doneAt != nil }
        guard !dated.isEmpty else { return nil }
        let onTime = dated.filter { r in
            guard let due = r.due, let done = r.doneAt,
                  let limit = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: due)) else { return false }
            return done <= limit
        }
        return Int((Double(onTime.count) / Double(dated.count) * 100).rounded())
    }

    var body: some View {
        let active = reminders.filter(\.isActive)
        let s = streaks
        let focusWeek = sessions.filter { $0.start >= weekStart }.reduce(0) { $0 + $1.minutes }
        let habits = reminders.filter { $0.isActive && $0.repeatRule != nil && !$0.history.isEmpty }
            .sorted { Streaks.current(for: $0) > Streaks.current(for: $1) }

        ScrollView {
            VStack(spacing: 14) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    StatTile(title: "Done today", value: "\(days.last?.count ?? 0)", detail: "\(active.filter(\.isDueToday).count) still due")
                    StatTile(title: "This week", value: "\(completions.filter { $0.at >= weekStart }.count)", detail: "completed")
                    StatTile(title: "Streak", value: "\(s.current)", detail: "best \(s.best) days")
                    StatTile(title: "Open", value: "\(active.count)", detail: "\(active.filter(\.isOverdue).count) overdue")
                    StatTile(title: "Focus", value: Fmt.minutes(focusWeek), detail: "this week")
                    StatTile(title: "On time", value: onTimeRate.map { "\($0)%" } ?? "–", detail: "done by their day")
                }

                GlassPanel(title: "Completed, last 14 days") {
                    Chart(days) { d in
                        BarMark(x: .value("Day", d.day, unit: .day), y: .value("Completed", d.count))
                            .foregroundStyle(Color.accentColor.gradient)
                            .cornerRadius(5)
                    }
                    .chartXAxis {
                        AxisMarks(values: .stride(by: .day, count: 2)) { _ in
                            AxisValueLabel(format: .dateTime.weekday(.narrow))
                        }
                    }
                    .frame(height: 180)
                }

                GlassPanel(title: "By list, last 30 days") {
                    Chart(byList) { item in
                        BarMark(x: .value("Completed", item.count), y: .value("List", item.name))
                            .foregroundStyle(item.color.gradient)
                            .cornerRadius(5)
                    }
                    .frame(height: CGFloat(max(1, byList.count)) * 38)
                }

                if !habits.isEmpty {
                    GlassPanel(title: "Habit streaks") {
                        ForEach(habits) { r in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(r.title)
                                    Text(r.repeatRule?.label ?? "").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Label("\(Streaks.current(for: r))", systemImage: "flame.fill")
                                    .foregroundStyle(.orange)
                                    .monospacedDigit()
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background { GlassBackdrop() }
        .navigationTitle("Statistics")
    }
}

struct StatTile: View {
    let title: String
    let value: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(value).font(.system(.title, design: .rounded).bold()).monospacedDigit()
            Text(detail).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 22))
    }
}

struct GlassPanel<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .glassEffect(.regular, in: .rect(cornerRadius: 26))
    }
}
