import SwiftUI
import MapKit

struct RideMapView: View {
    var ride: Ride
    @State private var camera: MapCameraPosition = .region(MKCoordinateRegion())

    var coords: [CLLocationCoordinate2D] {
        ride.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    }

    var body: some View {
        Map(position: $camera) {
            MapPolyline(coordinates: coords)
                .stroke(AppTheme.primary, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            if let start = coords.first {
                Annotation("起", coordinate: start) {
                    StartMarker()
                }
            }
            if let end = coords.last, coords.count > 1 {
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
        .onAppear {
            camera = cameraPosition(for: ride)
        }
    }
}
