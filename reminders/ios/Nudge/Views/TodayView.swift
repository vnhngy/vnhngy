import SwiftData
import SwiftUI

struct TodayView: View {
    @Environment(FocusTimer.self) private var focus
    @Query(sort: \Reminder.createdAt) private var reminders: [Reminder]
    @State private var editing: Reminder?
    @State private var showAdd = false
    @State private var showReview = false
    @State private var showSettings = false

    private var active: [Reminder] { reminders.filter(\.isActive) }
    private var overdue: [Reminder] { active.filter(\.isOverdue).sorted(by: Sorts.due) }
    private var today: [Reminder] { active.filter { $0.isDueToday && !$0.isOverdue }.sorted(by: Sorts.due) }
    private var next: Reminder? {
        active.filter { !$0.allDay && ($0.due ?? .distantPast) > .now }
            .min { ($0.due ?? .distantFuture) < ($1.due ?? .distantFuture) }
    }

    var body: some View {
        List {
            Section {
                UpNextCard(
                    next: next,
                    left: today.count + overdue.count,
                    estimate: (today + overdue).reduce(0) { $0 + $1.estimateMinutes },
                    overdue: overdue.count,
                    onReview: { showReview = true },
                    onOpen: { editing = $0 }
                )
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            if !overdue.isEmpty {
                Section {
                    ReminderRows(items: overdue, editing: $editing)
                } header: {
                    Text("Overdue").foregroundStyle(.red)
                }
            }

            Section("Today") {
                if today.isEmpty {
                    Text(overdue.isEmpty ? "Nothing due today. Tap + to add something." : "Only overdue items left.")
                        .foregroundStyle(.secondary)
                        .listRowBackground(Rectangle().fill(.regularMaterial))
                } else {
                    ReminderRows(items: today, editing: $editing)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { GlassBackdrop() }
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showSettings = true } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Settings")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New reminder")
            }
        }
        .sheet(isPresented: $showAdd) { QuickAddSheet(addContext: .today) }
        .sheet(item: $editing) { ReminderEditor(reminder: $0) }
        .sheet(isPresented: $showReview) { ReviewView() }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .overlay(alignment: .bottom) {
            if let message = focus.lastResult {
                Text(message)
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .capsule)
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(4))
                        withAnimation { focus.lastResult = nil }
                    }
            }
        }
    }
}

struct UpNextCard: View {
    let next: Reminder?
    let left: Int
    let estimate: Int
    let overdue: Int
    var onReview: () -> Void
    var onOpen: (Reminder) -> Void
    @Environment(FocusTimer.self) private var focus

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("UP NEXT")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tint)
            if let next {
                Button { onOpen(next) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(next.title.isEmpty ? "Untitled" : next.title)
                            .font(.title2.bold())
                            .multilineTextAlignment(.leading)
                        if let due = next.due {
                            HStack(spacing: 4) {
                                Text(due.formatted(date: .omitted, time: .shortened))
                                Text("·")
                                Text("in")
                                Text(due, style: .relative)
                            }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            } else {
                Text("Nothing else with a set time").font(.title3.weight(.semibold))
            }
            Text(estimate > 0 ? "\(left) left today · about \(Fmt.minutes(estimate))" : "\(left) left today")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            GlassEffectContainer(spacing: 10) {
                HStack(spacing: 10) {
                    if let next, !focus.isActive {
                        Button {
                            focus.start(next, minutes: UserDefaults.standard.object(forKey: "focusMinutes") as? Int ?? 25)
                        } label: {
                            Label("Focus", systemImage: "timer")
                        }
                        .buttonStyle(.glass)
                    }
                    if overdue > 0 {
                        Button(action: onReview) {
                            Label("Review \(overdue) overdue", systemImage: "clock.arrow.circlepath")
                        }
                        .buttonStyle(.glassProminent)
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
        .padding(.vertical, 8)
    }
}
