import {
  PRIVACY_AGREE_BUTTON_ID,
  hasPendingPrivacyAuthorization,
  installPrivacyAuthorizationHandler,
  isClipboardApiBlocked,
  isPrivacyAuthorizationDenied,
  isPrivacyScopeUndeclared,
  markClipboardApiBlocked,
  resetPrivacyAuthorizationForTests,
  resolvePrivacyAuthorization,
  subscribePrivacyPrompt
} from "../miniprogram/utils/privacy";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function testErrorClassification(): void {
  assert(isPrivacyScopeUndeclared({ errno: 112, errMsg: "setClipboardData:fail api scope is not declared in the privacy agreement" }), "errno 112");
  assert(isPrivacyScopeUndeclared("setClipboardData:fail api scope is not declared in the privacy agreement"), "message-only 112");
  assert(!isPrivacyScopeUndeclared({ errno: 103, errMsg: "privacy permission denied" }), "denied is not undeclared");
  assert(isPrivacyAuthorizationDenied({ errno: 103 }), "errno 103");
  assert(isPrivacyAuthorizationDenied({ errno: 104 }), "errno 104");
  assert(!isPrivacyAuthorizationDenied({ errno: 112 }), "112 is not a user denial");
}

function testAuthorizationBus(): void {
  resetPrivacyAuthorizationForTests();
  const prompts: string[] = [];
  const resolved: string[] = [];
  let captured: ((resolve: (result: { event: "agree" | "disagree"; buttonId?: string }) => void, eventInfo: { referrer: string }) => void) | undefined;

  (globalThis as { wx?: unknown }).wx = {
    onNeedPrivacyAuthorization(callback: typeof captured) {
      captured = callback;
    },
    getPrivacySetting({ success }: { success?: (res: { needAuthorization: boolean; privacyContractName: string }) => void }) {
      success?.({ needAuthorization: true, privacyContractName: "《LetLetMe隐私保护指引》" });
    }
  };

  installPrivacyAuthorizationHandler();
  installPrivacyAuthorizationHandler();
  const unsubscribe = subscribePrivacyPrompt((info) => {
    prompts.push(info.privacyContractName);
  });

  captured?.((result) => resolved.push(`${result.event}:${result.buttonId || ""}`), { referrer: "setClipboardData" });
  captured?.((result) => resolved.push(`${result.event}:${result.buttonId || ""}`), { referrer: "setClipboardData" });

  assert(hasPendingPrivacyAuthorization(), "two clipboard calls stay queued");
  assert(prompts.includes("《LetLetMe隐私保护指引》"), "getPrivacySetting updates the contract name");
  assert(prompts.length >= 2, "each privacy API call notifies the mounted dialog");

  resolvePrivacyAuthorization({ event: "agree", buttonId: PRIVACY_AGREE_BUTTON_ID });
  assertEqual(resolved.join(","), "agree:privacy-agree-btn,agree:privacy-agree-btn", "all pending resolves flush together");
  assert(!hasPendingPrivacyAuthorization(), "queue is empty after agree");

  unsubscribe();
  markClipboardApiBlocked();
  assert(isClipboardApiBlocked(), "112 caches the blocked clipboard API");
  resetPrivacyAuthorizationForTests();
  assert(!isClipboardApiBlocked(), "test reset clears the clipboard block");
}

testErrorClassification();
testAuthorizationBus();
console.log("privacy tests passed");
