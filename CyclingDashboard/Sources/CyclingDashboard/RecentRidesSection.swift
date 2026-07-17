import SwiftUI

struct RecentRidesSection: View {
    var rides: [Ride]
    var route: String?
    @Binding var showAllRides: Bool
    @State private var selectedRide: Ride? = nil

    var recentRides: [Ride] {
        Array(rides.sorted { $0.date > $1.date }.prefix(5))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("最近骑行")
                    .font(.sectionTitle)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                if rides.count > 5 {
                    Button("查看全部") {
                        showAllRides = true
                    }
                    .foregroundStyle(AppTheme.primary)
                }
            }

            LazyVStack(spacing: 10) {
                ForEach(recentRides) { ride in
                    Button {
                        selectedRide = ride
                    } label: {
                        RecentRideRow(ride: ride)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sheet(item: $selectedRide) { ride in
            RideDetailSheet(ride: ride)
        }
    }
}

struct RecentRideRow: View {
    @Environment(DataStore.self) var store
    var ride: Ride

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(ride.route.isEmpty ? "未命名" : ride.route)
                    .font(.headline)
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                Text("\(ride.date)  \(ride.startTime ?? "") - \(ride.endTime ?? "")")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textMuted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(String(format: "%.1f", ride.distanceKm))
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.text)
                Text("km")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textMuted)
            }
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(AppTheme.textMuted)
        }
        .padding(16)
        .cardStyle()
    }
}

struct RideDetailSheet: View {
    var ride: Ride
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            RideDetailView(ride: ride)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("关闭") { dismiss() }
                    }
                }
        }
    }
}

struct RidesListSheet: View {
    var rides: [Ride]
    var route: String?
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            List(rides.sorted { $0.date > $1.date }) { ride in
                NavigationLink(value: ride) {
                    RecentRideRow(ride: ride)
                }
            }
            .navigationTitle(route ?? "全部骑行")
            .navigationDestination(for: Ride.self) { ride in
                RideDetailView(ride: ride)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
            }
            .background(AppTheme.background.ignoresSafeArea())
        }
    }
}
