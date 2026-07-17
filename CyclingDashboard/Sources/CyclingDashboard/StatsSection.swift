import SwiftUI

struct StatsSection: View {
    var rides: [Ride]
    var route: String?

    var totalDistance: Double { rides.reduce(0) { $0 + $1.distanceKm } }
    var totalTime: Double { rides.reduce(0) { $0 + $1.movingTimeMin } }
    var avgSpeed: Double { rides.isEmpty ? 0 : rides.reduce(0) { $0 + $1.avgSpeedKmh } / Double(rides.count) }
    var maxSpeed: Double { rides.map { $0.maxSpeedKmh }.max() ?? 0 }
    var totalElev: Double { rides.reduce(0) { $0 + $1.elevGainM } }
    var totalCalories: Double { rides.reduce(0) { $0 + $1.calories } }
    var avgHr: Double { rides.isEmpty ? 0 : rides.reduce(0) { $0 + $1.avgHr } / Double(rides.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(route == nil ? "总览" : "路线统计")
                    .font(.sectionTitle)
                    .foregroundStyle(AppTheme.text)
                Spacer()
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150))], spacing: 12) {
                StatBox(value: String(format: "%.1f", totalDistance), unit: "km", label: "总距离", icon: "bicycle", color: AppTheme.primary)
                StatBox(value: formatTime(totalTime), unit: "", label: "总用时", icon: "clock", color: AppTheme.secondary)
                StatBox(value: String(format: "%.1f", avgSpeed), unit: "km/h", label: "均速", icon: "speedometer", color: AppTheme.accentBlue)
                StatBox(value: String(format: "%.1f", maxSpeed), unit: "km/h", label: "极速", icon: "gauge.with.dots.needle.67percent", color: AppTheme.accentYellow)
                StatBox(value: String(format: "%.0f", totalElev), unit: "m", label: "爬升", icon: "mountain.2", color: AppTheme.success)
                StatBox(value: String(format: "%.0f", totalCalories), unit: "kcal", label: "消耗", icon: "flame", color: AppTheme.danger)
                StatBox(value: String(format: "%.0f", avgHr), unit: "bpm", label: "平均心率", icon: "heart.fill", color: Color.pink)
                StatBox(value: "\(rides.count)", unit: "次", label: "骑行次数", icon: "figure.outdoor.cycle", color: AppTheme.secondary)
            }
        }
    }
}

struct StatBox: View {
    var value: String
    var unit: String
    var label: String
    var icon: String
    var color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(color)
                    .font(.title3)
                Spacer()
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(value)
                    .font(.cardValue)
                    .foregroundStyle(AppTheme.text)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.cardLabel)
                        .foregroundStyle(AppTheme.textMuted)
                }
            }
            Text(label.uppercased())
                .font(.cardLabel)
                .foregroundStyle(AppTheme.textMuted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }
}
