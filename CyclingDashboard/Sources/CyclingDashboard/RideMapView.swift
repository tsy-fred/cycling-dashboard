import SwiftUI
import MapKit

struct RideMapView: View {
    var ride: Ride
    let coords: [CLLocationCoordinate2D]
    @State private var camera: MapCameraPosition = .region(MKCoordinateRegion())

    init(ride: Ride) {
        self.ride = ride
        self.coords = ride.trackPoints.map { wgs84ToGcj02(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)) }
    }

    var segmentCoords: [CLLocationCoordinate2D] {
        guard let seg = ride.loopSegment,
              seg.endIdx > seg.startIdx, seg.endIdx < coords.count else { return [] }
        return Array(coords[seg.startIdx...seg.endIdx])
    }

    var body: some View {
        Map(position: $camera) {
            MapPolyline(coordinates: coords)
                .stroke(AppTheme.primary, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            if !segmentCoords.isEmpty {
                MapPolyline(coordinates: segmentCoords)
                    .stroke(AppTheme.accentBlue, style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
            }
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
        .mapStyle(.standard(elevation: .flat))
        .scrollDisabled(true)
        .mapControls {
            MapPitchToggle()
            MapCompass()
        }
        .onAppear {
            camera = cameraPosition(for: ride)
        }
    }
}
