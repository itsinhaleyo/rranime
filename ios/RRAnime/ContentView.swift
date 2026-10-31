import SwiftUI
import UIKit
import WebKit

private let homeURL = URL(string: "https://rranime.online/")!
private let siteHost = "rranime.online"

final class BrowserModel: ObservableObject {
    @Published var webView: WKWebView?
    @Published var progress: Double = 0
    @Published var isLoading = true
    @Published var canGoBack = false

    func goBack() { webView?.goBack() }
    func reload() { webView?.reload() }
}

struct ContentView: View {
    @StateObject private var browser = BrowserModel()

    var body: some View {
        VStack(spacing: 0) {
            if browser.isLoading {
                ProgressView(value: browser.progress)
                    .tint(Color(red: 1, green: 0.235, blue: 0.125))
                    .frame(height: 2)
                    .background(Color(red: 0.067, green: 0.071, blue: 0.082))
            }

            RRAnimeWebView(browser: browser)
                .background(Color(red: 0.067, green: 0.071, blue: 0.082))
                .overlay(alignment: .topTrailing) {
                    if !browser.isLoading {
                        Button(action: browser.reload) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.8))
                                .frame(width: 42, height: 42)
                                .background(.black.opacity(0.5), in: Circle())
                        }
                        .accessibilityLabel("Reload RRAnime")
                        .padding(.trailing, 14)
                        .padding(.top, 14)
                    }
                }
        }
        .background(Color(red: 0.067, green: 0.071, blue: 0.082))
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if browser.canGoBack {
                HStack {
                    Button(action: browser.goBack) {
                        Label("Back", systemImage: "chevron.left")
                            .font(.system(size: 15, weight: .medium))
                    }
                    .disabled(!browser.canGoBack)
                    Spacer()
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(Color(red: 0.067, green: 0.071, blue: 0.082))
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct RRAnimeWebView: UIViewRepresentable {
    @ObservedObject var browser: BrowserModel

    func makeCoordinator() -> Coordinator { Coordinator(browser: browser) }

    func makeUIView(context: Context) -> WKWebView {
        if let existingWebView = browser.webView {
            existingWebView.navigationDelegate = context.coordinator
            existingWebView.uiDelegate = context.coordinator
            context.coordinator.observe(existingWebView)
            return existingWebView
        }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.backgroundColor = UIColor(red: 0.067, green: 0.071, blue: 0.082, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        context.coordinator.observe(webView)
        browser.webView = webView
        webView.load(URLRequest(url: homeURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stopObserving()
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let browser: BrowserModel
        private var progressObservation: NSKeyValueObservation?

        init(browser: BrowserModel) { self.browser = browser }

        func observe(_ webView: WKWebView) {
            progressObservation = webView.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] view, _ in
                DispatchQueue.main.async {
                    self?.browser.progress = view.estimatedProgress
                    self?.browser.isLoading = view.estimatedProgress < 1
                    self?.browser.canGoBack = view.canGoBack
                }
            }
        }

        func stopObserving() {
            progressObservation?.invalidate()
            progressObservation = nil
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if isRRAnimeURL(url) {
                decisionHandler(.allow)
            } else if navigationAction.targetFrame?.isMainFrame == true,
                      ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            } else if navigationAction.targetFrame == nil, isRRAnimeURL(url) {
                decisionHandler(.allow)
            } else if navigationAction.targetFrame == nil,
                      ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            if isRRAnimeURL(url) {
                webView.load(URLRequest(url: url))
            } else if ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            updateNavigationState(webView)
            browser.progress = 1
            browser.isLoading = false
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            browser.isLoading = true
            updateNavigationState(webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            browser.isLoading = false
            updateNavigationState(webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            browser.isLoading = false
            updateNavigationState(webView)
        }

        private func updateNavigationState(_ webView: WKWebView) {
            browser.canGoBack = webView.canGoBack
        }

        private func isRRAnimeURL(_ url: URL) -> Bool {
            guard let host = url.host?.lowercased() else { return false }
            return host == siteHost || host.hasSuffix(".\(siteHost)")
        }
    }
}
