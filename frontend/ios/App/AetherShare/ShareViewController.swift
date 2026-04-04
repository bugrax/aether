import UIKit
import UniformTypeIdentifiers
import Security

class ShareViewController: UIViewController {

    private let containerView = UIView()
    private let titleLabel = UILabel()
    private let urlLabel = UILabel()
    private let statusLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        extractURL()
    }

    private func setupUI() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.6)
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(dismissTapped)))

        containerView.backgroundColor = UIColor(red: 0.08, green: 0.08, blue: 0.08, alpha: 1)
        containerView.layer.cornerRadius = 20
        containerView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(containerView)

        titleLabel.text = "⚡ Aether"
        titleLabel.font = UIFont.systemFont(ofSize: 22, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(titleLabel)

        urlLabel.font = UIFont.systemFont(ofSize: 12, weight: .regular)
        urlLabel.textColor = UIColor(white: 0.5, alpha: 1)
        urlLabel.numberOfLines = 2
        urlLabel.lineBreakMode = .byTruncatingMiddle
        urlLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(urlLabel)

        statusLabel.text = "Saving..."
        statusLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        statusLabel.textColor = UIColor(red: 0.73, green: 0.62, blue: 1, alpha: 1)
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(statusLabel)

        spinner.color = UIColor(red: 0.73, green: 0.62, blue: 1, alpha: 1)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()
        containerView.addSubview(spinner)

        NSLayoutConstraint.activate([
            containerView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            containerView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            containerView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            containerView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40),

            titleLabel.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 24),
            titleLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 24),

            urlLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            urlLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 24),
            urlLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -24),

            spinner.topAnchor.constraint(equalTo: urlLabel.bottomAnchor, constant: 20),
            spinner.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 24),

            statusLabel.centerYAnchor.constraint(equalTo: spinner.centerYAnchor),
            statusLabel.leadingAnchor.constraint(equalTo: spinner.trailingAnchor, constant: 10),

            containerView.bottomAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 24),
        ])
    }

    @objc private func dismissTapped() {
        done()
    }

    private func extractURL() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            showError("No content found")
            return
        }

        // First check NSExtensionItem's attributedContentText for URLs
        for item in items {
            if let text = item.attributedContentText?.string,
               let url = extractURLFromText(text) {
                handleFoundURL(url)
                return
            }
        }

        // Collect all providers
        var allProviders: [NSItemProvider] = []
        for item in items {
            if let attachments = item.attachments {
                allProviders.append(contentsOf: attachments)
            }
        }

        if allProviders.isEmpty {
            showError("No content found")
            return
        }

        // Try all content types in order
        tryExtract(from: allProviders, typeIndex: 0)
    }

    private let extractionTypes = [
        UTType.url.identifier,
        UTType.plainText.identifier,
        "public.url",
        "public.plain-text",
    ]

    private func tryExtract(from providers: [NSItemProvider], typeIndex: Int) {
        if typeIndex >= extractionTypes.count {
            showError("No URL found in shared content")
            return
        }

        let typeId = extractionTypes[typeIndex]

        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(typeId) {
                provider.loadItem(forTypeIdentifier: typeId, options: nil) { [weak self] data, error in
                    DispatchQueue.main.async {
                        // Try as URL
                        if let url = data as? URL, url.scheme?.hasPrefix("http") == true {
                            self?.handleFoundURL(url.absoluteString)
                            return
                        }
                        // Try as NSURL
                        if let url = data as? NSURL, let str = url.absoluteString, str.hasPrefix("http") {
                            self?.handleFoundURL(str)
                            return
                        }
                        // Try as String with URL inside
                        if let text = data as? String, let url = self?.extractURLFromText(text) {
                            self?.handleFoundURL(url)
                            return
                        }
                        // Try as Data → String
                        if let d = data as? Data, let text = String(data: d, encoding: .utf8),
                           let url = self?.extractURLFromText(text) {
                            self?.handleFoundURL(url)
                            return
                        }
                        // This type didn't work, try next
                        self?.tryExtract(from: providers, typeIndex: typeIndex + 1)
                    }
                }
                return
            }
        }

        // No provider had this type, try next
        tryExtract(from: providers, typeIndex: typeIndex + 1)
    }

    private func handleFoundURL(_ url: String) {
        urlLabel.text = url
        saveToAether(url: url)
    }

    /// Extract first HTTP(S) URL from a block of text
    private func extractURLFromText(_ text: String) -> String? {
        // First try: entire text is a URL
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), url.scheme?.hasPrefix("http") == true {
            return trimmed
        }

        // Second try: regex to find URL in text
        let pattern = "https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+"
        if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
            let range = NSRange(text.startIndex..., in: text)
            if let match = regex.firstMatch(in: text, options: [], range: range) {
                if let matchRange = Range(match.range, in: text) {
                    return String(text[matchRange])
                }
            }
        }

        return nil
    }

    private func saveToAether(url: String) {
        guard let token = readToken() else {
            showError("Open Aether app first to sign in")
            return
        }

        postShare(url: url, token: token) { [weak self] result in
            switch result {
            case .success:
                self?.showSuccess()
            case .tokenExpired:
                // Try refreshing the token
                self?.refreshAndRetry(url: url)
            case .error(let msg):
                self?.showError(msg)
            }
        }
    }

    private enum ShareResult {
        case success, tokenExpired, error(String)
    }

    private func postShare(url: String, token: String, completion: @escaping (ShareResult) -> Void) {
        guard let apiURL = URL(string: "https://app.aether.relayhaus.org/api/v1/share") else { return }
        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["url": url])
        request.timeoutInterval = 15

        URLSession.shared.dataTask(with: request) { _, response, error in
            DispatchQueue.main.async {
                if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
                    completion(.success)
                } else if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                    completion(.tokenExpired)
                } else {
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    completion(.error("Error \(code): \(error?.localizedDescription ?? "Failed")"))
                }
            }
        }.resume()
    }

    private func refreshAndRetry(url: String) {
        statusLabel.text = "Refreshing token..."

        guard let refreshToken = readRefreshToken() else {
            showError("Open Aether app to sign in")
            return
        }

        // Firebase REST API to refresh ID token
        let firebaseAPIKey = "AIzaSyA9OLBaGBRPCQCCJmrVQfGzXCasSBd-N_4"
        guard let refreshURL = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(firebaseAPIKey)") else { return }

        var request = URLRequest(url: refreshURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = "grant_type=refresh_token&refresh_token=\(refreshToken)".data(using: .utf8)
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let newToken = json["id_token"] as? String else {
                    self?.showError("Token refresh failed — open Aether app")
                    return
                }

                // Save the new token
                let defaults = UserDefaults(suiteName: "group.com.bugra.aether")
                defaults?.set(newToken, forKey: "authToken")
                if let newRefresh = json["refresh_token"] as? String {
                    defaults?.set(newRefresh, forKey: "refreshToken")
                }
                defaults?.synchronize()

                // Retry the share with new token
                self?.postShare(url: url, token: newToken) { result in
                    switch result {
                    case .success:
                        self?.showSuccess()
                    case .tokenExpired:
                        self?.showError("Auth failed — open Aether app")
                    case .error(let msg):
                        self?.showError(msg)
                    }
                }
            }
        }.resume()
    }

    // MARK: - Token from App Group

    private func readToken() -> String? {
        let defaults = UserDefaults(suiteName: "group.com.bugra.aether")
        return defaults?.string(forKey: "authToken")
    }

    private func readRefreshToken() -> String? {
        let defaults = UserDefaults(suiteName: "group.com.bugra.aether")
        return defaults?.string(forKey: "refreshToken")
    }

    // MARK: - UI States

    private func showSuccess() {
        spinner.stopAnimating()
        statusLabel.text = "✓ Saved to Aether"
        statusLabel.textColor = UIColor(red: 0.38, green: 0.98, blue: 0.89, alpha: 1)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.done()
        }
    }

    private func showError(_ message: String) {
        spinner.stopAnimating()
        statusLabel.text = message
        statusLabel.textColor = UIColor(red: 1, green: 0.43, blue: 0.52, alpha: 1)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.done()
        }
    }

    private func done() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
