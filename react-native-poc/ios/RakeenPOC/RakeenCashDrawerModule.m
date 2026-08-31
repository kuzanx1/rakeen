#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RakeenCashDrawerModule, NSObject)

RCT_EXTERN_METHOD(open:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(capabilities:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
