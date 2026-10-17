import SwiftData
import SwiftUI

/// Where a new reminder is being added from, which decides its defaults.
enum AddContext {
    case none
    case today
    case day(Date)
    case list(ReminderList)
    case flagged
    case tag(String)
}

struct QuickAddSheet: View {
    var addContext: AddContext = .none
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \ReminderList.order) private var lists: [ReminderList]
    @State private var text = ""
    @FocusState private var focused: Bool

    private var parsed: ParsedReminder { QuickParser.parse(text, listNames: lists.map(\.name)) }
    private var isEmpty: Bool { text.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                TextField("Call dentist tomorrow 3pm !high #health", text: $text)
                    .font(.title3)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(add)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .glassEffect(.regular.interactive(), in: .capsule)
                if isEmpty {
                    Text("Type it the way you'd say it: “fri 9am”, “in 2 hours”, “every week”. Add !! for priority, #tag, @list, * to flag and ~30m for an estimate.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ChipsRow(chips: parsed.chips)
                }
                Spacer(minLength: 0)
            }
            .padding()
            .navigationTitle("New Reminder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: add).disabled(isEmpty)
                }
            }
        }
        .presentationDetents([.height(260), .medium])
        .onAppear { focused = true }
    }

    private func add() {
        let raw = text.trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty else { return }
        let p = parsed
        let cal = Calendar.current
        let r = Reminder(title: p.title.isEmpty ? raw : p.title)
        context.insert(r)
        r.due = p.due
        r.allDay = p.allDay
        r.priority = p.priority
        r.flagged = p.flagged
        r.tags = p.tags
        r.repeatRule = p.repeatRule
        r.estimateMinutes = p.estimate
        if let early = p.early { r.earlyMinutes = early }
        if let name = p.listName { r.list = lists.first { $0.name == name } }

        switch addContext {
        case .today:
            if r.due == nil { r.due = cal.startOfDay(for: .now); r.allDay = true }
        case .day(let day):
            if r.due == nil { r.due = cal.startOfDay(for: day); r.allDay = true }
        case .list(let list):
            if r.list == nil { r.list = list }
        case .flagged:
            r.flagged = true
        case .tag(let tag):
            if !r.tags.contains(tag) { r.tags.append(tag) }
        case .none:
            break
        }
        if r.list == nil { r.list = lists.first }
        NotificationManager.shared.schedule(r)
        ReminderActions.refreshBadge(context)
        dismiss()
    }
}
