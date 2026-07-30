import SwiftUI
import Charts

enum TrendMetric: String, CaseIterable {
    case speed = "均速"
    case hr = "心率"
    case time = "用时"
    case distance = "距离"
    case elev = "爬升"
    case maxSpeed = "极速"
    case cadence = "踏频"

    func value(from ride: Ride) -> Double? {
        switch self {
        case .speed: return ride.avgSpeedKmh
        case .hr: return ride.avgHr > 0 ? ride.avgHr : nil
        case .time: return ride.movingTimeMin
        case .distance: return ride.distanceKm
        case .elev: return ride.elevGainM
        case .maxSpeed: return ride.maxSpeedKmh
        case .cadence: return ride.hasCadence ? ride.avgCadence : nil
        }
    }

    var unit: String {
        switch self {
        case .speed: return "km/h"
        case .hr: return "bpm"
        case .time: return "min"
        case .distance: return "km"
        case .elev: return "m"
        case .maxSpeed: return "km/h"
        case .cadence: return "rpm"
        }
    }
}

struct TrendPoint: Identifiable {
    var id: String
    var date: String
    var label: String
    var value: Double
}

func trendPoints(for rides: [Ride], metric: TrendMetric) -> [TrendPoint] {
    rides
        .sorted {
            if $0.date == $1.date { return $0.id < $1.id }
            return $0.date < $1.date
        }
        .compactMap { ride in
            guard let value = metric.value(from: ride) else { return nil }
            let shortDate = ride.date.count >= 10 ? String(ride.date.suffix(5)) : ride.date
            return TrendPoint(id: ride.id, date: ride.date, label: shortDate, value: value)
        }
}

struct RouteTrendChart: View {
    var rides: [Ride]
    @State private var metric: TrendMetric = .speed

    var points: [TrendPoint] {
        trendPoints(for: rides, metric: metric)
    }

    var body: some View {
        if !rides.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("路线趋势")
                        .font(.sectionTitle)
                        .foregroundStyle(AppTheme.text)
                    Spacer()
                    Picker("指标", selection: $metric) {
                        ForEach(TrendMetric.allCases, id: \.self) { m in
                            Text(m.rawValue).tag(m)
                        }
                    }
                    .pickerStyle(.menu)
                    .fixedSize()
                }

                if points.isEmpty {
                    ContentUnavailableView(
                        "暂无\(metric.rawValue)数据",
                        systemImage: "chart.xyaxis.line"
                    )
                    .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    Chart(points) { pt in
                        LineMark(
                            x: .value("日期", pt.label),
                            y: .value(metric.rawValue, pt.value)
                        )
                        .foregroundStyle(AppTheme.primary)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                        PointMark(
                            x: .value("日期", pt.label),
                            y: .value(metric.rawValue, pt.value)
                        )
                        .foregroundStyle(AppTheme.primary)
                        .symbolSize(30)
                    }
                    .chartXAxis {
                        AxisMarks(values: .automatic) { _ in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(AppTheme.border)
                            AxisValueLabel().foregroundStyle(AppTheme.textMuted)
                        }
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(AppTheme.border)
                            AxisValueLabel().foregroundStyle(AppTheme.textMuted)
                        }
                    }
                    .chartYAxisLabel(metric.unit, position: .trailing)
                    .frame(height: 200)
                }
            }
            .padding(16)
            .cardStyle()
        }
    }
}
