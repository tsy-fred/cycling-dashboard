import SwiftUI
import AppKit

@main
struct CyclingDashboardApp: App {
    @State private var store = DataStore()

    init() {
        // 裸二进制从终端/调试器启动时不会自动成为前台 app, 手动激活
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environment(store)
                .frame(minWidth: 1000, minHeight: 760)
        }
        .windowStyle(.automatic)
        .commands {
            CommandMenu("骑行") {
                Button("导入 .fit 文件") {
                    NotificationCenter.default.post(name: .importFit, object: nil)
                }
                .keyboardShortcut("O", modifiers: .command)

                Button("刷新数据") {
                    store.load()
                }
                .keyboardShortcut("R", modifiers: .command)
            }
            CommandMenu("项目") {
                Button("选择项目文件夹") {
                    NotificationCenter.default.post(name: .selectProjectRoot, object: nil)
                }
                .keyboardShortcut("P", modifiers: .command)
            }
        }
    }
}

extension Notification.Name {
    static let importFit = Notification.Name("importFit")
    static let selectProjectRoot = Notification.Name("selectProjectRoot")
}
