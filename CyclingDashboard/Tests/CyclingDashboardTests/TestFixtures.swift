@testable import CyclingDashboard

func makeRide(
    id: String = "ride-1",
    route: String = "家→公园",
    date: String = "2026-07-30",
    distanceKm: Double = 20,
    avgSpeedKmh: Double = 25,
    avgHr: Double = 140,
    elevGainM: Double = 100,
    numLaps: Double = 0,
    manualLaps: Int = 0,
    hasCadence: Bool = false,
    avgCadence: Double = 0,
    trackPoints: [TrackPoint] = [],
    loopSegment: LoopSegment? = nil
) -> Ride {
    Ride(
        id: id,
        filename: "\(id).fit",
        route: route,
        date: date,
        startTime: "08:00",
        endTime: "09:00",
        distanceKm: distanceKm,
        avgSpeedKmh: avgSpeedKmh,
        maxSpeedKmh: 40,
        avgHr: avgHr,
        maxHr: 170,
        calories: 500,
        elevGainM: elevGainM,
        minAltM: 10,
        maxAltM: 110,
        movingTimeMin: 60,
        numLaps: numLaps,
        manualLaps: manualLaps,
        notes: "",
        hrZones: HRZones(),
        hasCadence: hasCadence,
        avgCadence: avgCadence,
        maxCadence: hasCadence ? 100 : 0,
        trackPoints: trackPoints,
        startLat: trackPoints.first?.lat,
        startLng: trackPoints.first?.lng,
        endLat: trackPoints.last?.lat,
        endLng: trackPoints.last?.lng,
        loopSegment: loopSegment
    )
}
