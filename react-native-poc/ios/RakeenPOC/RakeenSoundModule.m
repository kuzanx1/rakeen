#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RakeenSoundModule, NSObject)

RCT_EXTERN_METHOD(playTap:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(playAlert:(NSString *)kind
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
