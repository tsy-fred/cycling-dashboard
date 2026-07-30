import SwiftUI

struct SidebarView: View {
    @Environment(DataStore.self) var store
    @Binding var selectedRoute: String?

    var routeCounts: [(route: String, count: Int)] {
        let counts = Dictionary(grouping: store.rides, by: { $0.route }).mapValues(\.count)
        return store.routes.map { ($0, counts[$0, default: 0]) }
    }

    var body: some View {
        List {
            Section {
                Button {
                    selectedRoute = nil
                } label: {
                    Label {
                        Text("全部路线").foregroundStyle(AppTheme.text)
                        Spacer()
                        Text("\(store.rides.count)").font(.caption).foregroundStyle(AppTheme.textMuted)
                    } icon: {
                        Image(systemName: "map").foregroundStyle(AppTheme.primary)
                    }
                }
                .buttonStyle(.plain)
                .listRowBackground(selectedRoute == nil ? AppTheme.primary.opacity(0.1) : nil)
            }

            if !routeCounts.isEmpty {
                Section("路线") {
                    ForEach(routeCounts, id: \.route) { item in
                        Button {
                            selectedRoute = item.route
                        } label: {
                            Label {
                                Text(item.route.isEmpty ? "未命名" : item.route)
                                    .foregroundStyle(item.route == selectedRoute ? AppTheme.primary : AppTheme.text)
                                    .lineLimit(1)
                                Spacer()
                                Text("\(item.count)").font(.caption).foregroundStyle(AppTheme.textMuted)
                            } icon: {
                                Circle().fill(store.color(for: item.route)).frame(width: 8, height: 8)
                            }
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(item.route == selectedRoute ? AppTheme.primary.opacity(0.1) : nil)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .scrollIndicators(.hidden)
        .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 260)
    }
}
