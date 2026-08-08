import Foundation

struct DayCount: Identifiable {
    let date: Date
    let count: Int
    var id: Date { date }
}

struct HourCount: Identifiable {
    let hour: Int
    let count: Int
    var id: Int { hour }
}

struct SenderCount: Identifiable {
    let sender: String
    let count: Int
    var id: String { sender }
}

struct MessageStats {
    let today: Int
    let yesterday: Int
    let last7Days: Int
    let last30Days: Int
    let allTime: Int
    let dailyAverage7: Double
    let dailyAverage30: Double
    let currentStreak: Int
    let longestStreak: Int
    let busiestHour: Int?
    let busiestWeekday: Int?
    let last14DaysSeries: [DayCount]
    let hourlyDistribution: [HourCount]
    let topSenders: [SenderCount]

    static let empty = MessageStats(
        today: 0, yesterday: 0, last7Days: 0, last30Days: 0, allTime: 0,
        dailyAverage7: 0, dailyAverage30: 0, currentStreak: 0, longestStreak: 0,
        busiestHour: nil, busiestWeekday: nil,
        last14DaysSeries: [], hourlyDistribution: [], topSenders: []
    )
}

enum StatsCalculator {
    static func calculate(from events: [MessageEvent], calendar: Calendar = .current, now: Date = .now) -> MessageStats {
        guard !events.isEmpty else { return .empty }

        let startOfToday = calendar.startOfDay(for: now)
        let startOfYesterday = calendar.date(byAdding: .day, value: -1, to: startOfToday)!
        let start7 = calendar.date(byAdding: .day, value: -6, to: startOfToday)!
        let start30 = calendar.date(byAdding: .day, value: -29, to: startOfToday)!

        var countsByDay: [Date: Int] = [:]
        var countsByHour: [Int: Int] = [:]
        var countsBySender: [String: Int] = [:]

        for event in events {
            let day = calendar.startOfDay(for: event.timestamp)
            countsByDay[day, default: 0] += 1
            countsByHour[calendar.component(.hour, from: event.timestamp), default: 0] += 1
            if let sender = event.sender, !sender.isEmpty {
                countsBySender[sender, default: 0] += 1
            }
        }

        let today = countsByDay[startOfToday] ?? 0
        let yesterday = countsByDay[startOfYesterday] ?? 0
        let last7 = countsByDay.filter { $0.key >= start7 }.values.reduce(0, +)
        let last30 = countsByDay.filter { $0.key >= start30 }.values.reduce(0, +)

        var series: [DayCount] = []
        series.reserveCapacity(14)
        for offset in stride(from: 13, through: 0, by: -1) {
            let day = calendar.date(byAdding: .day, value: -offset, to: startOfToday)!
            series.append(DayCount(date: day, count: countsByDay[day] ?? 0))
        }

        var currentStreak = 0
        var cursor = startOfToday
        if (countsByDay[cursor] ?? 0) == 0 {
            cursor = calendar.date(byAdding: .day, value: -1, to: cursor)!
        }
        while (countsByDay[cursor] ?? 0) > 0 {
            currentStreak += 1
            cursor = calendar.date(byAdding: .day, value: -1, to: cursor)!
        }

        let sortedDays = countsByDay.keys.sorted()
        var longestStreak = 0
        var runningStreak = 0
        var previousDay: Date?
        for day in sortedDays {
            if let previous = previousDay, calendar.date(byAdding: .day, value: 1, to: previous) == day {
                runningStreak += 1
            } else {
                runningStreak = 1
            }
            longestStreak = max(longestStreak, runningStreak)
            previousDay = day
        }

        var weekdayCounts: [Int: Int] = [:]
        for (day, count) in countsByDay {
            weekdayCounts[calendar.component(.weekday, from: day), default: 0] += count
        }

        let hourlyDistribution = (0..<24).map { HourCount(hour: $0, count: countsByHour[$0] ?? 0) }
        let topSenders = countsBySender
            .map { SenderCount(sender: $0.key, count: $0.value) }
            .sorted { $0.count > $1.count }
            .prefix(5)

        return MessageStats(
            today: today,
            yesterday: yesterday,
            last7Days: last7,
            last30Days: last30,
            allTime: events.count,
            dailyAverage7: Double(last7) / 7.0,
            dailyAverage30: Double(last30) / 30.0,
            currentStreak: currentStreak,
            longestStreak: longestStreak,
            busiestHour: countsByHour.max(by: { $0.value < $1.value })?.key,
            busiestWeekday: weekdayCounts.max(by: { $0.value < $1.value })?.key,
            last14DaysSeries: series,
            hourlyDistribution: hourlyDistribution,
            topSenders: Array(topSenders)
        )
    }
}
