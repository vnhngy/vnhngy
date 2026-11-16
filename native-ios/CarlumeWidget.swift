// Carlume · Widget für Startbildschirm und Sperrbildschirm (iOS 17+).
// Zeigt die günstigste offene Tankstelle im Umkreis deines Orts aus der App (oder einem im Widget eingetragenen Ort).
import WidgetKit
import SwiftUI
import AppIntents

enum FuelOption: String, AppEnum {
    case app, e5, e10, diesel

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Sorte"
    static var caseDisplayRepresentations: [FuelOption: DisplayRepresentation] = [
        .app: "Wie in der App", .e5: "Super E5", .e10: "Super E10", .diesel: "Diesel",
    ]
}

struct CarlumeIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Spritpreise"
    static var description = IntentDescription("Günstigste Tankstelle in deiner Nähe – aus Carlume.")

    @Parameter(title: "Sorte", default: .app)
    var fuel: FuelOption

    @Parameter(title: "Ort oder PLZ (leer: wie in der App)")
    var place: String?

    init() {}
}

struct CarlumeProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CarlumeEntry { .sample(lang: CarlumeLoader.defaultLang()) }

    func snapshot(for configuration: CarlumeIntent, in context: Context) async -> CarlumeEntry {
        if context.isPreview { return .sample(lang: CarlumeLoader.defaultLang()) }
        return await load(configuration)
    }

    func timeline(for configuration: CarlumeIntent, in context: Context) async -> Timeline<CarlumeEntry> {
        let e = await load(configuration)
        // Die Preise auf dem Server werden alle 15 Minuten abgerufen; das Widget fragt etwa alle 30 Minuten nach.
        let next = Date().addingTimeInterval(e.data == nil ? 15 * 60 : 30 * 60)
        return Timeline(entries: [e], policy: .after(next))
    }

    private func load(_ c: CarlumeIntent) async -> CarlumeEntry {
        await CarlumeLoader.entry(fuelOverride: c.fuel == .app ? nil : c.fuel.rawValue, place: c.place)
    }
}

struct CarlumeEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CarlumeEntry

    var body: some View {
        CarlumeWidgetView(entry: entry, family: family)
            .containerBackground(for: .widget) { CarlumeBackground() }
            .widgetURL(URL(string: "carlume://prices"))
    }
}

struct CarlumePricesWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "CarlumePrices", intent: CarlumeIntent.self, provider: CarlumeProvider()) { entry in
            CarlumeEntryView(entry: entry)
        }
        .configurationDisplayName("Spritpreise")
        .description("Günstigste Tankstelle in deiner Nähe – aus Carlume.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

@main
struct CarlumeWidgets: WidgetBundle {
    var body: some Widget {
        CarlumePricesWidget()
    }
}
