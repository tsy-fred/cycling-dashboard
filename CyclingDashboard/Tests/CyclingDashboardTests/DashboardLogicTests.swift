import XCTest
@testable import CyclingDashboard

final class DashboardLogicTests: XCTestCase {
    func testRouteSortingUsesMetricAndStableTieBreaker() {
        let rides = [
            makeRide(id: "b", distanceKm: 30),
            makeRide(id: "c", distanceKm: 10),
            makeRide(id: "a", distanceKm: 30),
        ]

        XCTAssertEqual(sortRides(rides, by: .distance, ascending: true).map(\.id), ["c", "a", "b"])
        XCTAssertEqual(sortRides(rides, by: .distance, ascending: false).map(\.id), ["a", "b", "c"])
    }

    func testSidebarRoutesAreCountFirstAndDeterministic() {
        let store = DataStore()
        store.rides = [
            makeRide(id: "1", route: "北线"),
            makeRide(id: "2", route: "南线"),
            makeRide(id: "3", route: "北线"),
            makeRide(id: "4", route: "东线"),
        ]

        XCTAssertEqual(store.routes, ["北线", "东线", "南线"])
    }

    func testTrendPointsKeepMultipleRidesFromSameDay() {
        let rides = [
            makeRide(id: "later-id", date: "2026-07-30", avgSpeedKmh: 26),
            makeRide(id: "earlier-id", date: "2026-07-30", avgSpeedKmh: 24),
        ]

        let points = trendPoints(for: rides, metric: .speed)

        XCTAssertEqual(points.map(\.id), ["earlier-id", "later-id"])
        XCTAssertEqual(Set(points.map(\.id)).count, 2)
    }

    func testTrendPointsOmitMissingSensorValues() {
        let rides = [
            makeRide(id: "without-cadence"),
            makeRide(id: "with-cadence", hasCadence: true, avgCadence: 88),
        ]

        let points = trendPoints(for: rides, metric: .cadence)

        XCTAssertEqual(points.map(\.id), ["with-cadence"])
        XCTAssertEqual(points.first?.value, 88)
    }
}
