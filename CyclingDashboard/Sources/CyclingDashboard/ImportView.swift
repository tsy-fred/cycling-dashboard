import SwiftUI
import UniformTypeIdentifiers

struct ImportView: View {
    @Environment(DataStore.self) var store
    @Environment(\.dismiss) var dismiss
    @State private var selectedFile: URL? = nil
    @State private var parsed: ParsedRide? = nil
    @State private var routeName = ""
    @State private var isParsing = false
    @State private var errorMsg = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("导入 .fit 文件")
                .font(.dashboardTitle)
                .foregroundStyle(AppTheme.text)

            HStack {
                Button("选择文件") {
                    pickFile()
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.primary)
                if let f = selectedFile {
                    Text(f.lastPathComponent)
                        .foregroundStyle(AppTheme.textMuted)
                }
            }

            if isParsing {
                ProgressView("解析中…")
                    .foregroundStyle(AppTheme.text)
            }

            if !errorMsg.isEmpty {
                Text(errorMsg)
                    .foregroundStyle(AppTheme.danger)
            }

            if parsed != nil {
                TextField("路线名称", text: $routeName)
                    .frame(width: 300)
                    .textFieldStyle(.roundedBorder)
            }

            Spacer()

            HStack {
                Button("取消") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                if parsed != nil {
                    Button("导入") { confirmImport() }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.primary)
                }
            }
        }
        .padding()
        .frame(width: 420, height: 250)
        .background(AppTheme.background.ignoresSafeArea())
    }

    func pickFile() {
        let panel = NSOpenPanel()
        let fitType = UTType(filenameExtension: "fit") ?? UTType.data
        panel.allowedContentTypes = [fitType]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        selectedFile = url
        isParsing = true
        errorMsg = ""

        Task {
            let parser = FitParser(projectRoot: store.projectRoot)
            if let result = await parser.parse(fitPath: url) {
                await MainActor.run {
                    parsed = result
                    routeName = result.route.isEmpty ? "骑行 \(result.date)" : result.route
                    isParsing = false
                }
            } else {
                await MainActor.run {
                    errorMsg = "解析失败，请检查 .fit 文件或 fitparse 是否已安装。"
                    isParsing = false
                }
            }
        }
    }

    func confirmImport() {
        guard var p = parsed else { return }
        if store.rides.contains(where: { $0.filename == p.filename && $0.date == p.date }) {
            errorMsg = "这条骑行已存在，未重复导入。"
            parsed = nil
            selectedFile = nil
            return
        }
        p.route = routeName
        if p.loopSegment == nil, let seg = detectLoopSegment(p.trackPoints) {
            p.loopSegment = seg
        }
        store.importFitResult(p)
        dismiss()
    }
}
