import SwiftUI

enum AppTheme {
    static let background = Color(hex: "#14161A")
    static let surface = Color(hex: "#1E2127")
    static let surfaceHover = Color(hex: "#25292F")
    static let primary = Color(hex: "#FF6B35")
    static let secondary = Color(hex: "#00D9C0")
    static let accentYellow = Color(hex: "#FFB800")
    static let accentBlue = Color(hex: "#3B8DFF")
    static let text = Color(hex: "#FFFFFF")
    static let textMuted = Color(hex: "#8B909A")
    static let border = Color(hex: "#2E333B")
    static let success = Color(hex: "#22C55E")
    static let danger = Color(hex: "#EF4444")
}

extension View {
    func cardStyle() -> some View {
        self
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(AppTheme.border.opacity(0.6), lineWidth: 1)
            )
    }
}

extension Font {
    static let dashboardTitle: Font = .system(size: 28, weight: .bold, design: .rounded)
    static let cardValue: Font = .system(size: 32, weight: .bold, design: .rounded)
    static let cardLabel: Font = .system(size: 12, weight: .medium)
    static let sectionTitle: Font = .system(size: 18, weight: .semibold, design: .rounded)
}
