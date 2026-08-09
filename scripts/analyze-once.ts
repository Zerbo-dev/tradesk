import { getEnv } from "../src/lib/env";
import { runAllAnalyses } from "../src/lib/analysis";
import { formatAnalysis } from "../src/lib/format";

async function main() {
  const env = getEnv();
  const results = await runAllAnalyses(env.pairs, env.timeframe);
  for (const a of results) {
    if (a.skipped) {
      console.log(`[skip] ${a.pair}: ${a.skipped}`);
    } else {
      console.log(formatAnalysis(a));
      console.log("---");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
