import Foundation
import SwiftUI
import MapKit

@Observable
class DataStore {
    var rides: [Ride] = []
    var locations: [Location] = []
    var routeColors: [String: String] = [:]
    var routeOrder: [String] = []
    var coordsCache: [String: [CLLocationCoordinate2D]] = [:]
    var dismissedAutoCoords: [(lat: Double, lng: Double)] = []

    var projectRoot: URL {
        if let saved = UserDefaults.standard.url(forKey: "projectRoot"), FileManager.default.fileExists(atPath: saved.appendingPathComponent("data").path) {
            return saved
        }
        let home = FileManager.default.homeDirectoryForCurrentUser
        let known = home.appendingPathComponent("Desktop/projects/cycling-dashboard")
        if FileManager.default.fileExists(atPath: known.appendingPathComponent("data").path) {
            return known
        }
        let current = FileManager.default.currentDirectoryPath
        let currentURL = URL(fileURLWithPath: current)
        let candidates = [currentURL, currentURL.deletingLastPathComponent()]
        for url in candidates {
            let dataPath = url.appendingPathComponent("data").path
            if FileManager.default.fileExists(atPath: dataPath) {
                return url
            }
        }
        let docs = home.appendingPathComponent("Documents/CyclingDashboard")
        try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
        return docs
    }

    func setProjectRoot(url: URL) {
        UserDefaults.standard.set(url, forKey: "projectRoot")
        load()
    }

    var dataURL: URL { projectRoot.appendingPathComponent("data") }
    var ridesURL: URL { dataURL.appendingPathComponent("rides.json") }
    var locationsURL: URL { dataURL.appendingPathComponent("locations.json") }
    var dismissedAutoURL: URL { dataURL.appendingPathComponent("dismissed_auto.json") }
    var processedURL: URL { projectRoot.appendingPathComponent("__processed__") }

    var routes: [String] {
        let counts = Dictionary(grouping: rides, by: { $0.route }).mapValues(\.count)
        return Set(rides.map { $0.route }).sorted { counts[$0, default: 0] > counts[$1, default: 0] }
    }

    var ridesByRoute: [String: [Ride]] {
        Dictionary(grouping: rides, by: { $0.route })
    }

    func load() {
        loadRides()
        loadLocations()
        loadDismissedAutoCoords()
        autoDetectLocations()
    }

    func loadRides() {
        guard FileManager.default.fileExists(atPath: ridesURL.path) else { return }
        do {
            let data = try Data(contentsOf: ridesURL)
            let decoded = try JSONDecoder().decode(RidesData.self, from: data)
            rides = decoded.records
            rebuildCoordsCache()
        } catch {
            print("load rides failed: \(error)")
        }
    }

