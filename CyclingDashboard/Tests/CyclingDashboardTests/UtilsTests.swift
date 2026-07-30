import XCTest
@testable import CyclingDashboard

final class UtilsTests: XCTestCase {
    func testHaversineReturnsZeroForSameCoordinate() {
        XCTAssertEqual(
            haversineKm(lat1: 39.9042, lng1: 116.4074, lat2: 39.9042, lng2: 116.4074),
            0,
            accuracy: 0.000_001
        )
    }

    func testHaversineMeasuresOneLatitudeDegree() {
        XCTAssertEqual(
            haversineKm(lat1: 0, lng1: 0, lat2: 1, lng2: 0),
            111.195,
            accuracy: 0.01
        )
    }

    func testCumulativeDistancesHandlesEmptyAndPopulatedTracks() {
        XCTAssertEqual(cumulativeDistances([]), [])

        let points = [
            TrackPoint(lat: 0, lng: 0, speed: 0, hr: 0, alt: 0),
            TrackPoint(lat: 1, lng: 0, speed: 0, hr: 0, alt: 0),
        ]
        let distances = cumulativeDistances(points)

        XCTAssertEqual(distances.count, 2)
        XCTAssertEqual(distances[0], 0)
        XCTAssertEqual(distances[1], 111.195, accuracy: 0.01)
    }

    func testSampleTrackPointsRejectsInvalidTarget() {
        let point = TrackPoint(lat: 0, lng: 0, speed: 0, hr: 0, alt: 0)
        XCTAssertEqual(sampleTrackPoints([point], target: 0), [])
    }

    func testCountLapsRejectsInvalidIndices() {
        let point = TrackPoint(lat: 0, lng: 0, speed: 0, hr: 0, alt: 0)
        XCTAssertEqual(countLapsInSegment([point], startIdx: -1, endIdx: 0), 0)
        XCTAssertEqual(countLapsInSegment([point], startIdx: 0, endIdx: 1), 0)
    }

    func testManualLapsTakePriority() {
        let ride = makeRide(
            numLaps: 8,
            manualLaps: 3,
            loopSegment: LoopSegment(startIdx: 0, endIdx: 100, laps: 5)
        )

        XCTAssertEqual(lapsCount(for: ride), 3)
    }

    func testDetectedSegmentTakesPriorityOverRecordedLaps() {
        let ride = makeRide(
            numLaps: 8,
            loopSegment: LoopSegment(startIdx: 0, endIdx: 100, laps: 5)
        )

        XCTAssertEqual(lapsCount(for: ride), 5)
    }

    func testRecordedLapsAreUsedAsFallback() {
        XCTAssertEqual(lapsCount(for: makeRide(numLaps: 6)), 6)
        XCTAssertEqual(lapsCount(for: makeRide(numLaps: 1)), 0)
    }

    func testTimeFormatting() {
        XCTAssertEqual(formatTime(59), "59m")
        XCTAssertEqual(formatTime(125), "2h5m")
    }
}
