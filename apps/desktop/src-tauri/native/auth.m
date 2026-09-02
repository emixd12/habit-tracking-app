#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <Security/Security.h>

bool cadence_auth_open_url(const char *value) {
    @autoreleasepool {
        NSURL *url = [NSURL URLWithString:[NSString stringWithUTF8String:value]];
        return url && [NSWorkspace.sharedWorkspace openURL:url];
    }
}

static NSDictionary *keychainQuery(NSString *account) {
#if CADENCE_LEGACY_KEYCHAIN_QA
    return @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
              (__bridge id)kSecAttrService: @"app.cadence.desktop.auth.legacy-qa",
              (__bridge id)kSecAttrAccount: account,
              (__bridge id)kSecAttrSynchronizable: @NO };
#else
    return @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
              (__bridge id)kSecAttrService: @"app.cadence.desktop.auth",
              (__bridge id)kSecAttrAccount: account,
              (__bridge id)kSecUseDataProtectionKeychain: @YES,
              (__bridge id)kSecAttrSynchronizable: @NO };
#endif
}

bool cadence_auth_secret_set(const char *key, const char *value) {
    @autoreleasepool {
        NSString *account = [NSString stringWithUTF8String:key];
        NSData *data = [[NSString stringWithUTF8String:value] dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *query = keychainQuery(account);
        OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query,
            (__bridge CFDictionaryRef)@{ (__bridge id)kSecValueData: data });
        if (status == errSecItemNotFound) {
            NSMutableDictionary *item = [query mutableCopy];
            item[(__bridge id)kSecValueData] = data;
            item[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
            status = SecItemAdd((__bridge CFDictionaryRef)item, NULL);
        }
        return status == errSecSuccess;
    }
}

char *cadence_auth_secret_get(const char *key) {
    @autoreleasepool {
        NSMutableDictionary *query = [keychainQuery([NSString stringWithUTF8String:key]) mutableCopy];
        query[(__bridge id)kSecReturnData] = @YES;
        query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
        CFTypeRef result = NULL;
        if (SecItemCopyMatching((__bridge CFDictionaryRef)query, &result) != errSecSuccess) return NULL;
        NSData *data = CFBridgingRelease(result);
        NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return value ? strdup(value.UTF8String) : NULL;
    }
}

bool cadence_auth_secret_remove(const char *key) {
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)keychainQuery([NSString stringWithUTF8String:key]));
    return status == errSecSuccess || status == errSecItemNotFound;
}

void cadence_auth_free(char *value) { free(value); }
