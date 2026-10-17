import Foundation

extension RepeatRule {
    func next(after date: Date, calendar: Calendar = .current) -> Date {
        let n = max(1, interval)
        switch frequency {
        case .hourly:
            return calendar.date(byAdding: .hour, value: n, to: date) ?? date
        case .daily:
            return calendar.date(byAdding: .day, value: n, to: date) ?? date
        case .weekdays:
            var d = date
            repeat {
                d = calendar.date(byAdding: .day, value: 1, to: d) ?? d
            } while calendar.isDateInWeekend(d)
            return d
        case .weekly:
            return calendar.date(byAdding: .weekOfYear, value: n, to: date) ?? date
        case .monthly:
            guard let moved = calendar.date(byAdding: .month, value: n, to: date) else { return date }
            let anchor = anchorDay ?? calendar.component(.day, from: date)
            let days = calendar.range(of: .day, in: .month, for: moved)?.count ?? 28
            var comps = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: moved)
            comps.day = min(anchor, days)
            return calendar.date(from: comps) ?? moved
        case .yearly:
            return calendar.date(byAdding: .year, value: n, to: date) ?? date
        }
    }

    var label: String {
        var s: String
        if frequency == .weekdays {
            s = "Every weekday"
        } else if interval <= 1 {
            s = frequency.title
        } else {
            s = "Every \(interval) \(frequency.unit)s"
        }
        if let until {
            s += " until " + until.formatted(date: .abbreviated, time: .omitted)
        }
        return s
    }
}

enum Streaks {
    /// Current streak for a repeating reminder, in the habit's own unit (days, weeks or months).
    static func current(for reminder: Reminder, calendar: Calendar = .current) -> Int {
        guard let rule = reminder.repeatRule, !reminder.history.isEmpty else { return 0 }
        switch rule.frequency {
        case .daily, .weekdays:
            let days = Set(reminder.history.map { calendar.startOfDay(for: $0) })
            var d = calendar.startOfDay(for: .now)
            if !days.contains(d) { d = calendar.date(byAdding: .day, value: -1, to: d) ?? d }
            var n = 0
            for _ in 0..<800 {
                if rule.frequency == .weekdays && calendar.isDateInWeekend(d) {
                    d = calendar.date(byAdding: .day, value: -1, to: d) ?? d
                    continue
                }
                guard days.contains(d) else { break }
                n += 1
                d = calendar.date(byAdding: .day, value: -1, to: d) ?? d
            }
            return n
        case .weekly:
            let weeks = Set(reminder.history.compactMap { calendar.dateInterval(of: .weekOfYear, for: $0)?.start })
            guard var w = calendar.dateInterval(of: .weekOfYear, for: .now)?.start else { return 0 }
            if !weeks.contains(w) { w = calendar.date(byAdding: .weekOfYear, value: -1, to: w) ?? w }
            var n = 0
            while weeks.contains(w) {
                n += 1
                w = calendar.date(byAdding: .weekOfYear, value: -1, to: w) ?? w
            }
            return n
        case .monthly:
            func key(_ d: Date) -> Int {
                let c = calendar.dateComponents([.year, .month], from: d)
                return (c.year ?? 0) * 12 + (c.month ?? 0)
            }
            let months = Set(reminder.history.map(key))
            var m = key(.now)
            if !months.contains(m) { m -= 1 }
            var n = 0
            while months.contains(m) {
                n += 1
                m -= 1
            }
            return n
        default:
            return 0
        }
    }

    static func unit(for reminder: Reminder) -> String {
        switch reminder.repeatRule?.frequency {
        case .weekly: "week"
        case .monthly: "month"
        default: "day"
        }
    }
}
