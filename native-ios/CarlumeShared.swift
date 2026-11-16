// Carlume · gemeinsamer Teil für App und Widget: Ort aus der App (App-Gruppe), Preise vom Server, Ansicht des Widgets.
// Wird in beide Ziele eingebaut (App: Plugin und Vorschaubilder für den Selbsttest, Widget: Anzeige).
import Foundation
import SwiftUI
import WidgetKit
import CoreLocation

// MARK: - App-Gruppe (geteilter Speicher zwischen App und Widget)

enum CarlumeGroup {
    static let fallback = "group.de.vinhnguyen.carlume"

    /// Name der App-Gruppe. Beim Signieren (z. B. mit Sideloadly) kann er geändert werden;
    /// deshalb zuerst aus dem eingebetteten Profil lesen, sonst der feste Name.
    static let id: String = {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let raw = try? Data(contentsOf: url),
              let text = String(data: raw, encoding: .isoLatin1),
              let a = text.range(of: "<?xml"),
              let b = text.range(of: "</plist>"),
              let xml = String(text[a.lowerBound..<b.upperBound]).data(using: .isoLatin1),
              let plist = try? PropertyListSerialization.propertyList(from: xml, options: [], format: nil) as? [String: Any],
              let ent = plist["Entitlements"] as? [String: Any],
              let groups = ent["com.apple.security.application-groups"] as? [String],
              !groups.isEmpty
        else { return fallback }
        return groups.first(where: { $0.lowercased().contains("carlume") }) ?? groups[0]
    }()

    static var defaults: UserDefaults { UserDefaults(suiteName: id) ?? .standard }
}

// MARK: - Was die App dem Widget mitgibt

struct CarlumeSnap: Codable {
    var v: Int?
    var query: String
    var place: String?
    var lat: Double
    var lng: Double
    var rad: Double
    var fuel: String
    var lang: String

    static func load() -> CarlumeSnap? {
        guard let s = CarlumeGroup.defaults.string(forKey: "snap"), let d = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(CarlumeSnap.self, from: d)
    }
}

// MARK: - Daten vom Server

struct RawStation: Decodable {
    var id = "", name = "", brand = "", street = "", nr = "", city = ""
    var lat: Double? = nil
    var lng: Double? = nil
    var open = true
    var price: [String: Double] = [:]

    enum K: String, CodingKey { case id, name, brand, street, nr, city, lat, lng, open, e5, e10, diesel }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        func str(_ k: K) -> String {
            if let s = try? c.decode(String.self, forKey: k) { return s }
            if let d = try? c.decode(Double.self, forKey: k) { return d == d.rounded() ? String(Int(d)) : String(d) }
            return ""
        }
        func num(_ k: K) -> Double? {
            if let d = try? c.decode(Double.self, forKey: k) { return d }
            if let s = try? c.decode(String.self, forKey: k) { return Double(s) }
            return nil
        }
        id = str(.id); name = str(.name); brand = str(.brand); street = str(.street); nr = str(.nr); city = str(.city)
        lat = num(.lat); lng = num(.lng)
        open = (try? c.decode(Bool.self, forKey: .open)) ?? true
        for (k, f) in [(K.e5, "e5"), (K.e10, "e10"), (K.diesel, "diesel")] {
            if let v = num(k), v > 0.5 { price[f] = v }
        }
    }
}

struct RegionRow: Decodable {
    var ts: Double?
    var stations: [RawStation]?
}

struct WRow: Codable, Hashable {
    var title: String
    var sub: String
    var price: Double
    var dist: Double
}

struct WData: Codable {
    var place: String
    var fuel: String
    var rows: [WRow]
    var count: Int
    var ts: Date
}

enum CarlumeAPI {
    static let base = "https://mcihdwskqdljescdiinr.supabase.co"
    static let apiKey = "sb_publishable_ijaVxe5ZB9EP-11GiY9-cQ_VCOocDVo"

    /// Gleiche Regel wie in der App: Raster aus 0,06° × 0,09°, Umkreis bis 5 km → r10, sonst r15.
    static func regionKey(lat: Double, lng: Double, rad: Double) -> String {
        "r\(rad <= 5 ? 10 : 15)-\(Int(floor(lat / 0.06)))-\(Int(floor(lng / 0.09)))"
    }

