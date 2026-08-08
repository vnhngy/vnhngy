import SwiftUI

struct SettingsView: View {
    @State private var showResetConfirmation = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Automatische Erfassung einrichten") {
                    VStack(alignment: .leading, spacing: 8) {
                        setupStep(1, "Öffne die Kurzbefehle-App")
                        setupStep(2, "Automation → „+“ → Neue persönliche Automation → Nachricht")
                        setupStep(3, "Wähle „Wenn ich eine Nachricht erhalte“, dann „Fertig“")
                        setupStep(4, "Füge die Aktion „Nachricht protokollieren“ (Message Stats) hinzu")
                        setupStep(5, "Optional: Übergib die Variable „Absender“ an den Parameter „Absender“, um Top-Kontakte zu sehen")
                        setupStep(6, "Deaktiviere „Vor Ausführung fragen“, damit es lautlos im Hintergrund läuft")
                    }
                    .font(.footnote)
                }

                Section("Lock Screen Widget hinzufügen") {
                    Text("Sperrbildschirm gedrückt halten → Anpassen → Widget hinzufügen → „Message Stats“ auswählen. So siehst du deine Nachrichtenzahl auch bei gesperrtem iPhone.")
                        .font(.footnote)
                }

                Section("Datenschutz") {
                    Text("Gespeichert werden nur Zeitpunkt und optional ein Absendername – niemals der Nachrichteninhalt. Alle Daten bleiben lokal auf deinem Gerät in einem App-Gruppen-Speicher.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button("Alle Daten zurücksetzen", role: .destructive) {
                        showResetConfirmation = true
                    }
                }
            }
            .navigationTitle("Einstellungen")
            .confirmationDialog("Wirklich alle Daten löschen?", isPresented: $showResetConfirmation, titleVisibility: .visible) {
                Button("Löschen", role: .destructive) {
                    MessageStore.deleteAllEvents()
                }
                Button("Abbrechen", role: .cancel) {}
            }
        }
    }

    private func setupStep(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("\(number).").fontWeight(.semibold)
            Text(text)
        }
    }
}
