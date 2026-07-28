import SwiftUI
import AppKit

@main
struct CyclingDashboardApp: App {
    @State private var store = DataStore()
    @State private var showClearConfirm = false
    @State private var showSyncResult = false
    @State private var syncMessage = ""
    @State private var syncing = false

    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        UserDefaults.standard.register(defaults: ["darkMode": NSApp.effectiveAppearance.name == .darkAqua])
    }

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environment(store)
                .frame(minWidth: 1000, minHeight: 760)
                .alert("清空所有数据？", isPresented: $showClearConfirm) {
                    Button("取消", role: .cancel) {}
                    Button("清空", role: .destructive) { store.clearAll() }
                } message: {
                    Text("\(store.rides.count) 条骑行记录将从 rides.json 移除，不可撤销")
                }
                .alert("Obsidian 同步", isPresented: $showSyncResult) {
                    Button("好", role: .cancel) {}
                } message: {
                    Text(syncMessage)
                }
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

                Button(syncing ? "同步中…" : "同步到 Obsidian") {
                    syncing = true
                    Task {
                        syncMessage = await ObsidianSync(projectRoot: store.projectRoot).sync()
                        syncing = false
                        showSyncResult = true
                    }
                }
                .keyboardShortcut("S", modifiers: [.command, .shift])
                .disabled(syncing)

                Divider()

                Button("清空数据", role: .destructive) {
                    showClearConfirm = true
                }
                .keyboardShortcut("D", modifiers: [.command, .shift])
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
