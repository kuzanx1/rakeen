import Foundation
import React
import UIKit

/// Deliberately minimal — exists only to prove the JS -> NativeModules ->
/// Swift round trip works for a THIRD module, not to become a real
/// device-info API. See react-native-poc/src/platform/device.ts.
@objc(RakeenDeviceModule)
class RakeenDeviceModule: NSObject {

    @objc
    static func requiresMainQueueSetup() -> Bool { return false }

    @objc
    func getInfo(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "platform": "ios",
            "osVersion": UIDevice.current.systemVersion,
        ])
    }
}
