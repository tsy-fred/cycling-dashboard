import SwiftUI
import UniformTypeIdentifiers
import CoreLocation

struct ImportView: View {
    @Environment(DataStore.self) var store
    @Environment(\.dismiss) var dismiss

    let initialFile: URL?

    @State private var selectedFile: URL? = nil
    @State private var parsed: ParsedRide? = nil
    @State private var isParsing = false
    @State private var errorMsg = ""

    @State private var namingMode = 0
    @State private var startName = ""
    @State private var endName = ""
    @State private var pathName = ""
    @State private var loopName = ""
    @State private var customName = ""

    @State private var matchedRoute: String? = nil
    @State private var isReversed = false
    @State private var isDropTargeted = false

    init(initialFile: URL? = nil) {
        self.initialFile = initialFile
    }

    var routeName: String {
        if let m = matchedRoute { return m }
        switch namingMode {
        case 0:
            if startName.isEmpty || endName.isEmpty { return "" }
            return pathName.isEmpty
                ? "\(startName)→\(endName)"
                : "\(startName)→\(endName)（\(pathName)）"
        case 1:
            return loopName.isEmpty ? "" : "\(loopName)绕圈"
        case 2:
            return customName
        default:
            return ""
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("导入 .fit 文件")
                .font(.dashboardTitle)
                .foregroundStyle(AppTheme.text)

            HStack {
                Button("选择文件") { pickFile() }
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

            if let p = parsed {
                rideSummary(p)

                if let route = matchedRoute {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(AppTheme.success)
                        Text(route)
                            .foregroundStyle(AppTheme.success)
                    }
                    .padding(.vertical, 4)
                } else {
                    namingSection
                }
            }

            Spacer()

            HStack {
                Button("取消") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                if parsed != nil {
                    Button(matchedRoute != nil ? "导入" : "导入") { confirmImport() }
                        .keyboardShortcut(.defaultAction)
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.primary)
                        .disabled(routeName.isEmpty)
                }
            }
        }
        .padding()
        .frame(width: 520, height: matchedRoute != nil ? 260 : 400)
        .background(AppTheme.background.ignoresSafeArea())
        .dropDestination(for: URL.self) { urls, _ in
            guard let fitFile = urls.first(where: isFitFile) else { return false }
            parseFile(fitFile)
            return true
        } isTargeted: { targeted in
            withAnimation(.easeInOut(duration: 0.15)) {
                isDropTargeted = targeted
            }
        }
        .overlay {
            if isDropTargeted {
                VStack(spacing: 8) {
                    Image(systemName: "square.and.arrow.down")
                        .font(.system(size: 28, weight: .semibold))
                    Text("松开以选择 FIT 文件")
                        .font(.sectionTitle)
                }
                .foregroundStyle(AppTheme.primary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.ultraThickMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(AppTheme.primary, style: StrokeStyle(lineWidth: 2, dash: [7]))
                        .padding(8)
                }
                .allowsHitTesting(false)
                .transition(.opacity)
            }
        }
        .onAppear {
            if let initialFile, selectedFile == nil {
                parseFile(initialFile)
            }
        }
    }

    func rideSummary(_ p: ParsedRide) -> some View {
        HStack(spacing: 16) {
            Label(p.date, systemImage: "calendar")
            Label(String(format: "%.1f km", p.distanceKm), systemImage: "bicycle")
            Label(formatTime(p.movingTimeMin), systemImage: "clock")
        }
        .font(.caption)
        .foregroundStyle(AppTheme.textMuted)
        .padding(.vertical, 4)
    }

    var namingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("新路线命名")
                .font(.sectionTitle)
                .foregroundStyle(AppTheme.text)

            Picker("", selection: $namingMode) {
                Text("A→B").tag(0)
                Text("绕圈").tag(1)
                Text("自定义").tag(2)
            }
            .pickerStyle(.segmented)

            Group {
                switch namingMode {
                case 0:
                    HStack(spacing: 8) {
                        TextField("起点", text: $startName)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: .infinity)
                        Text("→")
                            .foregroundStyle(AppTheme.textMuted)
                        TextField("终点", text: $endName)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: .infinity)
                    }
                    TextField("途经（可选）", text: $pathName)
                        .textFieldStyle(.roundedBorder)
                case 1:
                    TextField("地点名称，如 奥体中心", text: $loopName)
                        .textFieldStyle(.roundedBorder)
                default:
                    TextField("路线名称", text: $customName)
                        .textFieldStyle(.roundedBorder)
                }
            }
            .onAppear { prefillNames() }
        }
    }

    func prefillNames() {
        guard let p = parsed else { return }
        let isLoop = haversineKm(lat1: p.startLat ?? 0, lng1: p.startLng ?? 0, lat2: p.endLat ?? 0, lng2: p.endLng ?? 0) < 1.0
        let knownLocations = store.locations
        if isLoop {
            namingMode = 1
            if let lat = p.startLat, let lng = p.startLng {
                Task {
                    let hint = await locationHint(lat: lat, lng: lng, knownLocations: knownLocations)
                    await MainActor.run { loopName = hint ?? String(format: "%.4f, %.4f", lat, lng) }
                }
            }
        } else {
            namingMode = 0
            let sn = p.startLat.flatMap { lat in p.startLng.map { lng in (lat, lng) } }
            let en = p.endLat.flatMap { lat in p.endLng.map { lng in (lat, lng) } }
            if let (lat, lng) = sn {
                Task {
                    let hint = await locationHint(lat: lat, lng: lng, knownLocations: knownLocations)
                    await MainActor.run { startName = hint ?? String(format: "%.4f, %.4f", lat, lng) }
                }
            }
            if let (lat, lng) = en {
                Task {
                    let hint = await locationHint(lat: lat, lng: lng, knownLocations: knownLocations)
                    await MainActor.run { endName = hint ?? String(format: "%.4f, %.4f", lat, lng) }
                }
            }
        }
    }

    func pickFile() {
        let panel = NSOpenPanel()
        let fitType = UTType(filenameExtension: "fit") ?? UTType.data
        panel.allowedContentTypes = [fitType]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        parseFile(url)
    }

    func parseFile(_ url: URL) {
        selectedFile = url
        isParsing = true
        errorMsg = ""
        matchedRoute = nil
        parsed = nil

        Task {
            let parser = FitParser(projectRoot: store.projectRoot)
            if var result = await parser.parse(fitPath: url) {
                if result.loopSegment == nil {
                    result.loopSegment = detectLoopSegment(result.trackPoints)
                }
                let match = store.matchRouteByGPS(
                    startLat: result.startLat, startLng: result.startLng,
                    endLat: result.endLat, endLng: result.endLng,
                    trackPoints: result.trackPoints, distanceKm: result.distanceKm
                )
                await MainActor.run {
                    parsed = result
                    if let (route, rev) = match {
                        matchedRoute = rev ? store.reverseRouteName(route) : route
                        isReversed = rev
                    }
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

    func isFitFile(_ url: URL) -> Bool {
        url.pathExtension.caseInsensitiveCompare("fit") == .orderedSame
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
        store.importFitResult(p)
        dismiss()
    }
}
