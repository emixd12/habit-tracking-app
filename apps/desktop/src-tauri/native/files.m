#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

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
char *cadence_choose_database_backup_path(const char *filename) {
    @autoreleasepool {
        NSSavePanel *panel = [NSSavePanel savePanel];
        panel.title = @"Back Up Cadence Data";
        panel.nameFieldStringValue = [NSString stringWithUTF8String:filename];
        panel.canCreateDirectories = YES;
        panel.allowedContentTypes = @[[UTType typeWithFilenameExtension:@"sqlite3"]];
        if ([panel runModal] != NSModalResponseOK) return NULL;
        return strdup(panel.URL.fileSystemRepresentation);
    }
}
char *cadence_choose_database_restore_path(void) {
    @autoreleasepool {
        NSOpenPanel *panel = [NSOpenPanel openPanel];
        panel.title = @"Restore Cadence Data";
        panel.canChooseDirectories = NO;
        panel.allowsMultipleSelection = NO;
        panel.allowedContentTypes = @[[UTType typeWithFilenameExtension:@"sqlite3"]];
        if ([panel runModal] != NSModalResponseOK) return NULL;
        return strdup(panel.URL.fileSystemRepresentation);
    }
}
bool cadence_reveal_database(const char *path) {
    @autoreleasepool {
        NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
        [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[url]];
        return YES;
    }
}
void cadence_free_export_path(char *value) { free(value); }
