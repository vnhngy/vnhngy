import Foundation

/// Shared App Group configuration used by the main app, the widget extension
/// and the App Intent so they all read/write the same on-device data store.
enum AppGroup {
    /// Must match the App Group configured in both entitlements files.
    /// If you change it, update it in Entitlements/*.entitlements too.
    static let identifier = "group.com.vnhngy.messagestats"

    static var containerURL: URL {
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier) else {
            fatalError("App Group container not found. Enable 'App Groups' capability with identifier \(identifier) for every target.")
        }
        return url
    }

    static var storeURL: URL {
        containerURL.appendingPathComponent("MessageStats.sqlite")
    }
}
