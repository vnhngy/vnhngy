import SwiftData
import SwiftUI

struct ListsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \ReminderList.order) private var lists: [ReminderList]
    @Query private var reminders: [Reminder]
    @State private var showNewList = false
    @State private var editingList: ReminderList?

    private var tags: [String] {
        Array(Set(reminders.filter(\.isActive).flatMap(\.tags))).sorted()
    }

    var body: some View {
        List {
            Section {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(SmartList.allCases) { kind in
                        NavigationLink(value: Destination.smart(kind)) {
                            SmartTile(kind: kind, count: reminders.filter(kind.includes).count)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 6)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            Section("My Lists") {
                ForEach(lists) { list in
                    NavigationLink(value: Destination.list(list)) {
                        HStack {
                            Image(systemName: "list.bullet.circle.fill")
                                .font(.title2)
                                .foregroundStyle(list.color)
                            Text(list.name)
                            Spacer()
                            Text("\(reminders.filter { $0.isActive && $0.list?.persistentModelID == list.persistentModelID }.count)")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .listRowBackground(Rectangle().fill(.regularMaterial))
                    .swipeActions {
                        Button(role: .destructive) { delete(list) } label: { Label("Delete", systemImage: "trash") }
                        Button { editingList = list } label: { Label("Edit", systemImage: "pencil") }
                            .tint(.indigo)
                    }
                    .contextMenu {
                        Button { editingList = list } label: { Label("Edit List", systemImage: "pencil") }
                        Button(role: .destructive) { delete(list) } label: { Label("Delete List", systemImage: "trash") }
                    }
                }
                .onMove(perform: move)
                Button { showNewList = true } label: { Label("Add List", systemImage: "plus") }
                    .listRowBackground(Rectangle().fill(.regularMaterial))
            }

            if !tags.isEmpty {
                Section("Tags") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(tags, id: \.self) { tag in
                                NavigationLink(value: Destination.tag(tag)) {
                                    Text("#" + tag)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 7)
                                        .glassEffect(.regular.interactive(), in: .capsule)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listRowBackground(Color.clear)
            }

            Section {
                NavigationLink(value: Destination.trash) {
                    Label("Recently Deleted", systemImage: "trash")
                }
                .listRowBackground(Rectangle().fill(.regularMaterial))
            }
        }
        .scrollContentBackground(.hidden)
        .background { GlassBackdrop() }
        .navigationTitle("Lists")
        .navigationDestination(for: Destination.self) { FilteredListView(destination: $0) }
        .toolbar { EditButton() }
        .sheet(isPresented: $showNewList) { ListEditor(list: nil, nextOrder: lists.count) }
        .sheet(item: $editingList) { ListEditor(list: $0, nextOrder: lists.count) }
    }

    private func delete(_ list: ReminderList) {
        guard lists.count > 1 else { return }
        for r in list.reminders ?? [] where r.deletedAt == nil {
            ReminderActions.delete(r, context: context)
        }
        context.delete(list)
    }

    private func move(from source: IndexSet, to destination: Int) {
        var ordered = lists
        ordered.move(fromOffsets: source, toOffset: destination)
        for (i, list) in ordered.enumerated() { list.order = i }
    }
}

struct SmartTile: View {
    let kind: SmartList
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: kind.icon)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(kind.color.gradient, in: .circle)
                Spacer()
                Text("\(count)").font(.title.bold()).monospacedDigit()
            }
            Text(kind.title).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 22))
    }
}

struct ListEditor: View {
    let list: ReminderList?
    let nextOrder: Int
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var name = ""
    @State private var color = AppSettings.listColors[0]

    var body: some View {
        NavigationStack {
            Form {
                TextField("List name", text: $name)
                    .font(.title3)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 14) {
                    ForEach(AppSettings.listColors, id: \.self) { hex in
                        Button { color = hex } label: {
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 36, height: 36)
                                .overlay {
                                    if hex == color { Image(systemName: "checkmark").font(.headline).foregroundStyle(.white) }
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(hex == color ? "Selected colour" : "Colour")
                    }
                }
                .padding(.vertical, 6)
            }
            .navigationTitle(list == nil ? "New List" : "Edit List")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(list == nil ? "Create" : "Save") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            if let list {
                name = list.name
                color = list.colorHex
            } else {
                color = AppSettings.listColors[nextOrder % AppSettings.listColors.count]
            }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let list {
            list.name = trimmed
            list.colorHex = color
        } else {
            context.insert(ReminderList(name: trimmed, colorHex: color, order: nextOrder))
        }
        dismiss()
    }
}

struct FilteredListView: View {
    let destination: Destination
    @Environment(\.modelContext) private var context
    @Query(sort: \Reminder.createdAt) private var reminders: [Reminder]
    @State private var editing: Reminder?
    @State private var showAdd = false
    @State private var showCompleted = false
    @State private var confirmEmpty = false

