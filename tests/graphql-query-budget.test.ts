import {
  PLAYER_PICKER_PAGE_LIMIT,
  PLAYERS_FOR_PICKER_QUERY
} from "../miniprogram/services/player.service";
import {
  EVENT_DREAM_TEAM_QUERY,
  EVENT_ELITE_ELEMENTS_QUERY,
  EVENT_OVERALL_TRANSFERS_QUERY
} from "../miniprogram/services/summary.service";
import { GET_MY_FPL_COMPETITIONS_DESK } from "../miniprogram/services/tournament.service";
import { parse, visit } from "graphql";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function operationName(query: string): string {
  const match = query.match(/query\s+([A-Za-z0-9_]+)/);
  return match?.[1] || "";
}

function astNodeCount(query: string): number {
  let count = 0;
  visit(parse(query), { enter: () => void (count += 1) });
  return count;
}

assert(PLAYER_PICKER_PAGE_LIMIT === 40, "player picker stays within the production complexity budget");
assert(operationName(PLAYERS_FOR_PICKER_QUERY) === "PlayersForPicker", "player picker operation name");

assert(operationName(EVENT_DREAM_TEAM_QUERY) === "EventDreamTeam", "dream team is a separate operation");
assert(operationName(EVENT_ELITE_ELEMENTS_QUERY) === "EventEliteElements", "elite players are a separate operation");
assert(operationName(EVENT_OVERALL_TRANSFERS_QUERY) === "EventOverallTransfers", "transfers are a separate operation");
assert(EVENT_DREAM_TEAM_QUERY.includes("dreamTeam"), "dream team query selects dreamTeam");
assert(!EVENT_DREAM_TEAM_QUERY.includes("topPerformers"), "dream team query does not reintroduce elite payload");
assert(EVENT_ELITE_ELEMENTS_QUERY.includes("topPerformers"), "elite query selects topPerformers");
assert(!EVENT_ELITE_ELEMENTS_QUERY.includes("dreamTeam"), "elite query does not reintroduce dream payload");
assert(EVENT_OVERALL_TRANSFERS_QUERY.includes("topTransfersIn"), "transfer query selects inbound transfers");
assert(EVENT_OVERALL_TRANSFERS_QUERY.includes("topTransfersOut"), "transfer query selects outbound transfers");
assert(astNodeCount(GET_MY_FPL_COMPETITIONS_DESK) <= 200, "My FPL competitions desk stays within the production AST limit");
assert(!GET_MY_FPL_COMPETITIONS_DESK.includes("topPerformers"), "desk omits board-derived top performers");
assert(!GET_MY_FPL_COMPETITIONS_DESK.includes("risers"), "desk omits board-derived risers");
assert(!GET_MY_FPL_COMPETITIONS_DESK.includes("fallers"), "desk omits board-derived fallers");

console.log("graphql-query-budget tests passed");
