import Foundation

struct TrackPoint: Codable, Hashable {
    var lat: Double
    var lng: Double
    var speed: Double
    var hr: Double
    var alt: Double
    var cadence: Double?

    init(lat: Double, lng: Double, speed: Double, hr: Double, alt: Double, cadence: Double? = nil) {
        self.lat = lat
        self.lng = lng
        self.speed = speed
        self.hr = hr
        self.alt = alt
        self.cadence = cadence
    }

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        lat = try container.decode(Double.self)
        lng = try container.decode(Double.self)
        speed = try container.decode(Double.self)
        hr = try container.decode(Double.self)
        alt = try container.decode(Double.self)
        cadence = try? container.decode(Double.self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.unkeyedContainer()
        try container.encode(lat)
        try container.encode(lng)
        try container.encode(speed)
        try container.encode(hr)
        try container.encode(alt)
        if let cadence = cadence {
            try container.encode(cadence)
        }
    }
}

struct HRZones: Codable, Hashable {
    var zone1: Double
    var zone2: Double
    var zone3: Double
    var zone4: Double
    var zone5: Double

    init(zone1: Double = 0, zone2: Double = 0, zone3: Double = 0, zone4: Double = 0, zone5: Double = 0) {
        self.zone1 = zone1
        self.zone2 = zone2
        self.zone3 = zone3
        self.zone4 = zone4
        self.zone5 = zone5
    }
}

struct LoopSegment: Codable, Hashable {
    var startIdx: Int
    var endIdx: Int
    var laps: Int

    enum CodingKeys: String, CodingKey {
        case startIdx = "start_idx"
        case endIdx = "end_idx"
        case laps
    }
}

struct Ride: Codable, Identifiable, Hashable {
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

    enum CodingKeys: String, CodingKey {
        case id, filename, route, date
        case startTime = "start_time"
        case endTime = "end_time"
        case distanceKm = "distance_km"
        case avgSpeedKmh = "avg_speed_kmh"
        case maxSpeedKmh = "max_speed_kmh"
        case avgHr = "avg_hr"
        case maxHr = "max_hr"
        case calories
        case elevGainM = "elev_gain_m"
        case minAltM = "min_alt_m"
        case maxAltM = "max_alt_m"
        case movingTimeMin = "moving_time_min"
        case numLaps = "num_laps"
        case manualLaps = "manual_laps"
        case notes
        case hrZones = "hr_zones"
        case hasCadence = "has_cadence"
        case avgCadence = "avg_cadence"
        case maxCadence = "max_cadence"
        case trackPoints = "track_points"
        case startLat = "start_lat"
        case startLng = "start_lng"
        case endLat = "end_lat"
        case endLng = "end_lng"
        case loopSegment = "loop_segment"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        filename = try c.decodeIfPresent(String.self, forKey: .filename) ?? ""
        route = try c.decodeIfPresent(String.self, forKey: .route) ?? ""
        date = try c.decodeIfPresent(String.self, forKey: .date) ?? ""
        startTime = try c.decodeIfPresent(String.self, forKey: .startTime)
        endTime = try c.decodeIfPresent(String.self, forKey: .endTime)
        distanceKm = try c.decodeIfPresent(Double.self, forKey: .distanceKm) ?? 0
        avgSpeedKmh = try c.decodeIfPresent(Double.self, forKey: .avgSpeedKmh) ?? 0
        maxSpeedKmh = try c.decodeIfPresent(Double.self, forKey: .maxSpeedKmh) ?? 0
        avgHr = try c.decodeIfPresent(Double.self, forKey: .avgHr) ?? 0
        maxHr = try c.decodeIfPresent(Double.self, forKey: .maxHr) ?? 0
        calories = try c.decodeIfPresent(Double.self, forKey: .calories) ?? 0
        elevGainM = try c.decodeIfPresent(Double.self, forKey: .elevGainM) ?? 0
        minAltM = try c.decodeIfPresent(Double.self, forKey: .minAltM) ?? 0
        maxAltM = try c.decodeIfPresent(Double.self, forKey: .maxAltM) ?? 0
        movingTimeMin = try c.decodeIfPresent(Double.self, forKey: .movingTimeMin) ?? 0
        numLaps = try c.decodeIfPresent(Double.self, forKey: .numLaps) ?? 0
        manualLaps = try c.decodeIfPresent(Int.self, forKey: .manualLaps) ?? 0
        notes = try c.decodeIfPresent(String.self, forKey: .notes) ?? ""
        hrZones = try c.decodeIfPresent(HRZones.self, forKey: .hrZones) ?? HRZones()
        hasCadence = try c.decodeIfPresent(Bool.self, forKey: .hasCadence) ?? false
        avgCadence = try c.decodeIfPresent(Double.self, forKey: .avgCadence) ?? 0
        maxCadence = try c.decodeIfPresent(Double.self, forKey: .maxCadence) ?? 0
        trackPoints = try c.decodeIfPresent([TrackPoint].self, forKey: .trackPoints) ?? []
        startLat = try c.decodeIfPresent(Double.self, forKey: .startLat)
        startLng = try c.decodeIfPresent(Double.self, forKey: .startLng)
        endLat = try c.decodeIfPresent(Double.self, forKey: .endLat)
        endLng = try c.decodeIfPresent(Double.self, forKey: .endLng)
        loopSegment = try c.decodeIfPresent(LoopSegment.self, forKey: .loopSegment)
    }

