import Foundation

/// What the quick-add field understood from a sentence like
/// "Call dentist tomorrow 3pm !high #health".
struct ParsedReminder {
    var title = ""
    var due: Date?
    var allDay = false
    var priority: Priority = .none
    var flagged = false
    var tags: [String] = []
    var listName: String?
    var repeatRule: RepeatRule?
    var estimate = 0
    var early: Int?

    var chips: [(icon: String, text: String)] {
        var c: [(icon: String, text: String)] = []
        if let due {
            c.append(("calendar", allDay ? Fmt.day(due) : Fmt.day(due) + ", " + due.formatted(date: .omitted, time: .shortened)))
        }
        if let repeatRule { c.append(("repeat", repeatRule.label)) }
        if let early, early > 0 { c.append(("alarm", Fmt.early(early))) }
        if estimate > 0 { c.append(("timer", "~" + Fmt.minutes(estimate))) }
        if priority != Priority.none { c.append(("exclamationmark.circle", priority.title + " priority")) }
        if flagged { c.append(("flag.fill", "Flagged")) }
        if let listName { c.append(("list.bullet", listName)) }
        for t in tags { c.append(("number", t)) }
        return c
    }
}

enum QuickParser {
    static func parse(_ input: String, listNames: [String], now: Date = .now, calendar: Calendar = .current) -> ParsedReminder {
        var out = ParsedReminder()
        var s = " " + input + " "

        /// Runs `pattern` against the remaining text. When `handle` accepts a match it is cut out.
        func take(_ pattern: String, all: Bool = false, _ handle: ([String?]) -> Bool) {
            guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return }
            var start = 0
            while true {
                let ns = s as NSString
                guard start < ns.length,
                      let m = re.firstMatch(in: s, range: NSRange(location: start, length: ns.length - start)) else { return }
                var groups: [String?] = []
                for i in 0..<m.numberOfRanges {
                    let r = m.range(at: i)
                    groups.append(r.location == NSNotFound ? nil : ns.substring(with: r))
                }
                if handle(groups) {
                    s = ns.replacingCharacters(in: m.range, with: " ")
                    start = m.range.location
                } else {
                    start = m.range.location + max(1, m.range.length)
                }
                if !all { return }
            }
        }

        func minutes(_ value: Double, unit: String) -> Int {
            let u = unit.lowercased()
            if u.hasPrefix("d") { return Int(value * 1440) }
            if u.hasPrefix("h") { return Int(value * 60) }
            return Int(value)
        }

        take(#"\s#([\p{L}\p{N}_-]+)"#, all: true) { g in
            let t = (g[1] ?? "").lowercased()
            if !t.isEmpty && !out.tags.contains(t) { out.tags.append(t) }
            return true
        }
        take(#"\s@([\p{L}\p{N}_-]+)"#) { g in
            let wanted = (g[1] ?? "").lowercased()
            guard let name = listNames.first(where: {
                $0.lowercased() == wanted || $0.lowercased().replacingOccurrences(of: " ", with: "-") == wanted
            }) else { return false }
            out.listName = name
            return true
        }
        take(#"\s!(high|hi|medium|med|low|lo)\b"#) { g in
            let p = (g[1] ?? "").lowercased()
            out.priority = p.hasPrefix("h") ? .high : p.hasPrefix("m") ? .medium : .low
            return true
        }
        take(#"\s(!{1,3})(?=\s)"#) { g in
            out.priority = Priority(rawValue: (g[1] ?? "").count) ?? Priority.none
            return true
        }
        take(#"\s(\*|!flag(?:ged)?)(?=\s)"#) { _ in
            out.flagged = true
            return true
        }
        take(#"\s~(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?)(?=\s)"#) { g in
            out.estimate = minutes(Double(g[1] ?? "") ?? 0, unit: g[2] ?? "m")
            return true
        }
        take(#"\s(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)\s+(?:before|early|ahead)(?=\s)"#) { g in
            out.early = minutes(Double(g[1] ?? "") ?? 0, unit: g[2] ?? "m")
            return true
        }
        take(#"\s(?:every\s+(other\s+)?(?:(\d+)\s+)?(days?|weeks?|weekdays?|months?|years?|hours?)|(daily|weekly|monthly|yearly|annually|hourly|weekdays))(?=\s)"#) { g in
            let unit = (g[3] ?? g[4] ?? "").lowercased()
            let freq: RepeatRule.Frequency
            if unit.hasPrefix("weekday") { freq = .weekdays }
            else if unit.hasPrefix("day") || unit == "daily" { freq = .daily }
            else if unit.hasPrefix("week") { freq = .weekly }
            else if unit.hasPrefix("month") { freq = .monthly }
            else if unit.hasPrefix("year") || unit == "annually" { freq = .yearly }
            else { freq = .hourly }
            let interval = g[1] != nil ? 2 : Int(g[2] ?? "") ?? 1
            out.repeatRule = RepeatRule(frequency: freq, interval: freq == .weekdays ? 1 : interval)
            return true
        }
        // "every monday": weekly, and leave the weekday for the date detector below.
        take(#"\severy\s+(?=(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b)"#) { _ in
            out.repeatRule = RepeatRule(frequency: .weekly)
            return true
        }
        take(#"\sin\s+(\d+|an?)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)(?=\s)"#) { g in
            let raw = (g[1] ?? "1").lowercased()
            let n = Int(raw) ?? 1
            let u = (g[2] ?? "").lowercased()
            if u.hasPrefix("m") {
                out.due = calendar.date(byAdding: .minute, value: n, to: now)
            } else if u.hasPrefix("h") {
                out.due = calendar.date(byAdding: .hour, value: n, to: now)
            } else if u.hasPrefix("d") {
                out.due = calendar.date(byAdding: .day, value: n, to: calendar.startOfDay(for: now))
                out.allDay = true
            } else {
                out.due = calendar.date(byAdding: .day, value: 7 * n, to: calendar.startOfDay(for: now))
                out.allDay = true
            }
            return true
        }
        take(#"\stonight(?=\s)"#) { _ in
            out.due = calendar.date(bySettingHour: 20, minute: 0, second: 0, of: now)
            out.allDay = false
            return true
        }

