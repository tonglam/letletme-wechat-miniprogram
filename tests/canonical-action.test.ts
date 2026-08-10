import {
  canonicalAction,
  isAllowedWebsiteUrl,
  openWebsiteAction,
  type CanonicalActionType
} from "../miniprogram/utils/canonical-action";

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

function testAllowlist(): void {
  assert(isAllowedWebsiteUrl("https://www.letletme.top/zh-CN/account"), "allowlisted https URL passes");
  assert(isAllowedWebsiteUrl("https://letletme.top/zh-CN"), "bare domain passes");
  assert(!isAllowedWebsiteUrl("http://www.letletme.top/zh-CN"), "http is rejected");
  assert(!isAllowedWebsiteUrl("https://evil-letletme.top/zh-CN"), "lookalike host is rejected");
  assert(!isAllowedWebsiteUrl("https://www.letletme.top.evil.com/"), "suffix host is rejected");
  assert(!isAllowedWebsiteUrl("https://sub.letletme.top/"), "unlisted subdomain is rejected");
  assert(!isAllowedWebsiteUrl(""), "empty string is rejected");
  assert(!isAllowedWebsiteUrl("not a url"), "garbage is rejected");
}

function testActionTable(): void {
  const types: CanonicalActionType[] = [
    "ACCOUNT_LINK",
    "TEAM_BIND",
    "LEAGUE_PREPARE",
    "LEAGUE_MANAGE",
    "CREATE_COMPETITION",
    "MANAGE_COMPETITION",
    "VIEW_COMPETITION",
    "OPEN_HOME"
  ];
  for (const type of types) {
    const action = canonicalAction(type);
    assertEqual(action.actionType, type, `${type} keeps its type`);
    assert(isAllowedWebsiteUrl(action.href), `${type} maps to an allowlisted URL`);
    assert(!action.href.includes("?"), `${type} stays a static URL with no interpolated parameters`);
  }
}

function testOpenWebsiteAction(): void {
  const copied: string[] = [];
  const toasts: string[] = [];
  (globalThis as { wx?: unknown }).wx = {
    setClipboardData: ({ data, success }: { data: string; success?: () => void }) => {
      copied.push(data);
      success?.();
    },
    showToast: ({ title }: { title: string }) => {
      toasts.push(title);
    }
  };

  assert(openWebsiteAction(canonicalAction("LEAGUE_PREPARE")), "allowlisted action is accepted");
  assertEqual(copied.length, 1, "the href lands on the clipboard");
  assert(copied[0].includes("letletme.top"), "clipboard holds the website URL");
  assert(toasts[0].includes("浏览器"), "the toast explains the browser handoff");

  assert(!openWebsiteAction({ actionType: "OPEN_HOME", href: "https://evil.com/" }), "rejected URL returns false");
  assertEqual(copied.length, 1, "a rejected URL never touches the clipboard");
}

function main(): void {
  testAllowlist();
  testActionTable();
  testOpenWebsiteAction();
  console.log("canonical-action tests passed");
}

main();
