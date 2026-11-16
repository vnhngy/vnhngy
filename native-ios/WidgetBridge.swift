// Carlume · Brücke von der App zum Widget.
// Die App-Oberfläche (JavaScript) übergibt Ort, Umkreis, Sorte und Sprache; das Widget liest sie aus der App-Gruppe.
import Foundation
import UIKit
import SwiftUI
import WidgetKit
import Capacitor

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
    ]

    @objc func save(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else { call.reject("json fehlt"); return }
        let d = CarlumeGroup.defaults
        if d.string(forKey: "snap") != json {
            d.set(json, forKey: "snap")
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve(["group": CarlumeGroup.id])
    }

    @objc func info(_ call: CAPPluginCall) {
        call.resolve(["group": CarlumeGroup.id, "snap": CarlumeGroup.defaults.string(forKey: "snap") ?? ""])
    }
}

/// Startansicht der App: wie die von Capacitor, meldet aber das Widget-Plugin an.
class CarlumeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        WidgetShots.runIfRequested()
    }
}

/// Nur für den Selbsttest im Simulator (Startparameter -carlumeWidgetShots): zeichnet das Widget in allen Größen als Bilder
/// in den Dokumente-Ordner der App, damit man es ohne echtes iPhone ansehen kann.
enum WidgetShots {
    static func runIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains("-carlumeWidgetShots") else { return }
        if #available(iOS 17.0, *) {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 6_000_000_000)   // App meldet in der Zeit ihren Ort ans Widget
                await render()
            }
        }
    }

    @available(iOS 17.0, *)
    @MainActor
    static func render() async {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        var entries: [(String, CarlumeEntry)] = [("muster", .sample(lang: "de"))]
        entries.append(("app", await CarlumeLoader.entry(fuelOverride: nil, place: nil)))
        entries.append(("plz-diesel", await CarlumeLoader.entry(fuelOverride: "diesel", place: "74072")))
        entries.append(("leer", CarlumeEntry(date: Date(), data: nil, message: "Öffne Carlume einmal und wähle deinen Ort. Oder: Widget gedrückt halten → Widget bearbeiten → Ort eintragen.", lang: "de")))
        let sizes: [(WidgetFamily, CGSize)] = [
            (.systemSmall, CGSize(width: 170, height: 170)),
            (.systemMedium, CGSize(width: 364, height: 170)),
            (.accessoryRectangular, CGSize(width: 172, height: 76)),
            (.accessoryCircular, CGSize(width: 76, height: 76)),
            (.accessoryInline, CGSize(width: 260, height: 26)),
        ]
        var log = "gruppe \(CarlumeGroup.id)\nsnap \(CarlumeGroup.defaults.string(forKey: "snap") ?? "-")\n"
        for (name, e) in entries {
            if let d = e.data {
                let first = d.rows.first.map { r in r.title + " " + String(r.price) } ?? ""
                log += name + ": " + d.place + " " + d.fuel + " " + String(d.rows.count) + "/" + String(d.count) + " " + first + "\n"
            } else {
                log += name + ": " + (e.message ?? "-") + "\n"
            }
            for scheme in [ColorScheme.dark, ColorScheme.light] {
                for (fam, size) in sizes {
                    let card = PreviewCard(entry: e, family: fam, size: size).environment(\.colorScheme, scheme)
                    let r = ImageRenderer(content: card)
                    r.scale = 3
                    if let img = r.uiImage, let png = img.pngData() {
                        try? png.write(to: docs.appendingPathComponent("widget-\(name)-\(fam)-\(scheme).png"))
                    }
                }
            }
        }
        try? log.write(to: docs.appendingPathComponent("widget-log.txt"), atomically: true, encoding: .utf8)
    }
}

@available(iOS 17.0, *)
private struct PreviewCard: View {
    let entry: CarlumeEntry
    let family: WidgetFamily
    let size: CGSize

    var body: some View {
        switch family {
        case .systemSmall, .systemMedium:
            CarlumeWidgetView(entry: entry, family: family)
                .padding(16)
                .frame(width: size.width, height: size.height)
                .background(CarlumeBackground())
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding(10)
                .background(Color(white: 0.5))
        default:
            CarlumeWidgetView(entry: entry, family: family)
                .frame(width: size.width, height: size.height)
                .foregroundStyle(.white)
                .environment(\.colorScheme, .dark)
                .padding(10)
                .background(Color(red: 0.12, green: 0.14, blue: 0.2))
        }
    }
}
