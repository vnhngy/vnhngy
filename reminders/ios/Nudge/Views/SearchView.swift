import SwiftData
import SwiftUI

/// Search with the same filter words as the web and desktop versions:
/// is:overdue, is:flagged, is:done, is:today, is:repeating, #tag, list:work, p:high, and "-" to exclude.
enum SearchFilter {
    static func matches(_ r: Reminder, query: String) -> Bool {
        var words: [String] = []
        for token in query.lowercased().split(separator: " ").map(String.init) {
            var t = token
            let negate = t.hasPrefix("-") && t.count > 1
            if negate { t.removeFirst() }
            if let result = test(r, token: t) {
                if result == negate { return false }
            } else {
                words.append(token)
            }
        }
        guard !words.isEmpty else { return true }
        let haystack = ([r.title, r.notes, r.location] + r.tags + r.subtasks.map(\.title)).joined(separator: "\n").lowercased()
        return haystack.contains(words.joined(separator: " "))
    }

    /// nil when the token is not a filter.
    private static func test(_ r: Reminder, token t: String) -> Bool? {
        if t.hasPrefix("#") { return r.tags.contains { $0.hasPrefix(String(t.dropFirst())) } }
        let parts = t.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }
        let value = parts[1]
        switch parts[0] {
        case "is":
            switch value {
            case "overdue": return r.isOverdue
            case "flagged": return r.flagged
            case "done", "completed": return r.isDone
            case "open": return !r.isDone
            case "today": return r.isDueToday
            case "repeating": return r.repeatRule != nil
            case "undated": return r.due == nil
            default: return false
            }
        case "tag": return r.tags.contains { $0.hasPrefix(value) }
        case "list": return (r.list?.name.lowercased().replacingOccurrences(of: " ", with: "-") ?? "").hasPrefix(value)
        case "p", "priority":
            let map = ["high": 3, "h": 3, "medium": 2, "med": 2, "m": 2, "low": 1, "l": 1, "none": 0]
            return r.priorityRaw == (map[value] ?? Int(value) ?? -1)
        case "has":
            switch value {
            case "notes": return !r.notes.isEmpty
            case "subtasks", "steps": return !r.subtasks.isEmpty
            case "link", "url": return !r.url.isEmpty
            case "location": return !r.location.isEmpty
            case "estimate": return r.estimateMinutes > 0
            default: return false
            }
        default:
            return nil
        }
    }
}

struct SearchView: View {
    @Query(sort: \Reminder.createdAt) private var reminders: [Reminder]
    @State private var query = ""
    @State private var editing: Reminder?

    private var results: [Reminder] {
        let wantsDone = query.lowercased().contains("is:done") || query.lowercased().contains("is:completed")
        return reminders
            .filter { $0.deletedAt == nil && (wantsDone || !$0.isDone) && SearchFilter.matches($0, query: query) }
            .sorted(by: Sorts.due)
    }

    private let examples = ["is:overdue", "is:flagged", "#health", "p:high", "is:repeating", "has:notes", "is:done"]

    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespaces).isEmpty {
                Section("Filters") {
                    ForEach(examples, id: \.self) { example in
                        Button { query = example } label: {
                            Label(example, systemImage: "line.3.horizontal.decrease.circle")
                        }
                        .listRowBackground(Rectangle().fill(.regularMaterial))
                    }
                }
            } else if results.isEmpty {
                ContentUnavailableView.search(text: query)
                    .listRowBackground(Color.clear)
            } else {
                Section("\(results.count) found") {
                    ReminderRows(items: results, editing: $editing)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { GlassBackdrop() }
        .navigationTitle("Search")
        .searchable(text: $query, prompt: "Search or filter, e.g. #work is:overdue")
        .textInputAutocapitalization(.never)
        .sheet(item: $editing) { ReminderEditor(reminder: $0) }
    }
}
