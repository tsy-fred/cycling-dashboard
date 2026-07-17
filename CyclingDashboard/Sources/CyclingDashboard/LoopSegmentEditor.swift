import SwiftUI
import MapKit

struct LoopSegmentEditor: View {
    var ride: Ride
    let coords: [CLLocationCoordinate2D]
    var onSave: (LoopSegment) -> Void
    @Environment(\.dismiss) var dismiss

    enum Phase {
        case start, end, done
    }

    @State private var phase: Phase
    @State private var startIdx: Int
    @State private var endIdx: Int
    @State private var laps: Int
    @State private var camera: MapCameraPosition

    init(ride: Ride, onSave: @escaping (LoopSegment) -> Void) {
        self.ride = ride
        self.coords = ride.trackPoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
        self.onSave = onSave
        _camera = State(initialValue: cameraPosition(for: ride))
        if let seg = ride.loopSegment {
            _startIdx = State(initialValue: seg.startIdx)
            _endIdx = State(initialValue: seg.endIdx)
            _laps = State(initialValue: seg.laps)
            _phase = State(initialValue: .done)
        } else {
            _startIdx = State(initialValue: -1)
            _endIdx = State(initialValue: -1)
            _laps = State(initialValue: 1)
            _phase = State(initialValue: .start)
        }
    }

    var segmentCoords: [CLLocationCoordinate2D] {
        guard startIdx >= 0, endIdx > startIdx, endIdx < coords.count else { return [] }
        return Array(coords[startIdx...endIdx])
    }

    var hint: String {
        switch phase {
        case .start: return "在地图上点击选择绕圈起点"
        case .end: return "起点已选，点击选择绕圈终点"
        case .done: return "绕圈段已选定，可调整圈数后保存"
        }
    }

    var info: String {
        guard startIdx >= 0, endIdx > startIdx else { return "" }
        var d = 0.0
        for i in (startIdx + 1)...endIdx {
            let a = ride.trackPoints[i - 1], b = ride.trackPoints[i]
            d += haversineKm(lat1: a.lat, lng1: a.lng, lat2: b.lat, lng2: b.lng)
        }
        return String(format: "绕圈段: %.1fkm · %d 个轨迹点", d, endIdx - startIdx)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ride.route.isEmpty ? "编辑绕圈段" : "编辑绕圈段 · \(ride.route)")
                .font(.dashboardTitle)
                .foregroundStyle(AppTheme.text)

            Text(hint)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textMuted)

            MapReader { proxy in
                Map(position: $camera) {
                    MapPolyline(coordinates: coords)
                        .stroke(AppTheme.textMuted.opacity(0.5), lineWidth: 2)
                    if !segmentCoords.isEmpty {
                        MapPolyline(coordinates: segmentCoords)
                            .stroke(Color(hex: "#FF6B6B"), style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                    }
                    if startIdx >= 0, startIdx < coords.count {
                        Annotation("起", coordinate: coords[startIdx]) {
                            StartMarker()
                        }
                    }
                    if endIdx > startIdx, endIdx < coords.count {
                        Annotation("终", coordinate: coords[endIdx]) {
                            EndMarker()
                        }
                    }
                }
                .mapStyle(.standard(elevation: .realistic))
                .onTapGesture { pos in
                    if let coord = proxy.convert(pos, from: .local) {
                        pick(coord)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            if !info.isEmpty {
                Text(info)
                    .font(.caption)
                    .foregroundStyle(AppTheme.textMuted)
            }

            HStack(spacing: 12) {
                Button("重选起点") {
                    phase = .start
                    startIdx = -1
                }
                Button("重选终点") {
                    guard startIdx >= 0 else { return }
                    phase = .end
                    endIdx = -1
                }
                Button("自动检测") {
                    autoDetect()
                }
                Stepper("圈数: \(laps)", value: $laps, in: 1...99)
            }
            .foregroundStyle(AppTheme.text)

            HStack {
                Button("取消") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("保存") {
                    guard phase == .done else { return }
                    onSave(LoopSegment(startIdx: startIdx, endIdx: endIdx, laps: max(1, laps)))
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.primary)
                .disabled(phase != .done)
            }
        }
        .padding(20)
        .frame(width: 560, height: 620)
        .background(AppTheme.background.ignoresSafeArea())
    }

    func pick(_ coord: CLLocationCoordinate2D) {
        guard phase != .done else { return }
        var bestIdx = 0, bestDist = Double.infinity
        for (i, pt) in ride.trackPoints.enumerated() {
            let d = haversineKm(lat1: coord.latitude, lng1: coord.longitude, lat2: pt.lat, lng2: pt.lng)
            if d < bestDist { bestDist = d; bestIdx = i }
        }
        if phase == .start {
            startIdx = bestIdx
            phase = .end
        } else {
            endIdx = bestIdx
            if startIdx > endIdx {
                swap(&startIdx, &endIdx)
            }
            laps = countLapsInSegment(ride.trackPoints, startIdx: startIdx, endIdx: endIdx)
            phase = .done
        }
    }

    func autoDetect() {
        guard let seg = detectLoopSegment(ride.trackPoints) else { return }
        startIdx = seg.startIdx
        endIdx = seg.endIdx
        laps = seg.laps
        phase = .done
    }
}
