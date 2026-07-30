import SwiftUI

struct RecentRidesSection: View {
    var rides: [Ride]
    var route: String?
    @Binding var showAllRides: Bool
    @Binding var selectedRide: Ride?

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
            VStack(alignment: .trailing, spacing: 2) {
                Text(String(format: "%.1f", ride.distanceKm))
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.text)
                HStack(spacing: 4) {
                    if lapsCount(for: ride) > 0 {
                        Text("\(lapsCount(for: ride)) 圈")
                    }
                    Text("km")
                }
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

enum RideSortKey: String, CaseIterable {
    case date = "日期"
    case distance = "距离"
    case speed = "均速"
    case elev = "爬升"
}

func sortRides(_ rides: [Ride], by key: RideSortKey, ascending: Bool) -> [Ride] {
    rides.sorted { a, b in
        switch key {
        case .date:
            if a.date == b.date { return a.id < b.id }
            return ascending ? a.date < b.date : a.date > b.date
        case .distance:
            if a.distanceKm == b.distanceKm { return a.id < b.id }
            return ascending ? a.distanceKm < b.distanceKm : a.distanceKm > b.distanceKm
        case .speed:
            if a.avgSpeedKmh == b.avgSpeedKmh { return a.id < b.id }
            return ascending ? a.avgSpeedKmh < b.avgSpeedKmh : a.avgSpeedKmh > b.avgSpeedKmh
        case .elev:
            if a.elevGainM == b.elevGainM { return a.id < b.id }
            return ascending ? a.elevGainM < b.elevGainM : a.elevGainM > b.elevGainM
        }
    }
}

struct RidesListSheet: View {
    var rides: [Ride]
    var route: String?
    @Environment(\.dismiss) var dismiss
    @State private var sortKey: RideSortKey = .date
    @State private var sortAsc = false

    var sortedRides: [Ride] {
        sortRides(rides, by: sortKey, ascending: sortAsc)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(sortedRides) { ride in
                        NavigationLink(destination: RideDetailView(ride: ride)) {
                            RecentRideRow(ride: ride)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
            .navigationTitle(route ?? "全部骑行")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
                ToolbarItem {
                    Menu {
                        Picker("排序", selection: $sortKey) {
                            ForEach(RideSortKey.allCases, id: \.self) { key in
                                Text(key.rawValue).tag(key)
                            }
                        }
                        Toggle("升序", isOn: $sortAsc)
                    } label: {
                        Label("排序", systemImage: "arrow.up.arrow.down")
                    }
                }
            }
            .background(AppTheme.background.ignoresSafeArea())
        }
    }
}
