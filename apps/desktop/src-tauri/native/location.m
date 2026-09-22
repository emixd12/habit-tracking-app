#import <AppKit/AppKit.h>
#import <CoreLocation/CoreLocation.h>
#import <Foundation/Foundation.h>

@interface CadenceLocation : NSObject <CLLocationManagerDelegate>
@property CLLocationManager *manager;
@property(copy) void (^complete)(NSDictionary *);
- (void)finish:(NSDictionary *)value;
@end

@implementation CadenceLocation
- (void)finish:(NSDictionary *)value {
    if (!self.complete) return;
    void (^callback)(NSDictionary *) = self.complete;
    self.complete = nil;
    self.manager.delegate = nil;
    [self.manager stopUpdatingLocation];
    callback(value);
}
- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
    if (manager.authorizationStatus == kCLAuthorizationStatusAuthorizedAlways) {
        if (NSApp.active) [manager requestLocation];
        else [self finish:@{@"state": @"unavailable"}];
    } else if (manager.authorizationStatus != kCLAuthorizationStatusNotDetermined) {
        [self finish:@{@"state": @"denied"}];
    }
}
- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
    CLLocation *location = locations.lastObject;
    if (!NSApp.active || !location || !CLLocationCoordinate2DIsValid(location.coordinate)) {
        [self finish:@{@"state": @"unavailable"}]; return;
    }
    [self finish:@{@"state": @"available", @"latitude": @(location.coordinate.latitude),
        @"longitude": @(location.coordinate.longitude), @"accuracyMeters": @(location.horizontalAccuracy),
        @"sampledAt": @([location.timestamp timeIntervalSince1970] * 1000)}];
}
- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
    [self finish:@{@"state": error.code == kCLErrorDenied ? @"denied" : @"unavailable"}];
}
@end

// Called on a Rust blocking worker. Core Location stays on the main run loop.
char *cadence_location_request(bool requestPermission) {
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    __block NSDictionary *result = @{@"state": @"unavailable"};
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!NSApp.active || ![CLLocationManager locationServicesEnabled]) {
            dispatch_semaphore_signal(done); return;
        }
        CadenceLocation *adapter = [CadenceLocation new];
        adapter.manager = [CLLocationManager new];
        adapter.manager.desiredAccuracy = kCLLocationAccuracyHundredMeters;
        adapter.complete = ^(NSDictionary *value) { result = value; dispatch_semaphore_signal(done); };
        CLAuthorizationStatus status = adapter.manager.authorizationStatus;
        if (status == kCLAuthorizationStatusDenied || status == kCLAuthorizationStatusRestricted) {
            [adapter finish:@{@"state": @"denied"}]; return;
        }
        if (status == kCLAuthorizationStatusNotDetermined && !requestPermission) {
            [adapter finish:@{@"state": @"prompt"}]; return;
        }
        adapter.manager.delegate = adapter;
        if (status == kCLAuthorizationStatusNotDetermined) [adapter.manager requestWhenInUseAuthorization];
        else [adapter.manager requestLocation];
        // This block retains the one-shot adapter until completion or deadline.
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 12 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            [adapter finish:@{@"state": @"unavailable"}];
        });
    });
    dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
    NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}
