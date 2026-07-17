import SwiftUI
import Charts

struct ChartsView: View {
    var ride: Ride
    @State private var selectedIdx: Int? = nil

    var sampled: [TrackPoint] {
        sampleTrackPoints(ride.trackPoints, target: 120)
    }

    var dists: [Double] {
        cumulativeDistances(sampled)
    }

    // 圈分隔线对应的距离(km): loop_segment 按圈数均分, 映射到采样点后取距离
    var lapBoundaryDists: [Double] {
        guard let seg = ride.loopSegment, seg.laps > 1,
              !ride.trackPoints.isEmpty, !sampled.isEmpty else { return [] }
        let step = max(1, ride.trackPoints.count / 120)
        let lapLen = Double(seg.endIdx - seg.startIdx) / Double(seg.laps)
        var out: [Double] = []
        for k in 1..<seg.laps {
            let origIdx = seg.startIdx + Int((Double(k) * lapLen).rounded())
            let si = min(max(0, origIdx / step), sampled.count - 1)
            out.append(dists[si])
        }
        return out
    }

    var data: [ChartPoint] {
        sampled.enumerated().map { i, pt in
            ChartPoint(
                index: i,
                distance: dists[safe: i] ?? 0,
                speed: pt.speed,
                hr: pt.hr,
                alt: pt.alt,
                cadence: pt.cadence ?? 0
            )
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("趋势")
                .font(.sectionTitle)
                .foregroundStyle(AppTheme.text)

            VStack(spacing: 16) {
                miniChart(title: "心率", color: .pink)
                miniChart(title: "速度", color: AppTheme.accentBlue)
                miniChart(title: "海拔", color: AppTheme.success)
                if ride.hasCadence {
                    miniChart(title: "踏频", color: AppTheme.secondary)
                }
            }
        }
        .padding(16)
        .cardStyle()
    }

    func miniChart(title: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(AppTheme.textMuted)
            Chart(data) { pt in
                LineMark(
                    x: .value("距离", pt.distance),
                    y: .value(title, valueAt(pt, title: title))
                )
                .foregroundStyle(color)
                .interpolationMethod(.catmullRom)
                ForEach(lapBoundaryDists, id: \.self) { d in
                    RuleMark(x: .value("圈", d))
                        .foregroundStyle(AppTheme.textMuted.opacity(0.5))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                }
            }
            .chartXAxis {
                AxisMarks(position: .bottom, values: .automatic) { _ in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                        .foregroundStyle(AppTheme.border)
                    AxisTick(stroke: StrokeStyle(lineWidth: 0.5))
                        .foregroundStyle(AppTheme.textMuted)
                    AxisValueLabel()
                        .foregroundStyle(AppTheme.textMuted)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                        .foregroundStyle(AppTheme.border)
                    AxisValueLabel()
                        .foregroundStyle(AppTheme.textMuted)
                }
            }
            .frame(height: 80)
        }
    }

    func valueAt(_ pt: ChartPoint, title: String) -> Double {
        switch title {
        case "心率": return pt.hr
        case "速度": return pt.speed
        case "海拔": return pt.alt
        case "踏频": return pt.cadence
        default: return 0
        }
    }
}

struct ChartPoint: Identifiable {
    var id = UUID()
    var index: Int
    var distance: Double
    var speed: Double
    var hr: Double
    var alt: Double
    var cadence: Double
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
