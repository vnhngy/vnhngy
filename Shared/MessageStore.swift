import Foundation
import SwiftData
import WidgetKit

/// Thin persistence layer around a SwiftData store that lives inside the
/// shared App Group container, so the app, the widget extension and the
/// App Intent (triggered from a Shortcuts automation) all see the same data.
enum MessageStore {
    static func makeContainer() -> ModelContainer {
        let schema = Schema([MessageEvent.self])
        let configuration = ModelConfiguration(schema: schema, url: AppGroup.storeURL)
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }

    @discardableResult
    static func logMessage(sender: String?, date: Date = .now) -> Bool {
        let container = makeContainer()
        let context = ModelContext(container)
        let event = MessageEvent(timestamp: date, sender: sender)
        context.insert(event)
        do {
            try context.save()
            WidgetCenter.shared.reloadAllTimelines()
            return true
        } catch {
            print("MessageStore: failed to log message: \(error)")
            return false
        }
    }

    static func fetchAllEvents() -> [MessageEvent] {
        let container = makeContainer()
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<MessageEvent>(sortBy: [SortDescriptor(\.timestamp, order: .reverse)])
        do {
            return try context.fetch(descriptor)
        } catch {
            print("MessageStore: failed to fetch events: \(error)")
            return []
        }
    }

    static func deleteAllEvents() {
        let container = makeContainer()
        let context = ModelContext(container)
        do {
            try context.delete(model: MessageEvent.self)
            try context.save()
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            print("MessageStore: failed to delete events: \(error)")
        }
    }
}