    static func region(_ key: String) async throws -> RegionRow? {
        var comp = URLComponents(string: base + "/rest/v1/regions")!
        comp.queryItems = [
            URLQueryItem(name: "key", value: "eq." + key),
            URLQueryItem(name: "select", value: "ts:data->ts,stations:data->stations"),
        ]
        var req = URLRequest(url: comp.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        req.setValue(apiKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let h = resp as? HTTPURLResponse, h.statusCode != 200 { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode([RegionRow].self, from: data).first
    }

    static func distKm(_ a: Double, _ b: Double, _ c: Double, _ d: Double) -> Double {
        let p = Double.pi / 180
        let h = pow(sin((c - a) * p / 2), 2) + cos(a * p) * cos(c * p) * pow(sin((d - b) * p / 2), 2)
        return 12742 * asin(min(1, sqrt(h)))
    }

    static func compute(_ row: RegionRow, lat: Double, lng: Double, rad: Double, fuel: String, place: String) -> WData {
        var list: [WRow] = []
        for s in row.stations ?? [] {
            guard let sl = s.lat, let sg = s.lng, s.open, let p = s.price[fuel] else { continue }
            let d = distKm(lat, lng, sl, sg)
            guard d <= rad + 1e-9 else { continue }
            let brand = CarlumeText.tcase(s.brand, brand: s.brand)
            let title = brand.isEmpty ? CarlumeText.tcase(s.name, brand: s.brand) : brand
            let street = CarlumeText.tcase([s.street, s.nr].filter { !$0.isEmpty }.joined(separator: " "), brand: s.brand)
            let sub = street.isEmpty ? CarlumeText.tcase(s.city, brand: s.brand) : street
            list.append(WRow(title: title, sub: sub, price: p, dist: d))
        }
        list.sort { $0.price != $1.price ? $0.price < $1.price : $0.dist < $1.dist }
        let ts = row.ts.map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        return WData(place: place, fuel: fuel, rows: Array(list.prefix(4)), count: list.count, ts: ts)
    }
}

// MARK: - Texte und Formate

enum CarlumeText {
    static let keepUp: Set<String> = ["JET", "ESSO", "ARAL", "AGIP", "ENI", "BFT", "OMV", "AVIA", "HEM", "TSR", "RAN", "MTB", "BP", "ED", "TP", "AG", "KG", "UG", "SB", "LPG", "CNG", "DEA", "ADAC", "II", "III"]
    static let word = try! NSRegularExpression(pattern: "[A-ZÄÖÜ][A-ZÄÖÜß]*")

    /// Namen aus GROSSBUCHSTABEN lesbar schreiben (wie in der App): „JET HEILBRONN OSTSTR. 106“ → „JET Heilbronn Oststr. 106“.
    static func tcase(_ s: String, brand: String) -> String {
        guard s.range(of: "[A-ZÄÖÜ]{3}", options: .regularExpression) != nil,
              s.range(of: "[a-zäöüß]", options: .regularExpression) == nil else { return s }
        let bu = brand.trimmingCharacters(in: .whitespaces).uppercased()
        var out = ""
        var last = s.startIndex
        for m in word.matches(in: s, range: NSRange(s.startIndex..., in: s)) {
            guard let r = Range(m.range, in: s) else { continue }
            out += s[last..<r.lowerBound]
            let w = String(s[r])
            if keepUp.contains(w) || (!bu.isEmpty && w == bu) {
                out += w
            } else {
                let l = w.lowercased()
                out += l.prefix(1).uppercased() + l.dropFirst()
            }
            last = r.upperBound
        }
        out += s[last...]
        return out.replacingOccurrences(of: "Gmbh", with: "GmbH")
    }

    static func fuelShort(_ f: String) -> String { f == "diesel" ? "Diesel" : f.uppercased() }
    static func fuelLong(_ f: String) -> String { f == "diesel" ? "Diesel" : (f == "e10" ? "Super E10" : "Super E5") }

    /// 1.879 → ("1,87", "9") bzw. ("1.87", "9") auf Englisch
    static func priceParts(_ p: Double, lang: String) -> (String, String) {
        let s = String(format: "%.3f", p)
        let main = String(s.dropLast())
        return (lang == "de" ? main.replacingOccurrences(of: ".", with: ",") : main, String(s.suffix(1)))
    }
    static func price(_ p: Double, lang: String) -> String {
        let (a, b) = priceParts(p, lang: lang)
        return a + b
    }
    static func km(_ d: Double, lang: String) -> String {
        let s = String(format: "%.1f km", d)
        return lang == "de" ? s.replacingOccurrences(of: ".", with: ",") : s
    }
    static func time(_ d: Date, lang: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: lang == "de" ? "de_DE" : "en_GB")
        f.dateFormat = Calendar.current.isDateInToday(d) ? "HH:mm" : "dd.MM. HH:mm"
        return (lang == "de" ? "Stand " : "As of ") + f.string(from: d)
    }
    static func t(_ lang: String, _ de: String, _ en: String) -> String { lang == "de" ? de : en }
}

// MARK: - Laden (für Widget und Vorschau)

struct CarlumeEntry: TimelineEntry {
    let date: Date
    let data: WData?
    let message: String?
    let lang: String
    var stale = false

    static func sample(lang: String = "de", fuel: String = "e5") -> CarlumeEntry {
        let rows = [
            WRow(title: "JET", sub: "Oststr. 106", price: 1.879, dist: 0.9),
            WRow(title: "Kaufland", sub: "Rötelstraße 35", price: 1.889, dist: 3.0),
            WRow(title: "ARAL", sub: "Weinsberger Str. 72", price: 1.909, dist: 1.6),
            WRow(title: "Shell", sub: "Neckarsulmer Str. 2", price: 1.929, dist: 2.4),
        ]
        return CarlumeEntry(date: Date(), data: WData(place: "Heilbronn", fuel: fuel, rows: rows, count: 19, ts: Date()), message: nil, lang: lang)
    }
}

enum CarlumeLoader {
    static func defaultLang() -> String {
        if let l = CarlumeSnap.load()?.lang { return l }
        return (Locale.preferredLanguages.first ?? "de").hasPrefix("de") ? "de" : "en"
    }

    static func entry(fuelOverride: String?, place customPlace: String?) async -> CarlumeEntry {
        let snap = CarlumeSnap.load()
        let lang = snap?.lang ?? defaultLang()
        func msg(_ de: String, _ en: String) -> CarlumeEntry {
            CarlumeEntry(date: Date(), data: nil, message: CarlumeText.t(lang, de, en), lang: lang)
        }
        var lat = 0.0, lng = 0.0, rad = 5.0, label = ""
        if let p = customPlace?.trimmingCharacters(in: .whitespacesAndNewlines), !p.isEmpty {
            guard let c = await geocode(p) else { return msg("„\(p)“ nicht gefunden. Halte das Widget gedrückt → Widget bearbeiten.", "“\(p)” not found. Touch and hold the widget → Edit Widget.") }
            lat = c.latitude; lng = c.longitude; rad = 5; label = p
        } else if let s = snap {
            lat = s.lat; lng = s.lng; rad = max(1, min(10, s.rad))
            label = s.place ?? CarlumeText.t(lang, "Mein Standort", "My location")
        } else {
            return msg("Öffne Carlume einmal und wähle deinen Ort. Oder: Widget gedrückt halten → Widget bearbeiten → Ort eintragen.",
                       "Open Carlume once and choose your place. Or: touch and hold the widget → Edit Widget → enter a place.")
        }
        let fuel = fuelOverride ?? snap?.fuel ?? "e5"
        let key = CarlumeAPI.regionKey(lat: lat, lng: lng, rad: rad)
        let cacheKey = "w:\(key):\(fuel):\(Int(rad)):\(label)"
        do {
            guard let row = try await CarlumeAPI.region(key), row.stations != nil else {
                return msg("Für \(label) hat Carlume noch keine Preise. Öffne den Ort einmal in der App.", "Carlume has no prices for \(label) yet. Open the place once in the app.")
            }
            let d = CarlumeAPI.compute(row, lat: lat, lng: lng, rad: rad, fuel: fuel, place: label)
            if let enc = try? JSONEncoder().encode(d) { UserDefaults.standard.set(enc, forKey: cacheKey) }
            if d.rows.isEmpty {
                return msg("Gerade keine offene Tankstelle mit \(CarlumeText.fuelShort(fuel)) im Umkreis von \(Int(rad)) km.", "No open station with \(CarlumeText.fuelShort(fuel)) within \(Int(rad)) km right now.")
            }
            return CarlumeEntry(date: Date(), data: d, message: nil, lang: lang)
        } catch {
            if let enc = UserDefaults.standard.data(forKey: cacheKey), let d = try? JSONDecoder().decode(WData.self, from: enc) {
                return CarlumeEntry(date: Date(), data: d, message: nil, lang: lang, stale: true)
            }
            return msg("Keine Verbindung. Das Widget versucht es gleich wieder.", "No connection. The widget will try again shortly.")
        }
    }

    static func geocode(_ q: String) async -> CLLocationCoordinate2D? {
        let k = "geo:" + q.lowercased()
        if let a = UserDefaults.standard.array(forKey: k) as? [Double], a.count == 2 {
            return CLLocationCoordinate2D(latitude: a[0], longitude: a[1])
        }
        let geocoder = CLGeocoder()
        let timer = Task { try? await Task.sleep(nanoseconds: 12_000_000_000); geocoder.cancelGeocode() }
        defer { timer.cancel() }
        guard let marks = try? await geocoder.geocodeAddressString(q + ", Deutschland"),
              let c = marks.first?.location?.coordinate else { return nil }
        UserDefaults.standard.set([c.latitude, c.longitude], forKey: k)
        return c
    }
}

// MARK: - Aussehen (wie die App: dunkles Nachtblau mit farbigem Schimmer, Akzent Blau)

struct CarlumeBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let dark = scheme == .dark
        ZStack {
            LinearGradient(colors: dark ? [Color(red: 0.047, green: 0.059, blue: 0.09), Color(red: 0.02, green: 0.027, blue: 0.043)]
                                        : [Color(red: 0.933, green: 0.945, blue: 0.969), Color(red: 0.89, green: 0.906, blue: 0.937)],
                           startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Color(red: 0.3, green: 0.45, blue: 1).opacity(dark ? 0.42 : 0.30), .clear], center: .topTrailing, startRadius: 0, endRadius: 190)
            RadialGradient(colors: [Color(red: 0.16, green: 0.78, blue: 0.69).opacity(dark ? 0.20 : 0.22), .clear], center: .bottomLeading, startRadius: 0, endRadius: 170)
        }
    }
}