    private var isTrash: Bool { destination == .trash }
    private var isList: Bool {
        if case .list = destination { return true }
        return false
    }

    private var title: String {
        switch destination {
        case .smart(let kind): kind.title
        case .list(let list): list.name
        case .tag(let tag): "#" + tag
        case .trash: "Recently Deleted"
        }
    }

    private var addContext: AddContext {
        switch destination {
        case .smart(.today), .smart(.overdue): .today
        case .smart(.scheduled): .day(Calendar.current.startOfTomorrow)
        case .smart(.flagged): .flagged
        case .list(let list): .list(list)
        case .tag(let tag): .tag(tag)
        default: .none
        }
    }

    private var items: [Reminder] {
        switch destination {
        case .smart(.completed):
            return reminders.filter(SmartList.completed.includes)
                .sorted { ($0.doneAt ?? .distantPast) > ($1.doneAt ?? .distantPast) }
        case .smart(let kind):
            return reminders.filter(kind.includes).sorted(by: Sorts.due)
        case .list(let list):
            return reminders.filter {
                $0.deletedAt == nil && (showCompleted || !$0.isDone) && $0.list?.persistentModelID == list.persistentModelID
            }
            .sorted(by: Sorts.due)
        case .tag(let tag):
            return reminders.filter { $0.deletedAt == nil && (showCompleted || !$0.isDone) && $0.tags.contains(tag) }
                .sorted(by: Sorts.due)
        case .trash:
            return reminders.filter { $0.deletedAt != nil }
                .sorted { ($0.deletedAt ?? .distantPast) > ($1.deletedAt ?? .distantPast) }
        }
    }

    var body: some View {
        List {
            if items.isEmpty {
                ContentUnavailableView(
                    isTrash ? "Nothing deleted" : "All clear",
                    systemImage: isTrash ? "trash" : "checkmark.circle",
                    description: Text(isTrash ? "Deleted reminders stay here for 30 days." : "Nothing here right now.")
                )
                .listRowBackground(Color.clear)
            } else if isTrash {
                Section {
                    ForEach(items) { r in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.title.isEmpty ? "Untitled" : r.title)
                            if let deleted = r.deletedAt {
                                Text("Deleted \(deleted.formatted(date: .abbreviated, time: .shortened))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .listRowBackground(Rectangle().fill(.regularMaterial))
                        .swipeActions(edge: .leading) {
                            Button { ReminderActions.restore(r, context: context) } label: {
                                Label("Restore", systemImage: "arrow.uturn.backward")
                            }
                            .tint(.green)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) { ReminderActions.purge(r, context: context) } label: {
                                Label("Delete Now", systemImage: "trash")
                            }
                        }
                    }
                } footer: {
                    Text("Swipe right to restore. Reminders are removed for good after 30 days.")
                }
            } else if destination == .smart(.completed) {
                Section { ReminderRows(items: items, editing: $editing) }
            } else {
                ForEach(DateGroups.make(items), id: \.title) { group in
                    Section(group.title) {
                        ReminderRows(items: group.items, showList: !isList, editing: $editing)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { GlassBackdrop() }
        .navigationTitle(title)
        .toolbar {
            if isTrash {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Empty", role: .destructive) { confirmEmpty = true }
                        .disabled(items.isEmpty)
                }
            } else if destination != .smart(.completed) {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Toggle("Show Completed", isOn: $showCompleted)
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("New reminder")
                }
            }
        }
        .confirmationDialog("Delete \(items.count) reminders for good?", isPresented: $confirmEmpty, titleVisibility: .visible) {
            Button("Delete All", role: .destructive) {
                for r in items { ReminderActions.purge(r, context: context) }
            }
        } message: {
            Text("This can't be undone.")
        }
        .sheet(isPresented: $showAdd) { QuickAddSheet(addContext: addContext) }
        .sheet(item: $editing) { ReminderEditor(reminder: $0) }
    }
}
