import SwiftUI
import WidgetKit
import Charts

struct CircularStatView: View {
    let stats: MessageStats

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text("\(stats.today)")
                    .font(.title2.bold())
                    .minimumScaleFactor(0.5)
                Text("heute")
                    .font(.caption2)
            }
        }
    }
}

struct RectangularStatView: View {
    let stats: MessageStats

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Nachrichten")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text("\(stats.today) heute")
                .font(.headline)
                .minimumScaleFactor(0.7)
            Text("\(stats.last7Days) diese Woche · Ø \(String(format: "%.1f", stats.dailyAverage7))")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

struct SmallStatView: View {
    let stats: MessageStats

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "message.fill")
                .foregroundStyle(.tint)
            Spacer()
            Text("\(stats.today)")
                .font(.system(size: 34, weight: .bold))
                .minimumScaleFactor(0.5)
            Text("heute")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }
}

struct MediumStatView: View {
    let stats: MessageStats

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(stats.today)")
                    .font(.system(size: 32, weight: .bold))
                    .minimumScaleFactor(0.5)
                Text("heute")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(stats.last7Days) diese Woche")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Chart(stats.last14DaysSeries.suffix(7)) { day in
                BarMark(
                    x: .value("Tag", day.date, unit: .day),
                    y: .value("Nachrichten", day.count)
                )
                .foregroundStyle(.tint)
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .frame(width: 120, height: 60)
        }
        .padding()
    }
}
