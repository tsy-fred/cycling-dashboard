import SwiftUI
import Charts

struct MonthStat: Identifiable {
    var id: String { key }
    var key: String
    var label: String
    var distance: Double
    var avgSpeed: Double
    var count: Int
}

func monthLabel(_ key: String) -> String {
    let parts = key.split(separator: "-")
    guard parts.count == 2, let m = Int(parts[1]) else { return key }
    let currentYear = Calendar.current.component(.year, from: Date())
    if Int(parts[0]) == currentYear {
        return "\(m)月"
    }
    return "\(parts[0].suffix(2))/\(m)"
}

func monthlyStats(_ rides: [Ride], limit: Int = 12) -> [MonthStat] {
    var grouped: [String: [Ride]] = [:]
    for ride in rides where ride.date.count >= 7 {
        grouped[String(ride.date.prefix(7)), default: []].append(ride)
    }
    return grouped.keys.sorted().suffix(limit).map { key in
        let rs = grouped[key] ?? []
        return MonthStat(
            key: key,
            label: monthLabel(key),
            distance: rs.reduce(0) { $0 + $1.distanceKm },
            avgSpeed: rs.isEmpty ? 0 : rs.reduce(0) { $0 + $1.avgSpeedKmh } / Double(rs.count),
            count: rs.count
        )
    }
}

struct MonthlyChartView: View {
    var rides: [Ride]

    var months: [MonthStat] { monthlyStats(rides) }

    var body: some View {
        if !months.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("月度里程")
                        .font(.sectionTitle)
                        .foregroundStyle(AppTheme.text)
                    Spacer()
                    HStack(spacing: 16) {
                        legendItem(color: AppTheme.primary, text: "里程 km")
                        legendItem(color: AppTheme.accentBlue, text: "均速 km/h")
                    }
                }

                ZStack {
                    Chart(months) { m in
                        BarMark(
                            x: .value("月份", m.label),
                            y: .value("里程", m.distance)
                        )
                        .foregroundStyle(AppTheme.primary.opacity(0.85))
                        .cornerRadius(4)
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                                .foregroundStyle(AppTheme.border)
                            AxisValueLabel()
                                .foregroundStyle(AppTheme.textMuted)
                        }
                    }

                    Chart(months) { m in
                        LineMark(
                            x: .value("月份", m.label),
                            y: .value("均速", m.avgSpeed)
                        )
                        .foregroundStyle(AppTheme.accentBlue)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                        PointMark(
                            x: .value("月份", m.label),
                            y: .value("均速", m.avgSpeed)
                        )
                        .foregroundStyle(AppTheme.accentBlue)
                        .symbolSize(20)
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis {
                        AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                            AxisValueLabel()
                                .foregroundStyle(AppTheme.textMuted)
                        }
                    }
                }
                .frame(height: 200)
            }
            .padding(16)
            .cardStyle()
        }
    }

    func legendItem(color: Color, text: String) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(text)
                .font(.caption)
                .foregroundStyle(AppTheme.textMuted)
        }
    }
}
