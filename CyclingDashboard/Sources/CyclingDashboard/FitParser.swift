import Foundation

class FitParser {
    var projectRoot: URL

    init(projectRoot: URL) {
        self.projectRoot = projectRoot
    }

    func parse(fitPath: URL) async -> ParsedRide? {
        let script = projectRoot.appendingPathComponent("scripts/parse_fit.py")
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        task.arguments = ["python3", script.path, fitPath.path, "--pretty"]
        task.currentDirectoryURL = projectRoot

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        do {
            try task.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            task.waitUntilExit()

            guard task.terminationStatus == 0 else {
                print("parse_fit failed: \(String(data: data, encoding: .utf8) ?? "")")
                return nil
            }

            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let json = json else { return nil }
            if json["error"] != nil {
                print("parse_fit error: \(json["error"] ?? "")")
                return nil
            }

            return parsedRide(from: json, sourcePath: fitPath.path)
        } catch {
            print("parse fit exception: \(error)")
            return nil
        }
    }

    func parsedRide(from json: [String: Any], sourcePath: String) -> ParsedRide {
        let trackRaw = json["track_points"] as? [[Any]] ?? []
        let trackPoints: [TrackPoint] = trackRaw.compactMap { arr in
            guard arr.count >= 5,
                  let lat = arr[0] as? Double,
                  let lng = arr[1] as? Double,
                  let speed = arr[2] as? Double,
                  let hr = arr[3] as? Double,
                  let alt = arr[4] as? Double else { return nil }
            let cad = arr.count >= 6 ? arr[5] as? Double : nil
            return TrackPoint(lat: lat, lng: lng, speed: speed, hr: hr, alt: alt, cadence: cad)
        }

        let hrZonesRaw = json["hr_zones"] as? [String: Double] ?? [:]
        let hrZones = HRZones(
            zone1: hrZonesRaw["zone1"] ?? 0,
            zone2: hrZonesRaw["zone2"] ?? 0,
            zone3: hrZonesRaw["zone3"] ?? 0,
            zone4: hrZonesRaw["zone4"] ?? 0,
            zone5: hrZonesRaw["zone5"] ?? 0
        )

        let loopRaw = json["loop_segment"] as? [String: Int]
        let loopSegment: LoopSegment? = {
            if let s = loopRaw, let start = s["start_idx"], let end = s["end_idx"], let laps = s["laps"] {
                return LoopSegment(startIdx: start, endIdx: end, laps: laps)
            }
            return nil
        }()

        return ParsedRide(
            id: json["id"] as? String ?? UUID().uuidString,
            filename: json["filename"] as? String ?? (sourcePath as NSString).lastPathComponent,
            route: json["route"] as? String ?? "",
            date: json["date"] as? String ?? "",
            startTime: json["start_time"] as? String,
            endTime: json["end_time"] as? String,
            distanceKm: json["distance_km"] as? Double ?? 0,
            avgSpeedKmh: json["avg_speed_kmh"] as? Double ?? 0,
            maxSpeedKmh: json["max_speed_kmh"] as? Double ?? 0,
            avgHr: json["avg_hr"] as? Double ?? 0,
            maxHr: json["max_hr"] as? Double ?? 0,
            calories: json["calories"] as? Double ?? 0,
            elevGainM: json["elev_gain_m"] as? Double ?? 0,
            minAltM: json["min_alt_m"] as? Double ?? 0,
            maxAltM: json["max_alt_m"] as? Double ?? 0,
            movingTimeMin: json["moving_time_min"] as? Double ?? 0,
            numLaps: json["num_laps"] as? Double ?? 0,
            manualLaps: json["manual_laps"] as? Int ?? 0,
            notes: json["notes"] as? String ?? "",
            hrZones: hrZones,
            hasCadence: json["has_cadence"] as? Bool ?? false,
            avgCadence: json["avg_cadence"] as? Double ?? 0,
            maxCadence: json["max_cadence"] as? Double ?? 0,
            trackPoints: trackPoints,
            startLat: json["start_lat"] as? Double,
            startLng: json["start_lng"] as? Double,
            endLat: json["end_lat"] as? Double,
            endLng: json["end_lng"] as? Double,
            loopSegment: loopSegment,
            sourcePath: sourcePath
        )
    }
}
