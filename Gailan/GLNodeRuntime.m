//
//  GLNodeRuntime.m
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.

#import "GLNodeRuntime.h"
#include <fcntl.h>
#include <signal.h>
#include <unistd.h>

// per step: finding node, then asking it its version
static const NSTimeInterval GLNodeProbePatience = 3.0;

static NSString* GLChosenNodePath = nil;

/* Major, minor and patch, or nil for anything that is not exactly three runs of ascii
   digits. A leading v is dropped, since node --version prints one. */
static NSArray<NSNumber*>* GLParseNodeVersion(NSString* text)
{
    if (![text isKindOfClass:[NSString class]]) return nil;

    NSString* trimmed = [text stringByTrimmingCharactersInSet:
        [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if ([trimmed hasPrefix:@"v"]) trimmed = [trimmed substringFromIndex:1];

    NSArray<NSString*>* parts = [trimmed componentsSeparatedByString:@"."];
    if (parts.count != 3) return nil;

    // decimalDigitCharacterSet takes every script's digits, which integerValue does not
    NSCharacterSet* notDigits = [[NSCharacterSet
        characterSetWithCharactersInString:@"0123456789"] invertedSet];

    NSMutableArray<NSNumber*>* numbers = [NSMutableArray array];
    for (NSString* part in parts) {
        if (part.length == 0 || part.length > 9) return nil;
        if ([part rangeOfCharacterFromSet:notDigits].location != NSNotFound) return nil;
        [numbers addObject:@(part.integerValue)];
    }
    return numbers;
}

@implementation GLNodeRuntime

+ (BOOL)acceptsVersion:(NSString*)candidate bundled:(NSString*)bundled
{
    NSArray<NSNumber*>* mine = GLParseNodeVersion(candidate);
    NSArray<NSNumber*>* minimum = GLParseNodeVersion(bundled);
    if (!mine || !minimum) return NO;

    // odd majors never become LTS, and are dropped from support within months
    if (mine[0].integerValue % 2 != 0) return NO;

    for (NSUInteger i = 0; i < 3; i++) {
        if (mine[i].integerValue > minimum[i].integerValue) return YES;
        if (mine[i].integerValue < minimum[i].integerValue) return NO;
    }
    return YES;
}

+ (NSString*)bundledPath
{
    return [[NSBundle mainBundle] pathForResource:@"localnode" ofType:nil];
}

+ (NSString*)chosenPath
{
    return GLChosenNodePath ?: [self bundledPath];
}

+ (NSString*)executablePath
{
    GLChosenNodePath = [self resolve];
    return GLChosenNodePath;
}

+ (NSString*)resolve
{
    NSString* bundled = [self bundledPath];
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];

    if (![defaults boolForKey:@"useSystemNode"]) {
        NSLog(@"node runtime: bundled (useSystemNode is off)");
        return bundled;
    }

    // a half built bundle must not decide on its own to run something else
    NSString* versionFile = [[NSBundle mainBundle]
        pathForResource:@"node-version" ofType:nil];
    NSString* bundledVersion = versionFile
        ? [[NSString stringWithContentsOfFile:versionFile
                                     encoding:NSUTF8StringEncoding
                                        error:nil]
              stringByTrimmingCharactersInSet:
                  [NSCharacterSet whitespaceAndNewlineCharacterSet]]
        : nil;
    if (bundledVersion.length == 0) {
        NSLog(@"node runtime: bundled, because the app carries no node-version to "
              @"compare a system node against");
        return bundled;
    }

    NSString* shellName = [[defaults stringForKey:@"shell"] isEqualToString:@"fish"]
        ? @"fish" : @"zsh";
    NSString* shellPath = [self pathOfShell:shellName];
    if (!shellPath) {
        NSLog(@"node runtime: bundled, because %@ could not be found to look for node",
              shellName);
        return bundled;
    }

    // a login shell, so the PATH that brew, nvm or volta set up is the one searched
    NSString* why = nil;
    NSString* found = [self outputOf:shellPath
                           arguments:@[@"-lc", @"command -v node"]
                              reason:&why];
    NSString* nodePath = [self nodePathIn:found];
    if (!nodePath) {
        NSLog(@"node runtime: bundled, because no node was found through %@ -l%@",
              shellName, why ? [NSString stringWithFormat:@" (%@)", why] : @"");
        return bundled;
    }

    why = nil;
    NSString* reported = [self outputOf:nodePath
                              arguments:@[@"-p", @"process.versions.node"]
                                 reason:&why];
    NSString* version = [reported stringByTrimmingCharactersInSet:
        [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (version.length == 0) {
        NSLog(@"node runtime: bundled, because %@ did not report a version (%@)",
              nodePath, why ?: @"no output");
        return bundled;
    }

    if (![self acceptsVersion:version bundled:bundledVersion]) {
        NSLog(@"node runtime: bundled, because system node %@ at %@ is not accepted "
              @"against bundled %@ (needs an even major and at least the bundled version)",
              version, nodePath, bundledVersion);
        return bundled;
    }

    NSLog(@"node runtime: system node %@ at %@ (bundled is %@)",
          version, nodePath, bundledVersion);
    return nodePath;
}

/* zsh ships with macOS. fish does not, and a GUI app's PATH leaves out where brew puts
   it, so its usual homes are tried after PATH. */
+ (NSString*)pathOfShell:(NSString*)name
{
    if ([name isEqualToString:@"zsh"]) return @"/bin/zsh";

    NSString* inherited = [[NSProcessInfo processInfo] environment][@"PATH"] ?: @"";
    NSMutableArray<NSString*>* places = [[inherited componentsSeparatedByString:@":"]
        mutableCopy];
    [places addObjectsFromArray:@[@"/opt/homebrew/bin", @"/usr/local/bin"]];

    NSFileManager* files = [NSFileManager defaultManager];
    for (NSString* place in places) {
        if (place.length == 0) continue;
        NSString* candidate = [place stringByAppendingPathComponent:name];
        if ([files isExecutableFileAtPath:candidate]) return candidate;
    }
    return nil;
}

/* A login shell with a shell integration prints OSC sequences ahead of anything else,
   so they are stripped and the last absolute path printed is taken. */
+ (NSString*)nodePathIn:(NSString*)output
{
    if (output.length == 0) return nil;

    NSRegularExpression* osc = [NSRegularExpression
        regularExpressionWithPattern:@"\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)"
                             options:0
                               error:nil];
    NSString* clean = [osc stringByReplacingMatchesInString:output
                                                    options:0
                                                      range:NSMakeRange(0, output.length)
                                               withTemplate:@""];

    NSArray<NSString*>* lines = [clean componentsSeparatedByCharactersInSet:
        [NSCharacterSet newlineCharacterSet]];
    for (NSString* line in [lines reverseObjectEnumerator]) {
        NSString* path = [line stringByTrimmingCharactersInSet:
            [NSCharacterSet whitespaceCharacterSet]];
        if (![path hasPrefix:@"/"]) continue;
        return [[NSFileManager defaultManager] isExecutableFileAtPath:path] ? path : nil;
    }
    return nil;
}

/* What a program printed, or nil when it could not start, exited non-zero or outlived
   its patience, with the reason handed back.

   The output is read once the program has gone, and without blocking: what is asked
   for is a line, far below what a pipe holds, and a shell can leave a background child
   holding the pipe open, which a blocking read would wait on forever. */
+ (NSString*)outputOf:(NSString*)path
            arguments:(NSArray<NSString*>*)arguments
               reason:(NSString**)reason
{
    NSTask* task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:path];
    task.arguments = arguments;
    task.standardInput = [NSFileHandle fileHandleWithNullDevice];
    task.standardError = [NSFileHandle fileHandleWithNullDevice];
    NSPipe* pipe = [NSPipe pipe];
    task.standardOutput = pipe;

    dispatch_semaphore_t finished = dispatch_semaphore_create(0);
    task.terminationHandler = ^(NSTask* theTask) {
        dispatch_semaphore_signal(finished);
    };

    NSError* error = nil;
    if (![task launchAndReturnError:&error]) {
        if (reason) *reason = error.localizedDescription ?: @"could not start";
        return nil;
    }

    dispatch_time_t deadline = dispatch_time(
        DISPATCH_TIME_NOW, (int64_t)(GLNodeProbePatience * NSEC_PER_SEC));
    if (dispatch_semaphore_wait(finished, deadline) != 0) {
        [task terminate];
        // a login shell busy in its rc files may not stop for a polite request
        dispatch_time_t grace = dispatch_time(
            DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC));
        if (dispatch_semaphore_wait(finished, grace) != 0) {
            kill(task.processIdentifier, SIGKILL);
        }
        if (reason) {
            *reason = [NSString stringWithFormat:@"no answer within %.0fs",
                GLNodeProbePatience];
        }
        return nil;
    }

    NSMutableData* output = [NSMutableData data];
    int fd = pipe.fileHandleForReading.fileDescriptor;
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
    char buffer[4096];
    ssize_t count;
    while ((count = read(fd, buffer, sizeof buffer)) > 0) {
        [output appendBytes:buffer length:(NSUInteger)count];
    }
    [pipe.fileHandleForReading closeFile];

    if (task.terminationStatus != 0) {
        if (reason) {
            *reason = [NSString stringWithFormat:@"exited with status %d",
                task.terminationStatus];
        }
        return nil;
    }

    NSString* text = [[NSString alloc] initWithData:output
                                           encoding:NSUTF8StringEncoding];
    if (!text && reason) *reason = @"printed something that is not utf-8";
    return text;
}

@end
