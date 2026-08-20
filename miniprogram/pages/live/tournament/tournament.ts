/**
 * Route entry for the live tournament page.
 *
 * The request controller and display model live beside the route so this
 * file remains a thin page registration boundary.
 */
export {
  noLiveEventState,
  partialTournamentErrorSuffix,
  shouldClearTournamentRowsError
} from "./tournament.controller";
import "./tournament.controller";
