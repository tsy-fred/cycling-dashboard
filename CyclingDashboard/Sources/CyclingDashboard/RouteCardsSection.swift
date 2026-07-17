import SwiftUI
import MapKit

struct RouteCardsSection: View {
    @Environment(DataStore.self) var store
    @Binding var selectedRoute: String?
    @Binding var camera: MapCameraPosition

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("路线")
                .font(.sectionTitle)
                .foregroundStyle(AppTheme.text)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    AllRoutesCard(selectedRoute: $selectedRoute, camera: $camera, store: store)
                    ForEach(store.routes, id: \.self) { route in
                        RouteCard(route: route, selectedRoute: $selectedRoute, camera: $camera, store: store)
                    }
                }
                .padding(2)
            }
        }
    }
}

struct AllRoutesCard: View {
    @Binding var selectedRoute: String?
    @Binding var camera: MapCameraPosition
    var store: DataStore

    var isSelected: Bool { selectedRoute == nil }

    var body: some View {
        Button {
            selectedRoute = nil
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "map")
                        .font(.title2)
                        .foregroundStyle(AppTheme.text)
                    Spacer()
                }
                Text("全部路线")
                    .font(.headline)
                    .foregroundStyle(AppTheme.text)
                Text("\(store.routes.count) 条路线")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textMuted)
            }
            .frame(width: 150, height: 90, alignment: .leading)
            .padding(14)
            .background(isSelected ? AppTheme.primary.opacity(0.15) : AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isSelected ? AppTheme.primary : AppTheme.border, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

struct RouteCard: View {
    var route: String
    @Binding var selectedRoute: String?
    @Binding var camera: MapCameraPosition
    var store: DataStore

    var isSelected: Bool { selectedRoute == route }
    var rides: [Ride] { store.ridesByRoute[route] ?? [] }
    var totalKm: Double { rides.reduce(0) { $0 + $1.distanceKm } }

    var body: some View {
        Button {
            selectedRoute = route
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Circle()
                        .fill(store.color(for: route))
                        .frame(width: 10, height: 10)
                    Spacer()
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(AppTheme.primary)
                    }
                }
                Text(route)
                    .font(.headline)
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                Text("\(rides.count) 次 · \(String(format: "%.1f", totalKm)) km")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textMuted)
            }
            .frame(width: 170, height: 90, alignment: .leading)
            .padding(14)
            .background(isSelected ? AppTheme.primary.opacity(0.12) : AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isSelected ? AppTheme.primary : AppTheme.border, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}