    func rebuildCoordsCache() {
        coordsCache = Dictionary(uniqueKeysWithValues: rides.map {
            ($0.id, $0.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) })
        })
    }

    func coords(for ride: Ride) -> [CLLocationCoordinate2D] {
        if let c = coordsCache[ride.id] { return c }
        return ride.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    }

    func loadLocations() {
        guard FileManager.default.fileExists(atPath: locationsURL.path) else { return }
        do {
            let data = try Data(contentsOf: locationsURL)
            locations = try JSONDecoder().decode([Location].self, from: data)
        } catch {
            print("load locations failed: \(error)")
        }
    }

    func saveRides() {
        do {
            try FileManager.default.createDirectory(at: dataURL, withIntermediateDirectories: true)
            let payload = RidesData(
                version: 1,
                lastUpdated: isoNow(),
                routeColors: routeColors,
                routeOrder: routeOrder,
                records: rides
            )
            let data = try JSONEncoder().encode(payload)
            try data.write(to: ridesURL, options: .atomic)
        } catch {
            print("save rides failed: \(error)")
        }
    }

    func saveLocations() {
        do {
            try FileManager.default.createDirectory(at: dataURL, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(locations)
            try data.write(to: locationsURL, options: .atomic)
        } catch {
            print("save locations failed: \(error)")
        }
    }

    func loadDismissedAutoCoords() {
        guard FileManager.default.fileExists(atPath: dismissedAutoURL.path) else { return }
        do {
            let data = try Data(contentsOf: dismissedAutoURL)
            let coords = try JSONDecoder().decode([[Double]].self, from: data)
            dismissedAutoCoords = coords.map { ($0[0], $0[1]) }
        } catch {
            print("load dismissed auto coords failed: \(error)")
        }
    }

    func saveDismissedAutoCoords() {
        do {
            try FileManager.default.createDirectory(at: dataURL, withIntermediateDirectories: true)
            let coords = dismissedAutoCoords.map { [$0.lat, $0.lng] }
            let data = try JSONEncoder().encode(coords)
            try data.write(to: dismissedAutoURL, options: .atomic)
        } catch {
            print("save dismissed auto coords failed: \(error)")
        }
    }

    func isDismissed(lat: Double, lng: Double) -> Bool {
        dismissedAutoCoords.contains { haversineKm(lat1: $0.lat, lng1: $0.lng, lat2: lat, lng2: lng) < 0.3 }
    }

    func color(for route: String) -> Color {
        if let hex = routeColors[route] {
            return Color(hex: hex)
        }
        return Color(hex: defaultColor(for: route))
    }

    func defaultColor(for route: String) -> String {
        let palette = ["#2196F3", "#4CAF50", "#FF9800", "#9C27B0", "#E91E63", "#00BCD4", "#795548", "#607D8B"]
        let routes = routes.sorted()
        if let idx = routes.firstIndex(of: route) {
            return palette[idx % palette.count]
        }
        return "#666"
    }

    func addRide(_ ride: Ride) {
        rides.append(ride)
        coordsCache[ride.id] = ride.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
        if !routeOrder.contains(ride.route) {
            routeOrder.append(ride.route)
        }
        if routeColors[ride.route] == nil {
            routeColors[ride.route] = defaultColor(for: ride.route)
        }
        saveRides()
    }

    func deleteRide(id: String) {
        rides.removeAll { $0.id == id }
        coordsCache.removeValue(forKey: id)
        saveRides()
    }

    func updateRideRoute(id: String, route: String) {
        guard let idx = rides.firstIndex(where: { $0.id == id }) else { return }
        rides[idx].route = route
        if !routeOrder.contains(route) {
            routeOrder.append(route)
        }
        if routeColors[route] == nil {
            routeColors[route] = defaultColor(for: route)
        }
        saveRides()
    }

    func updateLoopSegment(id: String, segment: LoopSegment?) {
        guard let idx = rides.firstIndex(where: { $0.id == id }) else { return }
        rides[idx].loopSegment = segment
        if let segment {
            rides[idx].manualLaps = segment.laps
        }
        saveRides()
    }

    func addLocation(name: String, lat: Double, lng: Double, radiusKm: Double = 0.5, isAuto: Bool = false) {
        let id = "loc_\(Date().timeIntervalSince1970)_\(Int.random(in: 1000..<9999))"
        locations.append(Location(id: id, name: name, lat: lat, lng: lng, manual: !isAuto, radiusKm: radiusKm, isAuto: isAuto))
        saveLocations()
    }

    func removeLocation(id: String) {
        if let loc = locations.first(where: { $0.id == id }), loc.isAuto {
            dismissedAutoCoords.append((loc.lat, loc.lng))
            saveDismissedAutoCoords()
        }
        locations.removeAll { $0.id == id }
        saveLocations()
    }

    func renameLocation(id: String, name: String) {
        if let idx = locations.firstIndex(where: { $0.id == id }) {
            locations[idx].name = name
            saveLocations()
        }
    }

    func updateLocationRadius(id: String, radiusKm: Double) {
        if let idx = locations.firstIndex(where: { $0.id == id }) {
            locations[idx].radiusKm = radiusKm
            saveLocations()
        }
    }

    func autoDetectLocations() {
        let AUTO_RADIUS_KM = 0.5
        let MIN_COUNT = 3
        var pointCounts: [String: (lat: Double, lng: Double, count: Int)] = [:]

        for ride in rides {
            for point in [(ride.startLat, ride.startLng), (ride.endLat, ride.endLng)] {
                guard let lat = point.0, let lng = point.1 else { continue }
                let key = "\(String(format: "%.4f", lat)),\(String(format: "%.4f", lng))"
                if var existing = pointCounts[key] {
                    existing.count += 1
                    pointCounts[key] = existing
                } else {
                    pointCounts[key] = (lat, lng, 1)
                }
            }
        }

        for (_, point) in pointCounts {
            guard point.count >= MIN_COUNT else { continue }

            let alreadyExists = locations.contains { haversineKm(lat1: $0.lat, lng1: $0.lng, lat2: point.lat, lng2: point.lng) < AUTO_RADIUS_KM }
            let wasDismissed = isDismissed(lat: point.lat, lng: point.lng)

            if !alreadyExists && !wasDismissed {
                let name = inferLocationName(lat: point.lat, lng: point.lng, radiusKm: AUTO_RADIUS_KM)
                addLocation(name: name, lat: point.lat, lng: point.lng, isAuto: true)
            }
        }
    }

    func inferLocationName(lat: Double, lng: Double, radiusKm: Double) -> String {
        var counts: [String: Int] = [:]
        for ride in rides {
            if let rl = ride.startLat, let rn = ride.startLng, haversineKm(lat1: lat, lng1: lng, lat2: rl, lng2: rn) < radiusKm {
                if let m = ride.route.firstMatch(of: /^(.+?)→(.+)$/) {
                    counts[String(m.1), default: 0] += 1
                }
            }
            if let rl = ride.endLat, let rn = ride.endLng, haversineKm(lat1: lat, lng1: lng, lat2: rl, lng2: rn) < radiusKm {
                if let m = ride.route.firstMatch(of: /^(.+?)→(.+)$/) {
                    counts[String(m.2), default: 0] += 1
                }
            }
        }
        if let best = counts.max(by: { $0.value < $1.value }) {
            return best.key
        }
        return "\(String(format: "%.4f", lat)),\(String(format: "%.4f", lng))"
    }

    func matchRouteByGPS(startLat: Double?, startLng: Double?, endLat: Double?, endLng: Double?, trackPoints: [TrackPoint], distanceKm: Double) -> (route: String, reversed: Bool)? {
        guard let startLat, let startLng, let endLat, let endLng else { return nil }
        let isLoop = haversineKm(lat1: startLat, lng1: startLng, lat2: endLat, lng2: endLng) < 1.0
        let GPS_MATCH_KM = 0.5
        var best: (String, Bool)? = nil
        var bestDist = Double.infinity

        for ride in rides {
            guard let rsLat = ride.startLat, let rsLng = ride.startLng, let reLat = ride.endLat, let reLng = ride.endLng else { continue }
            if isLoop {
                let rIsLoop = haversineKm(lat1: rsLat, lng1: rsLng, lat2: reLat, lng2: reLng) < 1.0
                guard rIsLoop else { continue }
                let sd = haversineKm(lat1: startLat, lng1: startLng, lat2: rsLat, lng2: rsLng)
                guard sd < GPS_MATCH_KM else { continue }
                // 形状匹配: 新轨迹采样点到已有轨迹的最小距离均值, 圈数不同(1圈 vs 2圈)也能匹配同一条绕圈路线
                let newSamples = sampleTrackPoints(trackPoints, target: 20)
                let rSamples = sampleTrackPoints(ride.trackPoints, target: 200)
                guard !newSamples.isEmpty, !rSamples.isEmpty else { continue }
                var sum = 0.0
                for p in newSamples {
                    var minD = Double.infinity
                    for q in rSamples {
                        let d = haversineKm(lat1: p.lat, lng1: p.lng, lat2: q.lat, lng2: q.lng)
                        if d < minD { minD = d }
                    }
                    sum += minD
                }
                let avgMinD = sum / Double(newSamples.count)
                if avgMinD < 0.2 && avgMinD < bestDist {
                    bestDist = avgMinD
                    best = (ride.route, false)
                }
            } else {
                let sd = haversineKm(lat1: startLat, lng1: startLng, lat2: rsLat, lng2: rsLng)
                let ed = haversineKm(lat1: endLat, lng1: endLng, lat2: reLat, lng2: reLng)
                if sd + ed < bestDist && sd < GPS_MATCH_KM && ed < GPS_MATCH_KM {
                    bestDist = sd + ed; best = (ride.route, false)
                }
                let sdr = haversineKm(lat1: startLat, lng1: startLng, lat2: reLat, lng2: reLng)
                let edr = haversineKm(lat1: endLat, lng1: endLng, lat2: rsLat, lng2: rsLng)
                if sdr + edr < bestDist * 1.15 && sdr < GPS_MATCH_KM && edr < GPS_MATCH_KM {
                    bestDist = sdr + edr; best = (ride.route, true)
                }
            }
        }
        return best
    }

    func reverseRouteName(_ name: String) -> String {
        if let m = name.firstMatch(of: /^(.+?)→(.+?)(（.*）)?$/) {
            return "\(m.2)→\(m.1)\(m.3 ?? "")"
        }
        return name
    }

    func clearAll() {
        rides = []
        locations = []
        routeColors = [:]
        routeOrder = []
        coordsCache = [:]
        saveRides()
    }

    func importFitResult(_ parsed: ParsedRide) {
        let ride = Ride(
            id: parsed.id,
            filename: parsed.filename,
            route: parsed.route,
            date: parsed.date,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            distanceKm: parsed.distanceKm,
            avgSpeedKmh: parsed.avgSpeedKmh,
            maxSpeedKmh: parsed.maxSpeedKmh,
            avgHr: parsed.avgHr,
            maxHr: parsed.maxHr,
            calories: parsed.calories,
            elevGainM: parsed.elevGainM,
            minAltM: parsed.minAltM,
            maxAltM: parsed.maxAltM,
            movingTimeMin: parsed.movingTimeMin,
            numLaps: parsed.numLaps,
            manualLaps: parsed.manualLaps,
            notes: parsed.notes,
            hrZones: parsed.hrZones,
            hasCadence: parsed.hasCadence,
            avgCadence: parsed.avgCadence,
            maxCadence: parsed.maxCadence,
            trackPoints: parsed.trackPoints,
            startLat: parsed.startLat,
            startLng: parsed.startLng,
            endLat: parsed.endLat,
            endLng: parsed.endLng,
            loopSegment: parsed.loopSegment
        )
        addRide(ride)

        do {
            try FileManager.default.createDirectory(at: processedURL, withIntermediateDirectories: true)
            let src = URL(fileURLWithPath: parsed.sourcePath)
            let dst = processedURL.appendingPathComponent(src.lastPathComponent)
            if FileManager.default.fileExists(atPath: src.path) && !FileManager.default.fileExists(atPath: dst.path) {
                try FileManager.default.copyItem(at: src, to: dst)
            }
        } catch {
            print("move processed failed: \(error)")
        }

        autoDetectLocations()
    }
}

struct ParsedRide {
    var id: String
    var filename: String
    var route: String
    var date: String
    var startTime: String?
    var endTime: String?
    var distanceKm: Double
    var avgSpeedKmh: Double
    var maxSpeedKmh: Double
    var avgHr: Double
    var maxHr: Double
    var calories: Double
    var elevGainM: Double
    var minAltM: Double
    var maxAltM: Double
    var movingTimeMin: Double
    var numLaps: Double
    var manualLaps: Int
    var notes: String
    var hrZones: HRZones
    var hasCadence: Bool
    var avgCadence: Double
    var maxCadence: Double
    var trackPoints: [TrackPoint]
    var startLat: Double?
    var startLng: Double?
    var endLat: Double?
    var endLng: Double?
    var loopSegment: LoopSegment?
    var sourcePath: String
}

func isoNow() -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return f.string(from: Date())
}
