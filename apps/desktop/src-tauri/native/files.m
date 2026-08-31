#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

// Runs on the application main thread. The selected path never crosses frontend IPC.
char *cadence_choose_export_path(const char *filename) {
    @autoreleasepool {
        NSSavePanel *panel = [NSSavePanel savePanel];
        panel.title = @"Export Cadence data";
        panel.nameFieldStringValue = [NSString stringWithUTF8String:filename];
        panel.canCreateDirectories = YES;
        panel.extensionHidden = NO;
        if ([panel runModal] != NSModalResponseOK) return NULL;
        return strdup(panel.URL.fileSystemRepresentation);
    }
}
void cadence_free_export_path(char *value) { free(value); }
