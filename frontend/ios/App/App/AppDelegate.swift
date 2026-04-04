import UIKit
import Capacitor
import FirebaseCore
import FirebaseAuth

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let appGroup = "group.com.bugra.aether"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()

        // Sync Firebase auth token to App Group shared storage for Share Extension
        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            if let user = user {
                user.getIDToken { token, _ in
                    if let token = token {
                        self?.saveToken(token)
                    }
                }
            } else {
                self?.deleteToken()
            }
        }

        return true
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        Auth.auth().currentUser?.getIDToken { [weak self] token, _ in
            if let token = token {
                self?.saveToken(token)
            }
        }
    }

    // MARK: - App Group Shared Storage

    private func saveToken(_ token: String) {
        let defaults = UserDefaults(suiteName: appGroup)
        defaults?.set(token, forKey: "authToken")
        // Also save refresh token for Share Extension to refresh expired tokens
        if let refreshToken = Auth.auth().currentUser?.refreshToken {
            defaults?.set(refreshToken, forKey: "refreshToken")
        }
        defaults?.synchronize()
    }

    private func deleteToken() {
        let defaults = UserDefaults(suiteName: appGroup)
        defaults?.removeObject(forKey: "authToken")
        defaults?.removeObject(forKey: "refreshToken")
        defaults?.synchronize()
    }

    // MARK: - URL Handling

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
