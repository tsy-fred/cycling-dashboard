import Foundation
import SwiftUI
import MapKit
import CoreLocation

func haversineKm(_ p1: CLLocationCoordinate2D, _ p2: CLLocationCoordinate2D) -> Double {
    let R = 6371.0
    let dLat = (p2.latitude - p1.latitude) * .pi / 180
    let dLon = (p2.longitude - p1.longitude) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2) +
        cos(p1.latitude * .pi / 180) * cos(p2.latitude * .pi / 180) *
        sin(dLon / 2) * sin(dLon / 2)
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))
}

func haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double) -> Double {
    haversineKm(CLLocationCoordinate2D(latitude: lat1, longitude: lng1),
                CLLocationCoordinate2D(latitude: lat2, longitude: lng2))
}

// 在 segment 范围内数圈: 以 segment 起点为圆心, 阈值按段内最大距离自适应 + 滞回防抖
func countLapsInSegment(_ pts: [TrackPoint], startIdx: Int, endIdx: Int) -> Int {
    guard startIdx >= 0, endIdx < pts.count, startIdx < endIdx else { return 0 }
    guard endIdx - startIdx >= 20 else { return 1 }
    let s = pts[startIdx]
    var maxD = 0.0
    for i in startIdx...endIdx {
        let d = haversineKm(lat1: pts[i].lat, lng1: pts[i].lng, lat2: s.lat, lng2: s.lng)
        if d > maxD { maxD = d }
    }
    let exitT = min(0.5, maxD * 0.6)
    let enterT = exitT * 0.4
    var passes = 0, inZone = true
    for i in (startIdx + 1)...endIdx {
        let d = haversineKm(lat1: pts[i].lat, lng1: pts[i].lng, lat2: s.lat, lng2: s.lng)
        if inZone && d >= exitT {
            inZone = false
        } else if !inZone && d <= enterT {
            passes += 1
            inZone = true
        }
    }
    return max(1, passes)
}

// 自动检测绕圈段: 点密度最高的区域取质心作为绕圈中心(跨骑行稳定), 第一次进入 ~ 最后一次离开
func detectLoopSegment(_ pts: [TrackPoint]) -> LoopSegment? {
    guard pts.count >= 50 else { return nil }
    let step = max(1, pts.count / 80)
    var bestIdx = 0, bestCount = 0
    var i = step
    while i < pts.count - step {
        var count = 0
        for j in 0..<pts.count {
            if haversineKm(lat1: pts[i].lat, lng1: pts[i].lng, lat2: pts[j].lat, lng2: pts[j].lng) < 0.3 { count += 1 }
        }
        if count > bestCount { bestCount = count; bestIdx = i }
        i += step
    }
    var sumLat = 0.0, sumLng = 0.0, n = 0
    for pt in pts {
        if haversineKm(lat1: pt.lat, lng1: pt.lng, lat2: pts[bestIdx].lat, lng2: pts[bestIdx].lng) < 0.3 {
            sumLat += pt.lat
            sumLng += pt.lng
            n += 1
        }
    }
    guard n > 0 else { return nil }
    let cLat = sumLat / Double(n), cLng = sumLng / Double(n)
    var startIdx = -1, endIdx = -1
    for k in 0..<pts.count {
        if haversineKm(lat1: pts[k].lat, lng1: pts[k].lng, lat2: cLat, lng2: cLng) < 0.4 {
            if startIdx == -1 { startIdx = k }
            endIdx = k
        }
    }
    guard startIdx >= 0, endIdx > startIdx, endIdx - startIdx >= 20 else { return nil }
    let laps = countLapsInSegment(pts, startIdx: startIdx, endIdx: endIdx)
    return LoopSegment(startIdx: startIdx, endIdx: endIdx, laps: max(1, laps))
}

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: h).scanHexInt64(&rgb)
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8) & 0xFF) / 255
        let b = Double(rgb & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

func isLightColor(hex: String) -> Bool {
    let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var rgb: UInt64 = 0
    Scanner(string: h).scanHexInt64(&rgb)
    let r = Double((rgb >> 16) & 0xFF)
    let g = Double((rgb >> 8) & 0xFF)
    let b = Double(rgb & 0xFF)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160
}

func sampleTrackPoints(_ pts: [TrackPoint], target: Int = 120) -> [TrackPoint] {
    guard target > 0 else { return [] }
    guard pts.count > target else { return pts }
    let step = max(1, pts.count / target)
    var out: [TrackPoint] = []
    for i in stride(from: 0, to: pts.count, by: step) {
        out.append(pts[i])
    }
    return out
}

func cumulativeDistances(_ pts: [TrackPoint]) -> [Double] {
    guard !pts.isEmpty else { return [] }
    var dists: [Double] = [0]
    for i in 1..<pts.count {
        let d = haversineKm(CLLocationCoordinate2D(latitude: pts[i - 1].lat, longitude: pts[i - 1].lng),
                            CLLocationCoordinate2D(latitude: pts[i].lat, longitude: pts[i].lng))
        dists.append(dists[i - 1] + d)
    }
    return dists
}

func locationHint(lat: Double, lng: Double, knownLocations: [Location]) async -> String? {
    if let nearby = knownLocations.first(where: {
        haversineKm(lat1: $0.lat, lng1: $0.lng, lat2: lat, lng2: lng) < $0.radiusKm
    }) {
        return nearby.name
    }
    let loc = CLLocation(latitude: lat, longitude: lng)
    do {
        let placemarks = try await CLGeocoder().reverseGeocodeLocation(loc)
        if let placemark = placemarks.first {
            let parts = [placemark.locality, placemark.subLocality, placemark.name].compactMap { $0 }
            if !parts.isEmpty { return parts.prefix(3).joined(separator: "·") }
        }
    } catch {}
    if let nearby2 = knownLocations.filter({ haversineKm(lat1: $0.lat, lng1: $0.lng, lat2: lat, lng2: lng) < 1.0 }).first {
        return "\(nearby2.name)附近"
    }
    return nil
}

func lapsCount(for ride: Ride) -> Int {
    if ride.manualLaps > 0 { return ride.manualLaps }
    if let seg = ride.loopSegment, seg.laps > 1 { return seg.laps }
    let recordedLaps = Int(ride.numLaps.rounded())
    if recordedLaps > 1 { return recordedLaps }
    return 0
}

func formatTime(_ min: Double) -> String {
    if min >= 60 {
        let h = Int(min / 60)
        let m = Int(min) % 60
        return "\(h)h\(m)m"
    }
    return String(format: "%.0fm", min)
}

func hrZoneColor(zone: Int) -> Color {
    let colors = [Color(hex: "#4ECDC4"), Color(hex: "#FFD93D"), Color(hex: "#FF8C42"), Color(hex: "#E85D75"), Color(hex: "#C0392B")]
    guard zone >= 1 && zone <= 5 else { return .gray }
    return colors[zone - 1]
}

func hrZoneLabel(zone: Int) -> String {
    let labels = ["Z1 有氧", "Z2 燃脂", "Z3 耐力", "Z4 阈值", "Z5 无氧"]
    guard zone >= 1 && zone <= 5 else { return "" }
    return labels[zone - 1]
}

extension CLLocationCoordinate2D: @retroactive Equatable {
    public static func == (lhs: CLLocationCoordinate2D, rhs: CLLocationCoordinate2D) -> Bool {
        lhs.latitude == rhs.latitude && lhs.longitude == rhs.longitude
    }
}
