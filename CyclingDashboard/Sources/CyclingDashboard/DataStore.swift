import Foundation
import SwiftUI

@Observable
class DataStore {
    var rides: [Ride] = []
    var locations: [Location] = []
    var routeColors: [String: String] = [:]
    var routeOrder: [String] = []

    var projectRoot: URL {
        if let saved = UserDefaults.standard.url(forKey: "projectRoot"), FileManager.default.fileExists(atPath: saved.appendingPathComponent("data").path) {
            return saved
        }
        let current = FileManager.default.currentDirectoryPath
        let currentURL = URL(fileURLWithPath: current)
        let dataURL = currentURL.appendingPathComponent("data")
        if FileManager.default.fileExists(atPath: dataURL.path) {
            return currentURL
        }
        let docs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/CyclingDashboard")
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
    var processedURL: URL { projectRoot.appendingPathComponent("__processed__") }

    var routes: [String] {
        Array(Set(rides.map { $0.route })).sorted()
    }

    var ridesByRoute: [String: [Ride]] {
        Dictionary(grouping: rides, by: { $0.route })
    }

    func load() {
        loadRides()
        loadLocations()
    }

    func loadRides() {
        guard FileManager.default.fileExists(atPath: ridesURL.path) else { return }
        do {
            let data = try Data(contentsOf: ridesURL)
            let decoded = try JSONDecoder().decode(RidesData.self, from: data)
            rides = decoded.records
        } catch {
            print("load rides failed: \(error)")
        }
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
            let manual = locations.filter { $0.manual }
            let data = try JSONEncoder().encode(manual)
            try data.write(to: locationsURL, options: .atomic)
        } catch {
            print("save locations failed: \(error)")
        }
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
        saveRides()
    }

    func addLocation(name: String, lat: Double, lng: Double) {
        let id = "loc_\(Date().timeIntervalSince1970)_\(Int.random(in: 1000..<9999))"
        locations.append(Location(id: id, name: name, lat: lat, lng: lng, manual: true))
        saveLocations()
    }

    func removeLocation(id: String) {
        locations.removeAll { $0.id == id }
        saveLocations()
    }

    func renameLocation(id: String, name: String) {
        if let idx = locations.firstIndex(where: { $0.id == id }) {
            locations[idx].name = name
            saveLocations()
        }
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
                try FileManager.default.moveItem(at: src, to: dst)
            }
        } catch {
            print("move processed failed: \(error)")
        }
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
