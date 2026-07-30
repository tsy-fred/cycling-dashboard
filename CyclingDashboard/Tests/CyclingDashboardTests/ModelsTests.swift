import Foundation
import XCTest
@testable import CyclingDashboard

final class ModelsTests: XCTestCase {
    func testTrackPointDecodesLegacyFiveValueFormat() throws {
        let point = try JSONDecoder().decode(TrackPoint.self, from: Data("[39.9,116.4,25,140,50]".utf8))

        XCTAssertEqual(point.lat, 39.9)
        XCTAssertNil(point.cadence)
    }

    func testTrackPointRoundTripPreservesCadence() throws {
        let original = TrackPoint(lat: 39.9, lng: 116.4, speed: 25, hr: 140, alt: 50, cadence: 88)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(TrackPoint.self, from: data)

        XCTAssertEqual(decoded, original)
    }

    func testRideDecodingProvidesDefaultsForOlderData() throws {
        let ride = try JSONDecoder().decode(Ride.self, from: Data(#"{"id":"legacy-ride"}"#.utf8))

        XCTAssertEqual(ride.id, "legacy-ride")
        XCTAssertEqual(ride.route, "")
        XCTAssertEqual(ride.manualLaps, 0)
        XCTAssertEqual(ride.trackPoints, [])
        XCTAssertNil(ride.loopSegment)
    }

    func testRideEncodingUsesSharedSnakeCaseKeys() throws {
        let data = try JSONEncoder().encode(makeRide(manualLaps: 3))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["manual_laps"] as? Int, 3)
        XCTAssertNotNil(json["track_points"])
        XCTAssertNil(json["manualLaps"])
    }
}
