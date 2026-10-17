import SwiftData
import SwiftUI

/// Walks through overdue reminders one at a time.
struct ReviewView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query private var reminders: [Reminder]
    @State private var queue: [Reminder] = []
    @State private var index = 0
    @State private var moved = 0
    @State private var done = 0
    @State private var deleted = 0
    @State private var skipped = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if index < queue.count {
                    let r = queue[index]
                    VStack(spacing: 6) {
                        ProgressView(value: Double(index), total: Double(max(queue.count, 1)))
                        Text("\(index + 1) of \(queue.count)").font(.footnote).foregroundStyle(.secondary)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            if r.priority != Priority.none {
                                Text(r.priority.marks).foregroundStyle(.red).bold()
                            }
                            Text(r.title.isEmpty ? "Untitled" : r.title).font(.title2.bold())
                        }
                        Text(Fmt.due(r)).foregroundStyle(.red)
                        if let list = r.list {
                            Label(list.name, systemImage: "circle.fill").foregroundStyle(list.color).font(.subheadline)
                        }
                        if !r.notes.isEmpty {
                            Text(r.notes).font(.subheadline).foregroundStyle(.secondary).lineLimit(4)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .glassEffect(.regular, in: .rect(cornerRadius: 28))

                    Text("Move it to").font(.subheadline).foregroundStyle(.secondary)
                    GlassEffectContainer(spacing: 10) {
                        VStack(spacing: 10) {
                            HStack(spacing: 10) {
                                Button("Today") { move(r, to: Calendar.current.startOfDay(for: .now)) }
                                    .buttonStyle(.glassProminent)
                                Button("Tomorrow") { move(r, to: Calendar.current.startOfTomorrow) }
                                    .buttonStyle(.glass)
                                Button("Weekend") { move(r, to: QuickDates.weekend) }
                                    .buttonStyle(.glass)
                            }
                            HStack(spacing: 10) {
                                Button("Next Week") { move(r, to: QuickDates.nextWeek) }
                                    .buttonStyle(.glass)
                                Button("No Date") { move(r, to: nil) }
                                    .buttonStyle(.glass)
                            }
                            HStack(spacing: 10) {
                                Button("Done", systemImage: "checkmark") {
                                    ReminderActions.toggleDone(r, context: context)
                                    done += 1
                                    advance()
                                }
                                .buttonStyle(.glass)
                                .tint(.green)
                                Button("Delete", systemImage: "trash", role: .destructive) {
                                    ReminderActions.delete(r, context: context)
                                    deleted += 1
                                    advance()
                                }
                                .buttonStyle(.glass)
                                Button("Skip") {
                                    skipped += 1
                                    advance()
                                }
                                .buttonStyle(.glass)
                            }
                        }
                        .controlSize(.large)
                    }
                } else {
                    ContentUnavailableView {
                        Label("All caught up", systemImage: "checkmark.seal.fill")
                    } description: {
                        Text(queue.isEmpty ? "Nothing is overdue." : "\(moved) rescheduled · \(done) completed · \(deleted) deleted · \(skipped) skipped")
                    }
                }
                Spacer(minLength: 0)
            }
            .padding()
            .background { GlassBackdrop() }
            .navigationTitle("Review Overdue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .onAppear {
            if queue.isEmpty { queue = reminders.filter(\.isOverdue).sorted(by: Sorts.due) }
        }
    }

    private func move(_ r: Reminder, to day: Date?) {
        ReminderActions.reschedule(r, toDay: day)
        moved += 1
        advance()
    }

    private func advance() {
        withAnimation(.snappy) { index += 1 }
        ReminderActions.refreshBadge(context)
    }
}
