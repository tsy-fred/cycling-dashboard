import SwiftUI
import MapKit

struct MapView: View {
    var store: DataStore
    var selectedRoute: String?
    @Binding var camera: MapCameraPosition

    var body: some View {
        Map(position: $camera) {
            ForEach(store.routes, id: \.self) { route in
                let isSelected = selectedRoute == route
                ForEach(store.ridesByRoute[route] ?? []) { ride in
                    let points = ride.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
                    if !points.isEmpty {
                        MapPolyline(coordinates: points)
                            .stroke(routeColor(route, isSelected: isSelected), style: StrokeStyle(lineWidth: isSelected ? 5 : 2, lineCap: .round, lineJoin: .round))
                    }
                }
            }

            if let route = selectedRoute,
               let start = routeStart(for: route) {
                Annotation("起", coordinate: start) {
                    StartMarker()
                }
            }

            if let route = selectedRoute,
               let end = routeEnd(for: route) {
                Annotation("终", coordinate: end) {
                    EndMarker()
                }
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .mapControls {
            MapPitchToggle()
            MapCompass()
        }
    }

    func routeStart(for route: String) -> CLLocationCoordinate2D? {
        guard let ride = store.ridesByRoute[route]?.first,
              let lat = ride.startLat, let lng = ride.startLng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    func routeEnd(for route: String) -> CLLocationCoordinate2D? {
        guard let ride = store.ridesByRoute[route]?.last,
              let lat = ride.endLat, let lng = ride.endLng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    func routeColor(_ route: String, isSelected: Bool) -> Color {
        if isSelected { return AppTheme.primary }
        return store.color(for: route).opacity(0.8)
    }
}

struct StartMarker: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(AppTheme.secondary)
                .frame(width: 14, height: 14)
            Circle()
                .stroke(AppTheme.background, lineWidth: 2)
                .frame(width: 14, height: 14)
        }
    }
}

struct EndMarker: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(AppTheme.danger)
                .frame(width: 14, height: 14)
            Circle()
                .stroke(AppTheme.background, lineWidth: 2)
                .frame(width: 14, height: 14)
        }
    }
}

func cameraPosition(for route: String?, store: DataStore) -> MapCameraPosition {
    let points: [CLLocationCoordinate2D]
    if let route = route, let rides = store.ridesByRoute[route] {
        points = rides.flatMap { $0.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) } }
    } else {
        points = store.rides.flatMap { $0.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) } }
    }
    return cameraPosition(for: points)
}

func cameraPosition(for points: [CLLocationCoordinate2D]) -> MapCameraPosition {
    guard points.count > 1 else { return .region(MKCoordinateRegion()) }
    let lats = points.map { $0.latitude }
    let lngs = points.map { $0.longitude }
    let minLat = lats.min()!
    let maxLat = lats.max()!
    let minLng = lngs.min()!
    let maxLng = lngs.max()!
    let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2)
    let span = MKCoordinateSpan(
        latitudeDelta: max(0.005, (maxLat - minLat) * 1.4),
        longitudeDelta: max(0.005, (maxLng - minLng) * 1.4)
    )
    return .region(MKCoordinateRegion(center: center, span: span))
}

func cameraPosition(for ride: Ride) -> MapCameraPosition {
    let points = ride.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    return cameraPosition(for: points)
}
