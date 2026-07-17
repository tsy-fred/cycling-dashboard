import SwiftUI

struct RideListView: View {
    var rides: [Ride]
    @Binding var selectedRide: Ride?
    @Environment(DataStore.self) var store

    var body: some View {
        List(selection: $selectedRide) {
            ForEach(rides) { ride in
                NavigationLink(value: ride) {
                    RideRow(ride: ride)
                }
            }
            .onDelete(perform: delete)
        }
        .navigationTitle("骑行记录")
        .frame(minWidth: 260)
    }

    func delete(at offsets: IndexSet) {
        for i in offsets {
            store.deleteRide(id: rides[i].id)
        }
    }
}

struct RideRow: View {
    var ride: Ride
    @Environment(DataStore.self) var store

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(ride.route.isEmpty ? "未命名" : ride.route)
                    .fontWeight(.semibold)
                Text("\(ride.date) \(ride.startTime ?? "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(String(format: "%.1f km", ride.distanceKm))
                    .fontWeight(.medium)
                Text("\(Int(ride.avgHr)) bpm")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
