import WidgetKit
import SwiftUI

struct MessageStatsWidget: Widget {
    let kind = "MessageStatsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MessageStatsTimelineProvider()) { entry in
            MessageStatsWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Message Stats")
        .description("Zeigt, wie viele Nachrichten du heute erhalten hast — auch auf dem Sperrbildschirm.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .systemSmall,
            .systemMedium
        ])
    }
}

struct MessageStatsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MessageStatsEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            CircularStatView(stats: entry.stats)
        case .accessoryRectangular:
            RectangularStatView(stats: entry.stats)
        case .accessoryInline:
            Text("\(entry.stats.today) Nachrichten heute")
        case .systemMedium:
            MediumStatView(stats: entry.stats)
        default:
            SmallStatView(stats: entry.stats)
        }
    }
}
