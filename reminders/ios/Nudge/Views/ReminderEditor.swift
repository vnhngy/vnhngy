import SwiftData
import SwiftUI

struct ReminderEditor: View {
    @Bindable var reminder: Reminder
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \ReminderList.order) private var lists: [ReminderList]
    @Query private var sessions: [FocusSession]
    @State private var newSubtask = ""
    @State private var newTag = ""
    @State private var showFocus = false

    private let earlyOptions = [0, 5, 10, 15, 30, 60, 120, 1440, 2880]
    private let estimateOptions = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $reminder.title, axis: .vertical)
                        .font(.title3.bold())
                    TextField("Notes", text: $reminder.notes, axis: .vertical)
                        .lineLimit(2...6)
                }

                Section("Date & Time") {
                    Toggle(isOn: hasDate) { Label("Date", systemImage: "calendar") }
                    if reminder.due != nil {
                        DatePicker("Day", selection: dueBinding, displayedComponents: .date)
                        Toggle(isOn: hasTime) { Label("Time", systemImage: "clock") }
                        if !reminder.allDay {
                            DatePicker("Time", selection: dueBinding, displayedComponents: .hourAndMinute)
                        }
                        Picker(selection: earlyBinding) {
                            ForEach(options(earlyOptions, including: reminder.earlyMinutes), id: \.self) { Text(Fmt.early($0)).tag($0) }
                        } label: {
                            Label("Alert", systemImage: "bell")
                        }
                    }
                }

                Section("Repeat") {
                    Picker(selection: frequency) {
                        Text("Never").tag(nil as RepeatRule.Frequency?)
                        ForEach(RepeatRule.Frequency.allCases) { Text($0.title).tag(Optional($0)) }
                    } label: {
                        Label("Repeat", systemImage: "repeat")
                    }
                    if let rule = reminder.repeatRule {
                        if rule.frequency != .weekdays {
                            Stepper("Every \(rule.interval) \(rule.frequency.unit)\(rule.interval == 1 ? "" : "s")", value: interval, in: 1...99)
                        }
                        Toggle("End Repeat", isOn: hasUntil)
                        if rule.until != nil {
                            DatePicker("End Date", selection: untilBinding, displayedComponents: .date)
                        }
                    }
                }

                if reminder.repeatRule != nil {
                    Section("Habit · Last 14 Days") { HabitGrid(reminder: reminder) }
                }

                Section {
                    Picker(selection: $reminder.list) {
                        ForEach(lists) { list in
                            Text(list.name).tag(Optional(list))
                        }
                    } label: {
                        Label("List", systemImage: "list.bullet")
                    }
                    Picker("Priority", selection: $reminder.priority) {
                        ForEach(Priority.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Toggle(isOn: $reminder.flagged) {
                        Label("Flagged", systemImage: "flag.fill").foregroundStyle(.orange)
                    }
                    Picker(selection: $reminder.estimateMinutes) {
                        ForEach(options(estimateOptions, including: reminder.estimateMinutes), id: \.self) {
                            Text($0 == 0 ? "None" : Fmt.minutes($0)).tag($0)
                        }
                    } label: {
                        Label("Time Estimate", systemImage: "hourglass")
                    }
                }

                Section("Subtasks") {
                    ForEach($reminder.subtasks) { $step in
                        HStack {
                            Button { step.done.toggle() } label: {
                                Image(systemName: step.done ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(step.done ? Color.accentColor : Color.secondary)
                            }
                            .buttonStyle(.plain)
                            TextField("Step", text: $step.title)
                                .strikethrough(step.done)
                        }
                    }
                    .onDelete { reminder.subtasks.remove(atOffsets: $0) }
                    .onMove { reminder.subtasks.move(fromOffsets: $0, toOffset: $1) }
                    HStack {
                        Image(systemName: "plus.circle.fill").foregroundStyle(.tint)
                        TextField("Add a step", text: $newSubtask)
                            .submitLabel(.next)
                            .onSubmit(addSubtask)
                    }
                }

                Section("Tags") {
                    if !reminder.tags.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(reminder.tags, id: \.self) { tag in
                                    Button {
                                        reminder.tags.removeAll { $0 == tag }
                                    } label: {
                                        Label("#" + tag, systemImage: "xmark")
                                            .labelStyle(TagLabelStyle())
                                    }
                                    .buttonStyle(.glass)
                                    .accessibilityLabel("Remove tag \(tag)")
                                }
                            }
                        }
                    }
                    TextField("Add a tag", text: $newTag)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(addTag)
                }

                Section("Details") {
                    TextField("Location", text: $reminder.location)
                    TextField("Link", text: $reminder.url)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if let url = linkURL {
                        Link(destination: url) { Label("Open Link", systemImage: "safari") }
                    }
                }

                Section {
                    let focused = sessions.filter { $0.reminderID == reminder.uuid }.reduce(0) { $0 + $1.minutes }
                    Button { showFocus = true } label: {
                        Label(focused > 0 ? "Start Focus Timer · \(Fmt.minutes(focused)) so far" : "Start Focus Timer", systemImage: "timer")
                    }
                    if reminder.due != nil && !reminder.isDone {
                        Menu {
                            ForEach(ReminderActions.snoozeChoices, id: \.title) { choice in
                                Button(choice.title) { ReminderActions.snooze(reminder, until: choice.date) }
                            }
                        } label: {
                            Label(snoozeLabel, systemImage: "zzz")
                        }
                    }
                    Button {
                        ReminderActions.duplicate(reminder, context: context)
                        dismiss()
                    } label: {
                        Label("Duplicate", systemImage: "plus.square.on.square")
                    }
                    Button(role: .destructive) {
                        ReminderActions.delete(reminder, context: context)
                        dismiss()
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                } footer: {
                    Text("Created \(reminder.createdAt.formatted(date: .abbreviated, time: .shortened))")
                }
            }
            .scrollContentBackground(.hidden)
            .background { GlassBackdrop() }
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showFocus) { FocusView(reminder: reminder) }
        }
        .onDisappear {
            reminder.updatedAt = .now
            NotificationManager.shared.schedule(reminder)
            ReminderActions.refreshBadge(context)
        }
    }

    private var snoozeLabel: String {
        if let s = reminder.snoozedUntil, s > .now {
            return "Snoozed until " + s.formatted(date: .omitted, time: .shortened)
        }
        return "Snooze"
    }

    private var linkURL: URL? {
        let raw = reminder.url.trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty else { return nil }
        return URL(string: raw.contains("://") ? raw : "https://" + raw)
    }

    private func options(_ base: [Int], including value: Int) -> [Int] {
        Array(Set(base + [value])).sorted()
    }

    private func addSubtask() {
        let t = newSubtask.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        reminder.subtasks.append(Subtask(title: t))
        newSubtask = ""
    }

    private func addTag() {
        let t = newTag.trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "#"))
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
        if !t.isEmpty && !reminder.tags.contains(t) { reminder.tags.append(t) }
        newTag = ""
    }

    // MARK: Bindings that keep due date, time and repeat consistent

    private var hasDate: Binding<Bool> {
        Binding(get: { reminder.due != nil }, set: { on in
            reminder.due = on ? Calendar.current.startOfDay(for: .now) : nil
            reminder.allDay = on
            reminder.snoozedUntil = nil
        })
    }

    private var hasTime: Binding<Bool> {
        Binding(get: { !reminder.allDay }, set: { on in
            guard let d = reminder.due else { return }
            let cal = Calendar.current
            if on {
                reminder.due = cal.date(bySettingHour: AppSettings.allDayHour, minute: 0, second: 0, of: d)
                reminder.allDay = false
            } else {
                reminder.due = cal.startOfDay(for: d)
                reminder.allDay = true
            }
            reminder.snoozedUntil = nil
        })
    }

    private var dueBinding: Binding<Date> {
        Binding(get: { reminder.due ?? .now }, set: { value in
            reminder.due = reminder.allDay ? Calendar.current.startOfDay(for: value) : value
            reminder.snoozedUntil = nil
            if reminder.repeatRule?.frequency == .monthly {
                reminder.repeatRule?.anchorDay = Calendar.current.component(.day, from: value)
            }
        })
    }

    private var earlyBinding: Binding<Int> {
        Binding(get: { reminder.earlyMinutes }, set: { reminder.earlyMinutes = $0; reminder.snoozedUntil = nil })
    }

    private var frequency: Binding<RepeatRule.Frequency?> {
        Binding(get: { reminder.repeatRule?.frequency }, set: { freq in
            guard let freq else { reminder.repeatRule = nil; return }
            if reminder.due == nil {
                reminder.due = Calendar.current.startOfDay(for: .now)
                reminder.allDay = true
            }
            var rule = reminder.repeatRule ?? RepeatRule(frequency: freq)
            rule.frequency = freq
            if freq == .weekdays { rule.interval = 1 }
            rule.anchorDay = freq == .monthly ? reminder.due.map { Calendar.current.component(.day, from: $0) } : nil
            reminder.repeatRule = rule
        })
    }

    private var interval: Binding<Int> {
        Binding(get: { reminder.repeatRule?.interval ?? 1 }, set: { reminder.repeatRule?.interval = $0 })
    }

    private var hasUntil: Binding<Bool> {
        Binding(get: { reminder.repeatRule?.until != nil }, set: { on in
            reminder.repeatRule?.until = on
                ? Calendar.current.date(byAdding: .month, value: 1, to: reminder.due ?? .now)
                : nil
        })
    }

    private var untilBinding: Binding<Date> {
        Binding(get: { reminder.repeatRule?.until ?? .now }, set: { reminder.repeatRule?.until = $0 })
    }
}

/// Puts the icon after the title, for removable tag chips.
struct TagLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.title
            configuration.icon.font(.caption2.weight(.bold))
        }
    }
}