struct CarlumePalette {
    let dark: Bool
    var fg: Color { dark ? Color(red: 0.95, green: 0.96, blue: 0.97) : Color(red: 0.06, green: 0.07, blue: 0.1) }
    var muted: Color { fg.opacity(dark ? 0.6 : 0.58) }
    var accent: Color { dark ? Color(red: 0.42, green: 0.6, blue: 1.0) : Color(red: 0.184, green: 0.357, blue: 0.827) }
    var chip: Color { fg.opacity(dark ? 0.12 : 0.08) }
}

struct PriceText: View {
    let price: Double
    let lang: String
    let size: CGFloat
    var body: some View {
        let (main, last) = CarlumeText.priceParts(price, lang: lang)
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(main).font(.system(size: size, weight: .semibold, design: .rounded)).monospacedDigit()
            Text(last).font(.system(size: size * 0.52, weight: .semibold, design: .rounded)).baselineOffset(size * 0.36)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

extension View {
    @ViewBuilder func carlumeAccentable() -> some View {
        if #available(iOS 16.0, *) { self.widgetAccentable() } else { self }
    }
}

/// Inhalt des Widgets für jede Größe. Hintergrund setzt der Aufrufer (Widget: containerBackground, Vorschau: eigener Rahmen).
@available(iOS 16.0, *)
struct CarlumeWidgetView: View {
    let entry: CarlumeEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let pal = CarlumePalette(dark: scheme == .dark)
        if let d = entry.data, let best = d.rows.first {
            switch family {
            case .accessoryInline:
                Text("\(CarlumeText.fuelShort(d.fuel)) \(CarlumeText.price(best.price, lang: entry.lang)) € · \(best.title)")
            case .accessoryCircular:
                circular(d, best)
            case .accessoryRectangular:
                rectangular(d, best)
            case .systemMedium:
                medium(d, best, pal)
            default:
                small(d, best, pal)
            }
        } else {
            message(pal)
        }
    }

    private func header(_ d: WData, _ pal: CarlumePalette) -> some View {
        HStack(spacing: 6) {
            Text(CarlumeText.fuelShort(d.fuel))
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Capsule().fill(pal.chip))
            Text(d.place).font(.system(size: 11, weight: .medium)).foregroundStyle(pal.muted).lineLimit(1)
            Spacer(minLength: 0)
        }
        .foregroundStyle(pal.fg)
    }

