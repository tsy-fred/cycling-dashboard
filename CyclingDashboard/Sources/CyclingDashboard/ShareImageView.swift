import SwiftUI

struct ShareImageView: View {
    var ride: Ride
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(spacing: 16) {
            ShareCard(ride: ride)
                .frame(width: 540, height: 540)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(radius: 10)

            HStack {
                Button("关闭") { dismiss() }
                Button("保存图片") { saveImage() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .frame(minWidth: 600, minHeight: 650)
    }

    func saveImage() {
        let renderer = ImageRenderer(content: ShareCard(ride: ride).frame(width: 1080, height: 1080))
        renderer.scale = 2
        guard let nsImage = renderer.nsImage else { return }
        guard let tiff = nsImage.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let data = bitmap.representation(using: .png, properties: [:]) else { return }

        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = "ride_\(ride.date)_\(ride.route).png"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try? data.write(to: url)
    }
}

struct ShareCard: View {
    var ride: Ride

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#FF6E7F"), Color(hex: "#FFB88C")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 12) {
                Text(ride.route.isEmpty ? "骑行" : ride.route)
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.white)
                Text(ride.date)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(.white.opacity(0.8))

                Spacer()

                HStack(spacing: 16) {
                    ShareStat(title: "距离", value: String(format: "%.1f", ride.distanceKm), unit: "km")
                    ShareStat(title: "用时", value: formatTime(ride.movingTimeMin), unit: "")
                    ShareStat(title: "均速", value: String(format: "%.1f", ride.avgSpeedKmh), unit: "km/h")
                    ShareStat(title: "爬升", value: String(format: "%.0f", ride.elevGainM), unit: "m")
                }
            }
            .padding(40)
        }
    }
}

struct ShareStat: View {
    var title: String
    var value: String
    var unit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.white)
            Text(unit)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
            Text(title.uppercased())
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.6))
        }
    }
}
