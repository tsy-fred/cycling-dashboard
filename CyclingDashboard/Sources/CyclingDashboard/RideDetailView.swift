import SwiftUI

struct RideDetailView: View {
    @Environment(DataStore.self) var store
    @State var ride: Ride
    @Environment(\.dismiss) var dismiss
    @State private var showShare = false
    @State private var showDeleteConfirm = false
    @State private var showRename = false
    @State private var showSegmentEditor = false
    @State private var newRouteName = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                statsGrid
                hrZonesView
                RideMapView(ride: ride)
                    .frame(height: 360)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                ChartsView(ride: ride)
                    .frame(height: 420)
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .navigationTitle(ride.route.isEmpty ? "骑行详情" : ride.route)
        .toolbar {
            ToolbarItem {
                Button("绕圈") {
                    showSegmentEditor = true
                }
                .foregroundStyle(AppTheme.text)
            }
            ToolbarItem {
                Button("改名") {
                    newRouteName = ride.route
                    showRename = true
                }
                .foregroundStyle(AppTheme.text)
            }
            ToolbarItem {
                Button("分享") {
                    showShare = true
                }
                .foregroundStyle(AppTheme.primary)
            }
            ToolbarItem {
                Button("删除", role: .destructive) {
                    showDeleteConfirm = true
                }
                .foregroundStyle(AppTheme.danger)
            }
        }
        .sheet(isPresented: $showShare) {
            ShareImageView(ride: ride)
        }
        .sheet(isPresented: $showSegmentEditor) {
            LoopSegmentEditor(ride: ride) { seg in
                store.updateLoopSegment(id: ride.id, segment: seg)
                ride.loopSegment = seg
                ride.manualLaps = seg.laps
            }
        }
        .alert("重命名路线", isPresented: $showRename) {
            TextField("路线名称", text: $newRouteName)
            Button("取消", role: .cancel) {}
            Button("保存") {
                let name = newRouteName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                store.updateRideRoute(id: ride.id, route: name)
                ride.route = name
            }
        }
        .alert("删除这条骑行？", isPresented: $showDeleteConfirm) {
            Button("取消", role: .cancel) {}
            Button("删除", role: .destructive) {
                store.deleteRide(id: ride.id)
                dismiss()
            }
        } message: {
            Text("\(ride.date) · \(ride.route.isEmpty ? "未命名" : ride.route)，将从 rides.json 移除")
        }
    }

    var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(ride.route.isEmpty ? "未命名" : ride.route)
                .font(.dashboardTitle)
                .foregroundStyle(AppTheme.text)
            HStack(spacing: 12) {
                Text(ride.date)
                    .foregroundStyle(AppTheme.textMuted)
                if let start = ride.startTime, let end = ride.endTime {
                    Text("\(start) - \(end)")
                        .foregroundStyle(AppTheme.textMuted)
                }
            }
            .font(.subheadline)
        }
    }

    var statsGrid: some View {
        let stats: [(String, String, String, Color)] = [
            ("距离", String(format: "%.1f", ride.distanceKm), "km", AppTheme.primary),
            ("用时", formatTime(ride.movingTimeMin), "", AppTheme.secondary),
            ("均速", String(format: "%.1f", ride.avgSpeedKmh), "km/h", AppTheme.accentBlue),
            ("极速", String(format: "%.1f", ride.maxSpeedKmh), "km/h", AppTheme.accentYellow),
            ("均心", String(format: "%.0f", ride.avgHr), "bpm", Color.pink),
            ("最高心", String(format: "%.0f", ride.maxHr), "bpm", AppTheme.danger),
            ("爬升", String(format: "%.0f", ride.elevGainM), "m", AppTheme.success),
            ("消耗", String(format: "%.0f", ride.calories), "kcal", AppTheme.danger),
        ]

        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 140))], spacing: 12) {
            ForEach(stats, id: \.0) { item in
                StatBox(value: item.1, unit: item.2, label: item.0, icon: statIcon(for: item.0), color: item.3)
            }
        }
    }

    func statIcon(for label: String) -> String {
        switch label {
        case "距离": return "bicycle"
        case "用时": return "clock"
        case "均速": return "speedometer"
        case "极速": return "gauge.with.dots.needle.67percent"
        case "均心": return "heart"
        case "最高心": return "heart.fill"
        case "爬升": return "mountain.2"
        case "消耗": return "flame"
        default: return "star"
        }
    }

    var hrZonesView: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("心率区间")
                .font(.sectionTitle)
                .foregroundStyle(AppTheme.text)
            ForEach(1..<6) { z in
                let pct = pctForZone(z)
                HStack {
                    Text(hrZoneLabel(zone: z))
                        .font(.caption)
                        .foregroundStyle(AppTheme.textMuted)
                        .frame(width: 70, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(AppTheme.border)
                            RoundedRectangle(cornerRadius: 4)
                                .fill(hrZoneColor(zone: z))
                                .frame(width: max(0, geo.size.width * CGFloat(pct / 100)), height: 10)
                        }
                    }
                    .frame(height: 10)
                    Text(String(format: "%.1f%%", pct))
                        .frame(width: 50, alignment: .trailing)
                        .font(.caption)
                        .foregroundStyle(AppTheme.text)
                }
            }
        }
        .padding(16)
        .cardStyle()
    }

    func pctForZone(_ z: Int) -> Double {
        switch z {
        case 1: return ride.hrZones.zone1
        case 2: return ride.hrZones.zone2
        case 3: return ride.hrZones.zone3
        case 4: return ride.hrZones.zone4
        case 5: return ride.hrZones.zone5
        default: return 0
        }
    }
}

func formatTime(_ min: Double) -> String {
    if min >= 60 {
        let h = Int(min / 60)
        let m = Int(min) % 60
        return "\(h)h\(m)m"
    }
    return String(format: "%.0fm", min)
}
