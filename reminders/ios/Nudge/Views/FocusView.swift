import SwiftData
import SwiftUI

struct FocusView: View {
    var reminder: Reminder?
    @Environment(FocusTimer.self) private var focus
    @Environment(\.dismiss) private var dismiss
    @AppStorage("focusMinutes") private var minutes = 25

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                if focus.isActive {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        ZStack {
                            Circle().stroke(.quaternary, lineWidth: 14)
                            Circle()
                                .trim(from: 0, to: focus.progress(at: context.date))
                                .stroke(Color.accentColor.gradient, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                            VStack(spacing: 4) {
                                Text(Fmt.clock(focus.remaining(at: context.date)))
                                    .font(.system(size: 56, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .contentTransition(.numericText(countsDown: true))
                                Text(focus.isPaused ? "Paused" : "Focusing").foregroundStyle(.secondary)
                            }
                        }
                        .frame(width: 260, height: 260)
                        .padding(24)
                        .glassEffect(.regular, in: .circle)
                    }
                    Text(focus.title).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                    GlassEffectContainer(spacing: 12) {
                        HStack(spacing: 12) {
                            Button(focus.isPaused ? "Resume" : "Pause", systemImage: focus.isPaused ? "play.fill" : "pause.fill") {
                                focus.togglePause()
                            }
                            .buttonStyle(.glassProminent)
                            Button("+5 min", systemImage: "plus") { focus.addFive() }
                                .buttonStyle(.glass)
                            Button("Stop", systemImage: "stop.fill", role: .destructive) { focus.stop() }
                                .buttonStyle(.glass)
                        }
                        .controlSize(.large)
                    }
                } else if let reminder {
                    Image(systemName: "timer")
                        .font(.system(size: 54))
                        .foregroundStyle(.tint)
                        .frame(width: 120, height: 120)
                        .glassEffect(.regular, in: .circle)
                    Text(reminder.title.isEmpty ? "Untitled" : reminder.title)
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Picker("Length", selection: $minutes) {
                        ForEach([5, 15, 25, 45, 60, 90], id: \.self) { Text("\($0) min").tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Button {
                        focus.start(reminder, minutes: minutes)
                    } label: {
                        Label("Start Focus", systemImage: "play.fill").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .controlSize(.large)
                    Text("You'll get a notification when the time is up, even if Nudge is closed.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                } else {
                    ContentUnavailableView("No focus session", systemImage: "timer",
                                           description: Text("Start one from a reminder's details or by long-pressing it."))
                }
                Spacer(minLength: 0)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background { GlassBackdrop() }
            .navigationTitle("Focus")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}

/// Sits above the tab bar: the running focus timer, or what's due next.
struct NowAccessory: View {
    @Environment(FocusTimer.self) private var focus
    @Query private var reminders: [Reminder]
    @State private var showFocus = false
    @State private var editing: Reminder?

    private var next: Reminder? {
        reminders.filter { $0.isActive && !$0.allDay && ($0.due ?? .distantPast) > .now }
            .min { ($0.due ?? .distantFuture) < ($1.due ?? .distantFuture) }
    }

    var body: some View {
        Button {
            if focus.isActive { showFocus = true } else if let next { editing = next }
        } label: {
            HStack(spacing: 10) {
                if focus.isActive {
                    Image(systemName: focus.isPaused ? "pause.circle.fill" : "timer").foregroundStyle(.tint)
                    Text(focus.title).lineLimit(1)
                    Spacer(minLength: 4)
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Text(Fmt.clock(focus.remaining(at: context.date)))
                            .monospacedDigit()
                            .fontWeight(.semibold)
                    }
                } else if let next, let due = next.due {
                    Image(systemName: "bell.fill").foregroundStyle(.tint)
                    Text(next.title).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(due, style: .relative).foregroundStyle(.secondary).lineLimit(1)
                } else {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                    Text("Nothing else scheduled").lineLimit(1)
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showFocus) { FocusView(reminder: nil) }
        .sheet(item: $editing) { ReminderEditor(reminder: $0) }
    }
}
