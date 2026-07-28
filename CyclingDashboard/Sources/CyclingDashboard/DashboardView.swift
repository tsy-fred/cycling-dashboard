import SwiftUI
import MapKit

struct DashboardView: View {
    @Environment(DataStore.self) var store
    @AppStorage("darkMode") private var isDarkMode = true
    @State private var selectedRoute: String? = nil
    @State private var camera: MapCameraPosition = .region(MKCoordinateRegion())
    @State private var showImport = false
    @State private var showAllRides = false
    @State private var statsMonth: String? = nil

    var selectedRides: [Ride] {
        if let route = selectedRoute {
            return store.ridesByRoute[route] ?? []
        }
        return store.rides
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                mapSection
                StatsSection(rides: selectedRides, route: selectedRoute, month: $statsMonth)
                MonthlyChartView(rides: selectedRides)
                RouteCardsSection(selectedRoute: $selectedRoute)
                RecentRidesSection(rides: selectedRides, route: selectedRoute, showAllRides: $showAllRides)
            }
            .padding(20)
            .id(isDarkMode)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .preferredColorScheme(isDarkMode ? .dark : .light)
        .navigationTitle("Cycling Dashboard")
        .toolbar {
            ToolbarItem(placement: .principal) {
                routePicker
            }
            ToolbarItem(placement: .primaryAction) {
                Button(action: { showImport = true }) {
                    Label("导入", systemImage: "plus.circle.fill")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button(action: { isDarkMode.toggle() }) {
                    Label("外观", systemImage: isDarkMode ? "moon.fill" : "sun.max.fill")
                }
            }
        }
        .onAppear {
            applyAppearance()
            store.load()
            camera = cameraPosition(for: selectedRoute, store: store)
        }
        .onChange(of: isDarkMode) { _, _ in applyAppearance() }
        .onChange(of: selectedRoute) { _, new in
            statsMonth = nil
            withAnimation(.easeInOut(duration: 0.4)) {
                camera = cameraPosition(for: new, store: store)
            }
        }
        .onChange(of: store.rides.count) { _, _ in
            camera = cameraPosition(for: selectedRoute, store: store)
        }
        .onReceive(NotificationCenter.default.publisher(for: .importFit)) { _ in
            showImport = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .selectProjectRoot)) { _ in
            selectProjectRoot()
        }
        .sheet(isPresented: $showImport) {
            ImportView()
        }
        .sheet(isPresented: $showAllRides) {
            RidesListSheet(rides: selectedRides, route: selectedRoute)
        }
    }

    func applyAppearance() {
        NSApp?.appearance = NSAppearance(named: isDarkMode ? .darkAqua : .aqua)
    }

    func selectProjectRoot() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.title = "选择项目文件夹"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        store.setProjectRoot(url: url)
        store.load()
        camera = cameraPosition(for: selectedRoute, store: store)
    }

    var mapSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(mapTitle)
                    .font(.dashboardTitle)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                Text(mapSubtitle)
                    .font(.cardLabel)
                    .foregroundStyle(AppTheme.textMuted)
            }

            MapView(store: store, selectedRoute: selectedRoute, camera: $camera)
                .frame(height: 420)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(AppTheme.border.opacity(0.6), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
        }
    }

    var mapTitle: String {
        selectedRoute ?? "全部路线"
    }

    var mapSubtitle: String {
        "\(selectedRides.count) 次骑行 · \(String(format: "%.1f", selectedRides.reduce(0) { $0 + $1.distanceKm })) km"
    }

    var routePicker: some View {
        Menu {
            Button("全部路线") {
                selectedRoute = nil
            }
            Divider()
            ForEach(store.routes, id: \.self) { route in
                Button(route) {
                    selectedRoute = route
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "map")
                    .foregroundStyle(AppTheme.primary)
                Text(selectedRoute ?? "全部路线")
                    .fontWeight(.semibold)
                    .foregroundStyle(AppTheme.text)
                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(AppTheme.surface)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(AppTheme.border, lineWidth: 1)
            )
        }
        .menuStyle(.button)
    }
}
