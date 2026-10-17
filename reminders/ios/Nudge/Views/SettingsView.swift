import SwiftData
import SwiftUI
import UIKit
import UserNotifications

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @AppStorage("allDayHour") private var allDayHour = 9
    @AppStorage("defaultEarly") private var defaultEarly = 0
    @AppStorage("focusMinutes") private var focusMinutes = 25
    @State private var status: UNAuthorizationStatus = .notDetermined
    @Query(sort: \Reminder.createdAt) private var reminders: [Reminder]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("All-day alert time", selection: $allDayHour) {
                        ForEach(5..<23, id: \.self) { hour in
                            Text(hourLabel(hour)).tag(hour)
                        }
                    }
                    Picker("Default alert", selection: $defaultEarly) {
                        ForEach([0, 5, 10, 15, 30, 60, 1440], id: \.self) { Text(Fmt.early($0)).tag($0) }
                    }
                    HStack {
                        Text("Notifications")
                        Spacer()
                        Text(statusText).foregroundStyle(.secondary)
                    }
                    if status == .denied {
                        Button("Turn On in Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }
                    }
                } header: {
                    Text("Alerts")
                } footer: {
                    Text("Reminders without a time alert you at the all-day time. Long-press a notification to mark it done or snooze it.")
                }

                Section("Focus") {
                    Picker("Default length", selection: $focusMinutes) {
                        ForEach([5, 15, 25, 45, 60, 90], id: \.self) { Text("\($0) min").tag($0) }
                    }
                }

                Section("Your Data") {
                    ShareLink(item: exportText, preview: SharePreview("Nudge reminders")) {
                        Label("Export as Text", systemImage: "square.and.arrow.up")
                    }
                }

                Section {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task {
                status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            }
            .onChange(of: allDayHour) {
                Task { await NotificationManager.shared.rescheduleAll(reminders) }
            }
        }
    }

    private var statusText: String {
        switch status {
        case .authorized, .provisional, .ephemeral: "On"
        case .denied: "Off"
        default: "Not set"
        }
    }

    private func hourLabel(_ hour: Int) -> String {
        let date = Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: .now) ?? .now
        return date.formatted(date: .omitted, time: .shortened)
    }

    private var exportText: String {
        reminders.filter { $0.deletedAt == nil }.sorted(by: Sorts.due).map { r in
            var line = (r.isDone ? "[x] " : "[ ] ") + r.title
            if r.due != nil { line += " · " + Fmt.due(r) }
            if let list = r.list { line += " · " + list.name }
            if !r.tags.isEmpty { line += " · " + r.tags.map { "#" + $0 }.joined(separator: " ") }
            return line
        }
        .joined(separator: "\n")
    }
}
