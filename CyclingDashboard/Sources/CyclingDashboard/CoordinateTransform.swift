import Foundation
import CoreLocation

func wgs84ToGcj02(_ coord: CLLocationCoordinate2D) -> CLLocationCoordinate2D {
    let lat = coord.latitude
    let lng = coord.longitude
    guard inChina(lat: lat, lng: lng) else { return coord }

    let dLat = transformLat(x: lng - 105, y: lat - 35)
    let dLng = transformLng(x: lng - 105, y: lat - 35)
    let radLat = lat / 180 * .pi
    var magic = sin(radLat)
    magic = 1 - ee * magic * magic
    let sqrtMagic = sqrt(magic)
    let dLatAdj = dLat * 180 / ((a * (1 - ee)) / (magic * sqrtMagic) * .pi)
    let dLngAdj = dLng * 180 / (a / sqrtMagic * cos(radLat) * .pi)
    return CLLocationCoordinate2D(latitude: lat + dLatAdj, longitude: lng + dLngAdj)
}

private let a: Double = 6378245
private let ee: Double = 0.006693421622965943

private func inChina(lat: Double, lng: Double) -> Bool {
    lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271
}

private func transformLat(x: Double, y: Double) -> Double {
    var ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(abs(x))
    ret += (20 * sin(6 * x * .pi) + 20 * sin(2 * x * .pi)) * 2 / 3
    ret += (20 * sin(y * .pi) + 40 * sin(y / 3 * .pi)) * 2 / 3
    ret += (160 * sin(y / 12 * .pi) + 320 * sin(y * .pi / 30)) * 2 / 3
    return ret
}

private func transformLng(x: Double, y: Double) -> Double {
    var ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(abs(x))
    ret += (20 * sin(6 * x * .pi) + 20 * sin(2 * x * .pi)) * 2 / 3
    ret += (20 * sin(x * .pi) + 40 * sin(x / 3 * .pi)) * 2 / 3
    ret += (150 * sin(x / 12 * .pi) + 300 * sin(x / 30 * .pi)) * 2 / 3
    return ret
}
