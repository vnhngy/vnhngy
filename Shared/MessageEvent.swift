import Foundation
import SwiftData

/// A single "message received" event. Only a timestamp and an optional
/// sender label are stored — never the message content — so the data
/// stays lightweight and privacy-friendly.
@Model
final class MessageEvent {
    var timestamp: Date
    var sender: String?

    init(timestamp: Date = .now, sender: String? = nil) {
        self.timestamp = timestamp
        self.sender = sender
    }
}
