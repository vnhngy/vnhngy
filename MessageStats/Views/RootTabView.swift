import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Übersicht", systemImage: "chart.bar.fill") }
            ChartsView()
                .tabItem { Label("Charts", systemImage: "chart.xyaxis.line") }
            SendersView()
                .tabItem { Label("Kontakte", systemImage: "person.2.fill") }
            SettingsView()
                .tabItem { Label("Einstellungen", systemImage: "gear") }
        }
    }
}
