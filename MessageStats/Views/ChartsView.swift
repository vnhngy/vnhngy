import SwiftUI
import SwiftData
import Charts

struct ChartsView: View {
    @Query(sort: \MessageEvent.timestamp, order: .reverse) private var events: [MessageEvent]

    private var stats: MessageStats {
        StatsCalculator.calculate(from: events)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    section(title: "Letzte 14 Tage") {
                        Chart(stats.last14DaysSeries) { day in
                            BarMark(
                                x: .value("Tag", day.date, unit: .day),
                                y: .value("Nachrichten", day.count)
                            )
                            .foregroundStyle(Color.accentColor.gradient)
                        }
                        .chartXAxis {
                            AxisMarks(values: .stride(by: .day, count: 2)) { value in
                                AxisGridLine()
                                AxisValueLabel(format: .dateTime.day().month(.defaultDigits))
                            }
                        }
                        .frame(height: 200)
                    }

                    section(title: "Verteilung nach Tageszeit") {
                        Chart(stats.hourlyDistribution) { hour in
                            BarMark(
                                x: .value("Stunde", hour.hour),
                                y: .value("Nachrichten", hour.count)
                            )
                            .foregroundStyle(Color.purple.gradient)
                        }
                        .chartXAxis {
                            AxisMarks(values: [0, 6, 12, 18, 23])
                        }
                        .frame(height: 200)
                    }

                    if !events.isEmpty {
                        section(title: "Zusammenfassung") {
                            VStack(alignment: .leading, spacing: 6) {
                                summaryRow("Aktivster Wochentag", weekdayLabel(stats.busiestWeekday))
                                summaryRow("Aktivste Stunde", stats.busiestHour.map { String(format: "%02d:00", $0) } ?? "–")
                                summaryRow("Ø Nachrichten / Tag (30 Tage)", String(format: "%.1f", stats.dailyAverage30))
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Charts")
        }
    }

    @ViewBuilder
    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            content()
                .padding()
                .background(.thickMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private func summaryRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium)
        }
        .font(.subheadline)
    }

    private func weekdayLabel(_ weekday: Int?) -> String {
        guard let weekday else { return "–" }
        let symbols = Calendar.current.weekdaySymbols
        return symbols[(weekday - 1 + symbols.count) % symbols.count]
    }
}
