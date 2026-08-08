import WidgetKit

struct MessageStatsEntry: TimelineEntry {
    let date: Date
    let stats: MessageStats
}

struct MessageStatsTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> MessageStatsEntry {
        MessageStatsEntry(date: .now, stats: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (MessageStatsEntry) -> Void) {
        completion(MessageStatsEntry(date: .now, stats: currentStats()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MessageStatsEntry>) -> Void) {
        let now = Date()
        let entry = MessageStatsEntry(date: now, stats: currentStats())

        // The widget also gets new data pushed via WidgetCenter.reloadAllTimelines()
        // whenever a message is logged. This scheduled refresh makes sure "today"
        // rolls over to 0 right after midnight even without new messages, and that
        // the widget stays generally fresh throughout the day.
        let calendar = Calendar.current
        let nextMidnight = calendar.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)
        let nextHour = calendar.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
        let refreshDate = min(nextMidnight, nextHour)

        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
    }

    private func currentStats() -> MessageStats {
        StatsCalculator.calculate(from: MessageStore.fetchAllEvents())
    }
}
