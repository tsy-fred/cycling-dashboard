import SwiftUI

struct StatsSection: View {
    var rides: [Ride]
    var route: String?
    @Binding var month: String?

    var availableMonths: [String] {
        Array(Set(rides.compactMap { $0.date.count >= 7 ? String($0.date.prefix(7)) : nil })).sorted(by: >)
    }

    var filtered: [Ride] {
        guard let month else { return rides }
        return rides.filter { $0.date.hasPrefix(month) }
    }

    var totalDistance: Double { filtered.reduce(0) { $0 + $1.distanceKm } }
    var totalTime: Double { filtered.reduce(0) { $0 + $1.movingTimeMin } }
    var avgSpeed: Double { filtered.isEmpty ? 0 : filtered.reduce(0) { $0 + $1.avgSpeedKmh } / Double(filtered.count) }
    var maxSpeed: Double { filtered.map { $0.maxSpeedKmh }.max() ?? 0 }
    var totalElev: Double { filtered.reduce(0) { $0 + $1.elevGainM } }
    var totalCalories: Double { filtered.reduce(0) { $0 + $1.calories } }
    var avgHr: Double { filtered.isEmpty ? 0 : filtered.reduce(0) { $0 + $1.avgHr } / Double(filtered.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(route == nil ? "总览" : "路线统计")
                    .font(.sectionTitle)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                monthPicker
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150))], spacing: 12) {
                StatBox(value: String(format: "%.1f", totalDistance), unit: "km", label: "总距离", icon: "bicycle", color: AppTheme.primary)
                StatBox(value: formatTime(totalTime), unit: "", label: "总用时", icon: "clock", color: AppTheme.secondary)
                StatBox(value: String(format: "%.1f", avgSpeed), unit: "km/h", label: "均速", icon: "speedometer", color: AppTheme.accentBlue)
                StatBox(value: String(format: "%.1f", maxSpeed), unit: "km/h", label: "极速", icon: "gauge.with.dots.needle.67percent", color: AppTheme.accentYellow)
                StatBox(value: String(format: "%.0f", totalElev), unit: "m", label: "爬升", icon: "mountain.2", color: AppTheme.success)
                StatBox(value: String(format: "%.0f", totalCalories), unit: "kcal", label: "消耗", icon: "flame", color: AppTheme.danger)
                StatBox(value: String(format: "%.0f", avgHr), unit: "bpm", label: "平均心率", icon: "heart.fill", color: Color.pink)
                StatBox(value: "\(filtered.count)", unit: "次", label: "骑行次数", icon: "figure.outdoor.cycle", color: AppTheme.secondary)
            }
        }
    }

    var monthPicker: some View {
        Menu {
            Button("总计") { month = nil }
            if !availableMonths.isEmpty {
                Divider()
                ForEach(availableMonths, id: \.self) { m in
                    Button(monthLabel(m)) { month = m }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(month.map { monthLabel($0) } ?? "总计")
                    .font(.cardLabel)
                    .foregroundStyle(AppTheme.text)
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
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
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
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
