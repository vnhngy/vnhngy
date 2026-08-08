import SwiftUI
import SwiftData

struct DashboardView: View {
    @Query(sort: \MessageEvent.timestamp, order: .reverse) private var events: [MessageEvent]

    private var stats: MessageStats {
        StatsCalculator.calculate(from: events)
    }

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    StatCardView(title: "Heute", value: "\(stats.today)", systemImage: "sun.max.fill", tint: .orange)
                    StatCardView(title: "Gestern", value: "\(stats.yesterday)", systemImage: "moon.stars.fill", tint: .indigo)
                    StatCardView(title: "Letzte 7 Tage", value: "\(stats.last7Days)", systemImage: "calendar", tint: .blue)
                    StatCardView(title: "Letzte 30 Tage", value: "\(stats.last30Days)", systemImage: "calendar.badge.clock", tint: .teal)
                    StatCardView(title: "Ø pro Tag (7T)", value: format(stats.dailyAverage7), systemImage: "chart.bar.fill", tint: .purple)
                    StatCardView(title: "Ø pro Tag (30T)", value: format(stats.dailyAverage30), systemImage: "chart.bar.xaxis", tint: .pink)
                    StatCardView(title: "Aktuelle Serie", value: "\(stats.currentStreak) Tage", systemImage: "flame.fill", tint: .red)
                    StatCardView(title: "Längste Serie", value: "\(stats.longestStreak) Tage", systemImage: "trophy.fill", tint: .yellow)
                    StatCardView(title: "Insgesamt", value: "\(stats.allTime)", systemImage: "sum", tint: .green)
                    StatCardView(title: "Aktivste Stunde", value: hourLabel(stats.busiestHour), systemImage: "clock.fill", tint: .mint)
                }
                .padding()

                if events.isEmpty {
                    ContentUnavailableView(
                        "Noch keine Daten",
                        systemImage: "message.badge.waveform",
                        description: Text("Richte die Kurzbefehle-Automation unter „Einstellungen“ ein, damit eingehende Nachrichten automatisch gezählt werden.")
                    )
                    .padding(.top, 40)
                }
            }
            .navigationTitle("Message Stats")
        }
    }

    private func format(_ value: Double) -> String {
        String(format: "%.1f", value)
    }

    private func hourLabel(_ hour: Int?) -> String {
        guard let hour else { return "–" }
        return String(format: "%02d:00", hour)
    }
}
