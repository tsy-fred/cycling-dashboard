import SwiftUI

enum AppTheme {
    static var isDark: Bool { UserDefaults.standard.object(forKey: "darkMode").flatMap { $0 as? Bool } ?? true }

    static var background: Color { isDark ? Color(hex: "#14161A") : Color(hex: "#F2F2F7") }
    static var surface: Color { isDark ? Color(hex: "#1E2127") : Color(hex: "#FFFFFF") }
    static var surfaceHover: Color { isDark ? Color(hex: "#25292F") : Color(hex: "#F5F5F7") }
    static var primary: Color { Color(hex: "#FF6B35") }
    static var secondary: Color { Color(hex: "#00D9C0") }
    static var accentYellow: Color { Color(hex: "#FFB800") }
    static var accentBlue: Color { Color(hex: "#3B8DFF") }
    static var text: Color { isDark ? Color(hex: "#FFFFFF") : Color(hex: "#1C1C1E") }
    static var textMuted: Color { isDark ? Color(hex: "#8B909A") : Color(hex: "#8E8E93") }
    static var border: Color { isDark ? Color(hex: "#2E333B") : Color(hex: "#D1D1D6") }
    static var success: Color { Color(hex: "#22C55E") }
    static var danger: Color { Color(hex: "#EF4444") }
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
