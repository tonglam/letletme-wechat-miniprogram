const origin = (process.env.LETLETME_PRODUCTION_ORIGIN || "https://letletme.top").replace(/\/+$/, "");

const checks = [
  {
    name: "website",
    url: `${origin}/`,
    init: { method: "GET" },
  },
  {
    name: "live-context",
    url: `${origin}/api/live/context`,
    init: { method: "GET", headers: { accept: "application/json" } },
  },
  {
    name: "graphql",
    url: `${origin}/api/graphql`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: "query OriginProbe { liveContext { season } }" }),
    },
  },
];

for (const check of checks) {
  const response = await fetch(check.url, { ...check.init, redirect: "manual" });
  const location = response.headers.get("location");
  if (location || response.status < 200 || response.status >= 300) {
    throw new Error(
      `${check.name} origin check failed: status=${response.status} location=${location || "none"}`,
    );
  }
  console.log(`${check.name}: ${response.status} (no redirect)`);
}
