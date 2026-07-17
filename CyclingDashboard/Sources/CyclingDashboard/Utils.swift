import Foundation
import SwiftUI
import MapKit

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

    func toHex() -> String {
        return "#000000"
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
    guard pts.count > target else { return pts }
    let step = max(1, pts.count / target)
    var out: [TrackPoint] = []
    for i in stride(from: 0, to: pts.count, by: step) {
        out.append(pts[i])
    }
    return out
}

func cumulativeDistances(_ pts: [TrackPoint]) -> [Double] {
    var dists: [Double] = [0]
    for i in 1..<pts.count {
        let d = haversineKm(CLLocationCoordinate2D(latitude: pts[i - 1].lat, longitude: pts[i - 1].lng),
                            CLLocationCoordinate2D(latitude: pts[i].lat, longitude: pts[i].lng))
        dists.append(dists[i - 1] + d)
    }
    return dists
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
