import SwiftUI
import MapKit

struct MapView: View {
    var store: DataStore
    var selectedRoute: String?
    @Binding var camera: MapCameraPosition

    @State private var showAddSheet = false
    @State private var addName = ""
    @State private var addLat = 0.0
    @State private var addLng = 0.0
    @State private var showRenameSheet = false
    @State private var renameId = ""
    @State private var renameName = ""
    @State private var showRadiusSheet = false
    @State private var radiusId = ""
    @State private var radiusKm = 0.5

    var body: some View {
        Map(position: $camera) {
            ForEach(store.routes, id: \.self) { route in
                let isSelected = selectedRoute == route
                ForEach(store.ridesByRoute[route] ?? []) { ride in
                    let points = store.coords(for: ride).map(wgs84ToGcj02)
                    if !points.isEmpty {
                        MapPolyline(coordinates: points)
                            .stroke(routeColor(route, isSelected: isSelected), style: StrokeStyle(lineWidth: isSelected ? 6 : 3, lineCap: .round, lineJoin: .round))
                    }
                }
            }

            if let route = selectedRoute,
               let start = routeStart(for: route) {
                Annotation("起", coordinate: wgs84ToGcj02(start)) {
                    StartMarker()
                }
            }

            if let route = selectedRoute,
               let end = routeEnd(for: route) {
                Annotation("终", coordinate: wgs84ToGcj02(end)) {
                    EndMarker()
                }
            }

            ForEach(store.locations) { location in
                Annotation(
                    location.name,
                    coordinate: wgs84ToGcj02(CLLocationCoordinate2D(latitude: location.lat, longitude: location.lng))
                ) {
                    LocationPinView(location: location)
                        .contextMenu {
                            Button("改名称") {
                                renameId = location.id
                                renameName = location.name
                                showRenameSheet = true
                            }
                            Button("调整范围") {
                                radiusId = location.id
                                radiusKm = location.radiusKm
                                showRadiusSheet = true
                            }
                            Divider()
                            Button("删除", role: .destructive) {
                                store.removeLocation(id: location.id)
                            }
                        }
                }
            }
        }
        .contextMenu {
            Button("在此添加地标…") {
                prepareAddLocation()
            }
        }
        .mapStyle(.standard(elevation: .flat))
        .mapControls {
            MapPitchToggle()
            MapCompass()
        }
        .sheet(isPresented: $showAddSheet) {
            VStack(spacing: 16) {
                Text("新增地标").font(.headline)
                TextField("地标名称", text: $addName)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)
                HStack(spacing: 12) {
                    Button("取消") { showAddSheet = false }
                    Button("确认") {
                        store.addLocation(name: addName, lat: addLat, lng: addLng)
                        showAddSheet = false
                    }
                    .disabled(addName.isEmpty)
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
            .frame(width: 260)
        }
        .sheet(isPresented: $showRenameSheet) {
            VStack(spacing: 16) {
                Text("改名称").font(.headline)
                TextField("新名称", text: $renameName)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)
                HStack(spacing: 12) {
                    Button("取消") { showRenameSheet = false }
                    Button("确认") {
                        store.renameLocation(id: renameId, name: renameName)
                        showRenameSheet = false
                    }
                    .disabled(renameName.isEmpty)
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
            .frame(width: 260)
        }
        .sheet(isPresented: $showRadiusSheet) {
            VStack(spacing: 16) {
                Text("隐形范围").font(.headline)
                Slider(value: $radiusKm, in: 0.1...2.0, step: 0.1)
                Text("\(String(format: "%.1f", radiusKm)) km")
                    .font(.caption)
                    .foregroundColor(.secondary)
                HStack(spacing: 12) {
                    Button("取消") { showRadiusSheet = false }
                    Button("确认") {
                        store.updateLocationRadius(id: radiusId, radiusKm: radiusKm)
                        showRadiusSheet = false
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
            .frame(width: 260)
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

    func prepareAddLocation() {
        if let region = camera.region {
            addLat = region.center.latitude
            addLng = region.center.longitude
            addName = ""
            showAddSheet = true
        }
    }
}

struct LocationPinView: View {
    let location: Location

    var body: some View {
        ZStack {
            Circle()
                .fill(location.isAuto ? .orange : AppTheme.primary)
                .frame(width: 16, height: 16)
                .overlay(
                    Circle()
                        .strokeBorder(.white, lineWidth: 2)
                )
            if location.isAuto {
                Image(systemName: "star.fill")
                    .font(.system(size: 7))
                    .foregroundColor(.white)
            }
        }
        .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)
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
        points = rides.flatMap { $0.trackPoints.map { wgs84ToGcj02(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)) } }
    } else {
        points = store.rides.flatMap { $0.trackPoints.map { wgs84ToGcj02(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)) } }
    }
    return cameraPosition(for: points)
}

func cameraPosition(for points: [CLLocationCoordinate2D]) -> MapCameraPosition {
    guard points.count > 1 else { return .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 39.9, longitude: 116.4), span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05))) }
    let lats = points.map { $0.latitude }
    let lngs = points.map { $0.longitude }
    let minLat = lats.min() ?? 0
    let maxLat = lats.max() ?? 0
    let minLng = lngs.min() ?? 0
    let maxLng = lngs.max() ?? 0
    let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2)
    let span = MKCoordinateSpan(
        latitudeDelta: max(0.005, (maxLat - minLat) * 1.4),
        longitudeDelta: max(0.005, (maxLng - minLng) * 1.4)
    )
    return .region(MKCoordinateRegion(center: center, span: span))
}

func cameraPosition(for ride: Ride) -> MapCameraPosition {
    let points = ride.trackPoints.map { wgs84ToGcj02(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)) }
    return cameraPosition(for: points)
}
