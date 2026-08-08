import SwiftUI
import SwiftData

struct SendersView: View {
    @Query(sort: \MessageEvent.timestamp, order: .reverse) private var events: [MessageEvent]

    private var stats: MessageStats {
        StatsCalculator.calculate(from: events)
    }

    var body: some View {
        NavigationStack {
            List {
                if stats.topSenders.isEmpty {
                    ContentUnavailableView(
                        "Keine Absenderdaten",
                        systemImage: "person.crop.circle.badge.questionmark",
                        description: Text("Absender werden nur erfasst, wenn du in der Kurzbefehle-Automation die Variable „Absender“ an den Parameter der App-Aktion übergibst.")
                    )
                } else {
                    Section("Top Kontakte") {
                        ForEach(stats.topSenders) { sender in
                            HStack {
                                Text(sender.sender)
                                Spacer()
                                Text("\(sender.count)")
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                        }
                    }
                }
            }
            .navigationTitle("Kontakte")
        }
    }
}