    init(id: String, filename: String, route: String, date: String, startTime: String?, endTime: String?, distanceKm: Double, avgSpeedKmh: Double, maxSpeedKmh: Double, avgHr: Double, maxHr: Double, calories: Double, elevGainM: Double, minAltM: Double, maxAltM: Double, movingTimeMin: Double, numLaps: Double, manualLaps: Int, notes: String, hrZones: HRZones, hasCadence: Bool, avgCadence: Double, maxCadence: Double, trackPoints: [TrackPoint], startLat: Double?, startLng: Double?, endLat: Double?, endLng: Double?, loopSegment: LoopSegment?) {
        self.id = id
        self.filename = filename
        self.route = route
        self.date = date
        self.startTime = startTime
        self.endTime = endTime
        self.distanceKm = distanceKm
        self.avgSpeedKmh = avgSpeedKmh
        self.maxSpeedKmh = maxSpeedKmh
        self.avgHr = avgHr
        self.maxHr = maxHr
        self.calories = calories
        self.elevGainM = elevGainM
        self.minAltM = minAltM
        self.maxAltM = maxAltM
        self.movingTimeMin = movingTimeMin
        self.numLaps = numLaps
        self.manualLaps = manualLaps
        self.notes = notes
        self.hrZones = hrZones
        self.hasCadence = hasCadence
        self.avgCadence = avgCadence
        self.maxCadence = maxCadence
        self.trackPoints = trackPoints
        self.startLat = startLat
        self.startLng = startLng
        self.endLat = endLat
        self.endLng = endLng
        self.loopSegment = loopSegment
    }
}

struct Location: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var lat: Double
    var lng: Double
    var manual: Bool
    var radiusKm: Double
    var isAuto: Bool

    init(id: String, name: String, lat: Double, lng: Double, manual: Bool, radiusKm: Double = 0.5, isAuto: Bool = false) {
        self.id = id
        self.name = name
        self.lat = lat
        self.lng = lng
        self.manual = manual
        self.radiusKm = radiusKm
        self.isAuto = isAuto
    }
}

struct RidesData: Codable {
    var version: Int
    var lastUpdated: String?
    var routeColors: [String: String]
    var routeOrder: [String]
    var records: [Ride]

    enum CodingKeys: String, CodingKey {
        case version
        case lastUpdated = "last_updated"
        case routeColors = "route_colors"
        case routeOrder = "route_order"
        case records
    }
}