    private func footer(_ d: WData, _ pal: CarlumePalette) -> some View {
        Text(CarlumeText.time(d.ts, lang: entry.lang) + (entry.stale ? " · offline" : ""))
            .font(.system(size: 10, weight: .medium)).foregroundStyle(pal.muted).lineLimit(1)
    }

    private func small(_ d: WData, _ best: WRow, _ pal: CarlumePalette) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            header(d, pal)
            Spacer(minLength: 2)
            PriceText(price: best.price, lang: entry.lang, size: 34).foregroundStyle(pal.accent).carlumeAccentable()
            Text(best.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(pal.fg).lineLimit(1)
            Text("\(CarlumeText.km(best.dist, lang: entry.lang)) · \(best.sub)").font(.system(size: 11)).foregroundStyle(pal.muted).lineLimit(1)
            Spacer(minLength: 2)
            footer(d, pal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func medium(_ d: WData, _ best: WRow, _ pal: CarlumePalette) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                header(d, pal)
                footer(d, pal)
            }
            VStack(spacing: 5) {
                ForEach(Array(d.rows.prefix(3).enumerated()), id: \.offset) { i, r in
                    HStack(spacing: 8) {
                        Text("\(i + 1)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(i == 0 ? Color.white : pal.fg)
                            .frame(width: 20, height: 20)
                            .background(Circle().fill(i == 0 ? pal.accent : pal.chip))
                        VStack(alignment: .leading, spacing: 0) {
                            Text(r.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(pal.fg).lineLimit(1)
                            Text("\(CarlumeText.km(r.dist, lang: entry.lang)) · \(r.sub)").font(.system(size: 10.5)).foregroundStyle(pal.muted).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        PriceText(price: r.price, lang: entry.lang, size: i == 0 ? 20 : 17)
                            .foregroundStyle(i == 0 ? pal.accent : pal.fg)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func rectangular(_ d: WData, _ best: WRow) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(CarlumeText.fuelShort(d.fuel)) · \(d.place)").font(.system(size: 12, weight: .semibold)).lineLimit(1).carlumeAccentable()
            PriceText(price: best.price, lang: entry.lang, size: 22)
            Text("\(best.title) · \(CarlumeText.km(best.dist, lang: entry.lang))").font(.system(size: 12)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func circular(_ d: WData, _ best: WRow) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: -1) {
                Text(CarlumeText.fuelShort(d.fuel)).font(.system(size: 9, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                Text(String(CarlumeText.priceParts(best.price, lang: entry.lang).0))
                    .font(.system(size: 17, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.6)
            }
            .padding(4)
        }
    }

    @ViewBuilder private func message(_ pal: CarlumePalette) -> some View {
        let text = entry.message ?? CarlumeText.t(entry.lang, "Keine Preise.", "No prices.")
        switch family {
        case .accessoryInline:
            Text("Carlume: " + text)
        case .accessoryCircular:
            ZStack { AccessoryWidgetBackground(); Image(systemName: "fuelpump").font(.system(size: 18, weight: .semibold)) }
        case .accessoryRectangular:
            Text(text).font(.system(size: 12)).lineLimit(3)
        default:
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "fuelpump.fill").foregroundStyle(pal.accent)
                    Text("Carlume").font(.system(size: 13, weight: .bold)).foregroundStyle(pal.fg)
                }
                Text(text).font(.system(size: 12)).foregroundStyle(pal.muted).lineLimit(6)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}