        // Everything else about dates and times: let Foundation's detector read it.
        if out.due == nil, let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue) {
            let ns = s as NSString
            if let m = detector.firstMatch(in: s, options: [], range: NSRange(location: 0, length: ns.length)), let date = m.date {
                let matched = ns.substring(with: m.range).lowercased()
                let timed = matched.range(of: #"\d\s*(am|pm|a\.m\.|p\.m\.)|\d:\d|noon|midnight|morning|afternoon|evening|night|\bat\s+\d"#, options: .regularExpression) != nil
                if timed {
                    var d = date
                    if d < now && calendar.isDate(d, inSameDayAs: now) && !matched.contains("today") {
                        d = calendar.date(byAdding: .day, value: 1, to: d) ?? d
                    }
                    out.due = d
                    out.allDay = false
                } else {
                    out.due = calendar.startOfDay(for: date)
                    out.allDay = true
                }
                s = ns.replacingCharacters(in: m.range, with: " ")
            }
        }

        if out.repeatRule != nil && out.due == nil {
            out.due = calendar.startOfDay(for: now)
            out.allDay = true
        }
        if out.repeatRule?.frequency == .monthly, let due = out.due {
            out.repeatRule?.anchorDay = calendar.component(.day, from: due)
        }

        var title = s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        title = title.replacingOccurrences(of: #"\s+(on|at|by|in|for|due)$"#, with: "", options: [.regularExpression, .caseInsensitive])
        title = title.replacingOccurrences(of: #"^(remind me to|remind me|todo:?)\s+"#, with: "", options: [.regularExpression, .caseInsensitive])
        if let first = title.first {
            title = first.uppercased() + title.dropFirst()
        }
        out.title = title
        return out
    }
}

enum Fmt {
    static func day(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Today" }
        if cal.isDateInTomorrow(date) { return "Tomorrow" }
        if cal.isDateInYesterday(date) { return "Yesterday" }
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: .now), to: cal.startOfDay(for: date)).day ?? 0
        if days > 0 && days < 7 { return date.formatted(.dateTime.weekday(.wide)) }
        let sameYear = cal.component(.year, from: date) == cal.component(.year, from: .now)
        return sameYear ? date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
                        : date.formatted(date: .abbreviated, time: .omitted)
    }

    static func due(_ r: Reminder) -> String {
        guard let due = r.due else { return "" }
        return r.allDay ? day(due) : day(due) + ", " + due.formatted(date: .omitted, time: .shortened)
    }

    static func minutes(_ m: Int) -> String {
        if m < 60 { return "\(m) min" }
        let h = m / 60, rest = m % 60
        return rest == 0 ? "\(h)h" : "\(h)h \(rest)m"
    }

    static func early(_ m: Int) -> String {
        if m == 0 { return "At time of event" }
        if m < 60 { return "\(m) min before" }
        if m < 1440 { return "\(m / 60) h before" }
        return m == 1440 ? "1 day before" : "\(m / 1440) days before"
    }

    static func clock(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds.rounded(.up)))
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}
