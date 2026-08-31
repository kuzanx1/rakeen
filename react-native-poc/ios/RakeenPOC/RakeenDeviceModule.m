#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RakeenDeviceModule, NSObject)

RCT_EXTERN_METHOD(getInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
