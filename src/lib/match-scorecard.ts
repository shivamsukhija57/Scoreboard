import type { CompetitionData, CricketDelivery, CricketInnings, EventDefinition, Fixture, MatchEvent, MatchEventKind, MatchScoreInput, MatchScorecard } from "./domain";
// Explicit extension so the Node test runner (type stripping) can load it too.
import { fixtureAwards, fixtureOutcome, walkoverScores } from "./points-rules.ts";

const basketball = new Set(["basketball"]);
const football = new Set(["football"]);
const cricket = new Set(["cricket"]);
const racket = new Set(["badminton", "table-tennis", "lawn-tennis", "tennis", "squash", "pickleball"]);
const rally = new Set(["volleyball", "throwball"]);
const goals = new Set(["foosball", "fifa"]);

export function sportIdForFixture(data: CompetitionData, fixture: Fixture): string {
  const event = data.events.find((item) => item.id === fixture.eventId);
  return data.sports.find((item) => item.id === event?.sportId)?.id ?? "";
}

export function isAthleticsFixture(data: CompetitionData, fixture: Fixture): boolean {
  return sportIdForFixture(data, fixture) === "athletics";
}

export function recordCricketDelivery(data: CompetitionData, fixture: Fixture, input: MatchScoreInput, actor: string): string | null {
  const payload = input.cricketDelivery;
  if (!payload || sportIdForFixture(data, fixture) !== "cricket") return "Cricket delivery details are required.";
  if (fixture.status !== "live") return "Cricket scoring is available only while the match is live.";
  const card = fixture.scorecard ??= emptyCard(fixture);
  const cricket = card.cricket ??= { innings: [] };
  const innings = cricket.innings.at(-1);
  if (!innings || innings.completed) return "Start the next innings before scoring.";
  if (payload.battingSide !== innings.battingSide || payload.batterId === payload.nonStrikerId) return "Choose the active batting side and two different batters.";
  const participantIds = data.entries.filter((entry) => entry.eventId === fixture.eventId && entry.sectionId === (innings.battingSide === "a" ? fixture.sectionA : fixture.sectionB)).flatMap((entry) => entry.participantIds);
  const bowlingIds = data.entries.filter((entry) => entry.eventId === fixture.eventId && entry.sectionId === (innings.battingSide === "a" ? fixture.sectionB : fixture.sectionA)).flatMap((entry) => entry.participantIds);
  if (![payload.batterId, payload.nonStrikerId].every((id) => participantIds.includes(id)) || !bowlingIds.includes(payload.bowlerId)) return "Batters and bowler must belong to the submitted match rosters.";
  const dismissedIds=new Set(innings.deliveries.filter(item=>item.wicket&&item.wicket.kind!=="retired-hurt"&&!item.reversedAt).map(item=>item.wicket!.playerOutId));
  if(dismissedIds.has(payload.batterId)||dismissedIds.has(payload.nonStrikerId))return "A dismissed batter cannot return to the crease in this innings.";
  if (!Number.isInteger(payload.batRuns) || payload.batRuns < 0 || payload.batRuns > 6 || !Number.isInteger(payload.extraRuns) || payload.extraRuns < 0 || payload.extraRuns > 10) return "Enter valid runs for this delivery.";
  if (payload.extraType === "wide" && payload.batRuns > 0) return "Runs off the bat cannot be recorded on a wide.";
  if (["bye", "leg-bye", "penalty"].includes(payload.extraType) && payload.batRuns > 0) return "Record batter runs or extras, not both, on one delivery.";
  if (payload.wicket && ![payload.batterId, payload.nonStrikerId].includes(payload.wicket.playerOutId)) return "The dismissed player must be one of the two active batters.";
  if (payload.wicket && ["bowled", "caught", "lbw", "stumped", "hit-wicket"].includes(payload.wicket.kind) && payload.extraType === "no-ball") return "This dismissal cannot be awarded from a no-ball.";
  if (payload.wicket && ["bowled", "caught", "lbw"].includes(payload.wicket.kind) && payload.extraType === "wide") return "This dismissal cannot be awarded from a wide.";
  if (payload.wicket?.fielderId && !bowlingIds.includes(payload.wicket.fielderId)) return "The fielder must belong to the bowling section's submitted roster.";
  const legal = payload.extraType !== "wide" && payload.extraType !== "no-ball";
  const deliveries = innings.deliveries.filter((item) => !item.reversedAt);
  const balls = deliveries.filter((item) => item.legal).length;
  if(balls>0&&balls%6===0){const lastLegal=deliveries.filter(item=>item.legal).at(-1);if(lastLegal?.bowlerId===payload.bowlerId)return "Choose a different bowler for the new over.";}
  const event = data.events.find((item) => item.id === fixture.eventId);
  const { balls: maxBalls, wickets: maxWickets } = cricketInningsLimits(event, innings);
  if (balls >= maxBalls) return "This innings has reached its over limit.";
  if (payload.wicket && payload.wicket.kind !== "retired-hurt" && innings.deliveries.filter((item) => item.wicket && item.wicket.kind !== "retired-hurt" && !item.reversedAt).length >= maxWickets) return "This innings has reached its wicket limit.";
  // Cricket notation is zero-based for the over: 0.1 is the first legal ball.
  const delivery: CricketDelivery = { ...payload, id: crypto.randomUUID(), over: Math.floor(balls / 6), ball: balls % 6 + (legal ? 1 : 0), legal, createdAt: new Date().toISOString(), actor };
  innings.strikerId = payload.batterId;
  innings.nonStrikerId = payload.nonStrikerId;
  innings.bowlerId = payload.bowlerId;
  innings.deliveries.push(delivery);
  const completedBalls = innings.deliveries.filter((item) => item.legal && !item.reversedAt).length;
  const crossingRuns = payload.batRuns + (payload.extraType === "wide" ? payload.extraRuns : payload.extraType === "bye" || payload.extraType === "leg-bye" || payload.extraType === "no-ball" ? payload.extraRuns : 0);
  const dismissedWasStriker = payload.wicket?.playerOutId === payload.batterId;
  const dismissedWasNonStriker = payload.wicket?.playerOutId === payload.nonStrikerId;
  if (payload.wicket) {
    if (dismissedWasStriker) innings.strikerId = "";
    if (dismissedWasNonStriker) innings.nonStrikerId = "";
  }
  if (crossingRuns % 2 === 1) [innings.strikerId, innings.nonStrikerId] = [innings.nonStrikerId, innings.strikerId];
  if (legal && completedBalls % 6 === 0) [innings.strikerId, innings.nonStrikerId] = [innings.nonStrikerId, innings.strikerId];
  innings.bowlerId = payload.bowlerId;
  syncCricketFixtureTotals(fixture);
  const currentRuns = innings.deliveries.filter((item) => !item.reversedAt).reduce((sum, item) => sum + item.batRuns + item.extraRuns + (item.extraType === "wide" || item.extraType === "no-ball" ? 1 : 0), 0);
  const wickets = innings.deliveries.filter((item) => item.wicket && item.wicket.kind !== "retired-hurt" && !item.reversedAt).length;
  const runsToBeat = cricketRunsToBeat(cricket.innings, innings);
  const targetReached = runsToBeat !== undefined && currentRuns > runsToBeat;
  if (targetReached || completedBalls >= maxBalls || wickets >= maxWickets) { innings.completed = true; innings.completionReason = targetReached ? "Target reached" : completedBalls >= maxBalls ? "Overs completed" : "All out"; }
  syncCricketFixtureTotals(fixture);
  fixture.periodLabel = cricketPeriodLabel(innings);
  fixture.clockLabel = `${Math.floor(completedBalls / 6)}.${completedBalls % 6} ov · ${currentRuns}/${wickets}`;
  fixture.updatedAt = new Date().toISOString();
  return null;
}

export function startCricketInnings(data: CompetitionData, fixture: Fixture, input: MatchScoreInput): string | null {
  if (!input.cricketInnings) return "Select the batting side, striker, non-striker, and opening bowler.";
  if (fixture.status !== "live") return "Start the match before starting an innings.";
  const card = fixture.scorecard ??= emptyCard(fixture);
  if (!card.cricket && card.events.length) return "This fixture has legacy cricket entries. Use a fresh fixture for the detailed scorer; existing entries were preserved.";
  const cricket = card.cricket ??= { innings: [] };
  if (cricket.innings.length && !cricket.innings.at(-1)?.completed) return "Complete the current innings first.";
  if (cricket.innings.length >= 4) return "The Super Over is complete. If it is level too, a central admin records the bowl-out winner.";
  if (cricket.innings.length === 2 && inningsRuns(cricket.innings[0]) !== inningsRuns(cricket.innings[1])) return "Both innings have already been recorded.";
  const { battingSide, strikerId, nonStrikerId, bowlerId } = input.cricketInnings;
  if (battingSide !== "a" && battingSide !== "b") return "Choose the batting side.";
  if (strikerId === nonStrikerId) return "Choose two different opening batters.";
  const previousInnings = cricket.innings.at(-1);
  // Innings 2 and 4 belong to the other side; the Super Over (innings 3) may open with either, usually the side that batted second.
  if (previousInnings && cricket.innings.length % 2 === 1 && battingSide === previousInnings.battingSide) return "The second innings must be played by the other section.";
  const battingRoster = data.entries.filter((entry) => entry.eventId === fixture.eventId && entry.sectionId === (battingSide === "a" ? fixture.sectionA : fixture.sectionB)).flatMap((entry) => entry.participantIds);
  const bowlingRoster = data.entries.filter((entry) => entry.eventId === fixture.eventId && entry.sectionId === (battingSide === "a" ? fixture.sectionB : fixture.sectionA)).flatMap((entry) => entry.participantIds);
  if (!battingRoster.includes(strikerId) || !battingRoster.includes(nonStrikerId) || !bowlingRoster.includes(bowlerId)) return "Opening players must belong to the submitted team rosters.";
  cricket.innings.push({ number: cricket.innings.length + 1, battingSide, strikerId, nonStrikerId, openingStrikerId:strikerId, openingNonStrikerId:nonStrikerId, bowlerId, deliveries: [] });
  fixture.periodLabel = cricketPeriodLabel(cricket.innings.at(-1)!);
  fixture.clockLabel = "0.0 ov";
  return null;
}

export function endCricketInnings(fixture: Fixture): string | null {
  const innings = fixture.scorecard?.cricket?.innings.at(-1);
  if (!innings || innings.completed) return "There is no active innings to end.";
  innings.completed = true;
  innings.completionReason = "Declared by scorer";
  syncCricketFixtureTotals(fixture);
  if (innings.number === 2) fixture.periodLabel = "Match complete";
  if (innings.number === 4) fixture.periodLabel = "Super Over complete";
  fixture.clockLabel = `${Math.floor(innings.deliveries.filter(item=>item.legal&&!item.reversedAt).length/6)}.${innings.deliveries.filter(item=>item.legal&&!item.reversedAt).length%6} ov · ${innings.deliveries.filter(item=>!item.reversedAt).reduce((sum,item)=>sum+deliveryTotal(item),0)} runs`;
  fixture.updatedAt = new Date().toISOString();
  return null;
}

export function reverseCricketDelivery(data: CompetitionData, fixture: Fixture, input: MatchScoreInput, actor: string): string | null {
  if (fixture.status !== "live") return "Reopen the finalized result before correcting a delivery.";
  if (!input.eventId || !input.correctionReason?.trim()) return "Choose a delivery and enter a correction reason.";
  const innings = fixture.scorecard?.cricket?.innings.find((item) => item.deliveries.some((delivery) => delivery.id === input.eventId));
  const delivery = innings?.deliveries.find((item) => item.id === input.eventId && !item.reversedAt);
  if (!delivery || !innings) return "That delivery is missing or already corrected.";
  delivery.reversedAt = new Date().toISOString();
  delivery.correctionReason = `${input.correctionReason.trim()} · corrected by ${actor}`;
  const definition=data.events.find(e=>e.id===fixture.eventId);
  const limits=cricketInningsLimits(definition,innings);
  const active=innings.deliveries.filter(d=>!d.reversedAt);
  const activeBalls=active.filter(d=>d.legal).length;
  const activeWickets=active.filter(d=>d.wicket&&d.wicket.kind!=="retired-hurt").length;
  const runsToBeat=cricketRunsToBeat(fixture.scorecard?.cricket?.innings??[],innings);
  const runsNow=active.reduce((sum,d)=>sum+deliveryTotal(d),0);
  const reachedTarget=runsToBeat!==undefined&&runsNow>runsToBeat;
  innings.completed=activeBalls>=limits.balls||activeWickets>=limits.wickets||reachedTarget||innings.completionReason==="Declared by scorer";
  innings.completionReason=innings.completed?(reachedTarget?"Target reached":activeBalls>=limits.balls?"Overs completed":activeWickets>=limits.wickets?"All out":"Declared by scorer"):undefined;
  // Restore the last active ball's resulting batter/bowler state when a correction is made.
  let striker=innings.openingStrikerId??innings.strikerId;
  let nonStriker=innings.openingNonStrikerId??innings.nonStrikerId;
  let bowler=innings.bowlerId;
  for(const item of active){
    striker=item.batterId;nonStriker=item.nonStrikerId;bowler=item.bowlerId;
    const runsCrossed=item.batRuns+(item.extraType==="wide"||item.extraType==="no-ball"||item.extraType==="bye"||item.extraType==="leg-bye"?item.extraRuns:0);
    if(item.wicket?.playerOutId===striker)striker="";
    else if(item.wicket?.playerOutId===nonStriker)nonStriker="";
    if(runsCrossed%2===1)[striker,nonStriker]=[nonStriker,striker];
    if(item.legal&&item.ball===6)[striker,nonStriker]=[nonStriker,striker];
  }
  innings.strikerId=striker;innings.nonStrikerId=nonStriker;innings.bowlerId=bowler;
  syncCricketFixtureTotals(fixture);
  fixture.periodLabel=cricketPeriodLabel(innings);
  fixture.clockLabel=`${Math.floor(activeBalls/6)}.${activeBalls%6} ov · ${runsNow}/${activeWickets}`;
  fixture.updatedAt = new Date().toISOString();
  return null;
}

/**
 * Rulebook tie: Super Over, then a bowl-out. A bowl-out isn't scored ball by ball, so a central admin records its
 * winner here, with a note for the audit log. Allowed only while the match and any Super Over are level.
 */
export function recordCricketBowlOut(data: CompetitionData, fixture: Fixture, input: MatchScoreInput, actor: string): string | null {
  if (sportIdForFixture(data, fixture) !== "cricket") return "Bowl-outs are for cricket matches.";
  if (fixture.status !== "live") return "The match must be live to record a bowl-out.";
  const winner = input.tieBreakWinner;
  if (winner !== "a" && winner !== "b") return "Choose the division that won the bowl-out.";
  const note = typeof input.reviewNote === "string" ? input.reviewNote.trim().slice(0, 300) : "";
  syncCricketFixtureTotals(fixture);
  const state = cricketTieState(fixture);
  if (state === "in-play") return "Complete both innings first.";
  if (state === "super-over") return "Finish the Super Over first.";
  if (state === "decided" && fixture.tieBreak?.method !== "bowl-out") return "This match is already decided.";
  fixture.tieBreak = { winner, method: "bowl-out", note: note || undefined, at: new Date().toISOString(), by: actor };
  fixture.periodLabel = "Bowl-out";
  fixture.updatedAt = new Date().toISOString();
  return null;
}

function deliveryTotal(delivery: CricketDelivery): number {
  return delivery.batRuns + delivery.extraRuns + (delivery.extraType === "wide" || delivery.extraType === "no-ball" ? 1 : 0);
}

/** Innings 1 and 2 are the match; innings 3 and 4 are the Super Over: one over a side, two wickets. */
export function cricketInningsLimits(event: Pick<EventDefinition, "scoringConfig"> | undefined, innings: Pick<CricketInnings, "number">): { balls: number; wickets: number } {
  if (innings.number > 2) return { balls: 6, wickets: 2 };
  return { balls: (event?.scoringConfig?.oversPerInnings ?? 8) * 6, wickets: event?.scoringConfig?.wicketsPerInnings ?? 10 };
}

export function inningsRuns(innings: Pick<CricketInnings, "deliveries">): number {
  return innings.deliveries.filter((item) => !item.reversedAt).reduce((sum, item) => sum + deliveryTotal(item), 0);
}

/** The score a chasing innings (2, or the Super Over's 4) must pass; undefined for an innings batting first. */
export function cricketRunsToBeat(all: CricketInnings[], innings: Pick<CricketInnings, "number">): number | undefined {
  if (innings.number % 2 === 1) return undefined;
  const previous = all.find((item) => item.number === innings.number - 1);
  return previous ? inningsRuns(previous) : undefined;
}

function cricketPeriodLabel(innings: Pick<CricketInnings, "number">): string {
  return innings.number > 2 ? `Super Over ${innings.number - 2}` : `Innings ${innings.number}`;
}

/**
 * Where a cricket match stands after the regulation innings: "level" opens the Super Over, "super-over-level" calls
 * for a bowl-out (recorded by a central admin), "decided" when the result can be submitted.
 */
export function cricketTieState(fixture: Pick<Fixture, "scorecard" | "tieBreak">): "in-play" | "decided" | "level" | "super-over" | "super-over-level" {
  const innings = fixture.scorecard?.cricket?.innings ?? [];
  const main = innings.filter((item) => item.number <= 2);
  if (main.length < 2 || !main.every((item) => item.completed)) return "in-play";
  if (inningsRuns(main[0]) !== inningsRuns(main[1])) return "decided";
  if (fixture.tieBreak) return "decided";
  const superOver = innings.filter((item) => item.number > 2);
  if (!superOver.length) return "level";
  if (superOver.length < 2 || !superOver.every((item) => item.completed)) return "super-over";
  return "super-over-level";
}

function syncCricketFixtureTotals(fixture: Fixture): void {
  const card=fixture.scorecard;
  const all=card?.cricket?.innings;
  if(!card||!all)return;
  // The Super Over decides a tie but isn't part of the score, net run rate, or the batting and bowling figures.
  const innings=all.filter(item=>item.number<=2);
  const superOver=all.filter(item=>item.number>2);
  if(superOver.length===2&&superOver.every(item=>item.completed)&&inningsRuns(superOver[0])!==inningsRuns(superOver[1])){
    const winner=inningsRuns(superOver[0])>inningsRuns(superOver[1])?superOver[0].battingSide:superOver[1].battingSide;
    if(fixture.tieBreak?.method!=="bowl-out")fixture.tieBreak={winner,method:"super-over",at:new Date().toISOString(),by:"scorer"};
  }else if(fixture.tieBreak?.method==="super-over")fixture.tieBreak=undefined;
  for(const side of ["a","b"] as const){
    const sideInnings=innings.filter(item=>item.battingSide===side);
    const deliveries=sideInnings.flatMap(item=>item.deliveries).filter(item=>!item.reversedAt);
    const runs=deliveries.reduce((sum,item)=>sum+deliveryTotal(item),0);
    const wickets=deliveries.filter(item=>item.wicket&&item.wicket.kind!=="retired-hurt").length;
    const legalBalls=deliveries.filter(item=>item.legal).length;
    if(side==="a"){fixture.scoreA=runs;card.wicketsA=wickets;card.legalBallsA=legalBalls;}
    else{fixture.scoreB=runs;card.wicketsB=wickets;card.legalBallsB=legalBalls;}
  }
  card.legalBalls=card.legalBallsA+card.legalBallsB;
}

export function allowedKinds(sportId: string): MatchEventKind[] {
  if (cricket.has(sportId)) return ["run", "extra", "wicket"];
  if (football.has(sportId)) return ["goal", "yellow-card", "red-card", "substitution"];
  if (basketball.has(sportId)) return ["basket", "free-throw", "foul", "substitution"];
  if (racket.has(sportId) || rally.has(sportId)) return ["rally-point", "set-point", "substitution"];
  if (goals.has(sportId)) return ["goal"];
  return ["score"];
}

export function finalizeFixtureResult(data: CompetitionData, fixture: Fixture, actor: string): string | null {
  const event = data.events.find((item) => item.id === fixture.eventId);
  if (!event?.pointsPolicy.published) return "Publish this event's points policy before submitting the result.";
  [fixture.awardedPointsA, fixture.awardedPointsB] = fixtureAwards(event.pointsPolicy, fixture.stage, fixtureOutcome(fixture));
  fixture.status = "completed";
  fixture.resultConfirmed = true;
  fixture.resultSubmittedAt ??= new Date().toISOString();
  fixture.resultSubmittedBy ??= actor;
  fixture.resultFinalizedAt = new Date().toISOString();
  fixture.resultFinalizedBy = actor;
  fixture.updatedAt = new Date().toISOString();
  return null;
}

export function migrateLegacyResults(data: CompetitionData): void {
  data.audit ??= [];
  for (const fixture of data.fixtures) {
    const event = data.events.find((item) => item.id === fixture.eventId);
    if (!event?.pointsPolicy.published) continue;
    const isPendingLegacy = fixture.status === "awaiting-confirmation";
    const isMissingLegacyAward = fixture.status === "completed" && fixture.resultConfirmed && (fixture.awardedPointsA == null || fixture.awardedPointsB == null);
    if (!isPendingLegacy && !isMissingLegacyAward) continue;
    const auditId = isPendingLegacy ? `legacy-finalized:${fixture.id}` : `legacy-awards-backfilled:${fixture.id}`;
    if (data.audit.some((entry) => entry.id === auditId)) continue;
    const error = finalizeFixtureResult(data, fixture, "system-migration");
    if (error) continue;
    data.audit.unshift({
      id: auditId,
      at: fixture.resultSubmittedAt ?? fixture.updatedAt,
      actor: fixture.resultSubmittedBy ?? "system-migration",
      action: isPendingLegacy ? "legacy-result-finalized" : "legacy-points-backfilled",
      detail: `${isPendingLegacy ? "Legacy submitted result finalized" : "Missing legacy points restored"} during migration · ${fixture.scoreA}–${fixture.scoreB} · points ${fixture.awardedPointsA ?? 0}–${fixture.awardedPointsB ?? 0}`,
      entityId: fixture.id,
    });
  }
}

export function recordMatchEvent(data: CompetitionData, fixture: Fixture, input: MatchScoreInput, actor: string): string | null {
  if (isAthleticsFixture(data, fixture) && input.action !== "submit") return "Athletics uses result/place entry, not live match scoring.";
  if (input.action === "walkover") {
    if (fixture.status === "completed") return "This result is already final. Reopen it before recording a walkover.";
    const winner = input.walkoverWinner;
    if (winner !== "a" && winner !== "b") return "Choose the side that turned up.";
    const event = data.events.find((item) => item.id === fixture.eventId);
    if (!event) return "Event not found.";
    [fixture.scoreA, fixture.scoreB] = walkoverScores(event, winner);
    fixture.walkoverWinner = winner;
    fixture.noResult = false;
    fixture.periodLabel = "Walkover";
    fixture.clockLabel = "—";
    fixture.resultSubmittedAt = new Date().toISOString();
    fixture.resultSubmittedBy = actor;
    return finalizeFixtureResult(data, fixture, actor);
  }
  if (input.action === "start") {
    if (fixture.status !== "scheduled") return "Only scheduled matches can be started.";
    fixture.status = "live";
    return null;
  }
  if (input.action === "submit") {
    if (fixture.status !== "live") return "Only live matches can be submitted.";
    if (cricket.has(sportIdForFixture(data, fixture))) {
      syncCricketFixtureTotals(fixture);
      const state = cricketTieState(fixture);
      if (state === "in-play") return "Complete both cricket innings before submitting the result.";
      if (state === "level") return "Scores are level. Play the Super Over before submitting the result.";
      if (state === "super-over") return "Finish the Super Over before submitting the result.";
      if (state === "super-over-level") return "The Super Over is level too. A central admin records the bowl-out winner first.";
    }
    if (isAthleticsFixture(data, fixture)) return "Enter the athletics result before submitting.";
    fixture.resultSubmittedAt = new Date().toISOString();
    fixture.resultSubmittedBy = actor;
    fixture.resultReviewNote = undefined;
    return finalizeFixtureResult(data, fixture, actor);
  }
  if (input.action === "reopen") {
    if (fixture.status !== "completed" || !fixture.resultConfirmed) return "Only finalized results can be reopened.";
    if (!input.reviewNote?.trim()) return "Add a reason for reopening this result.";
    fixture.status = "live";
    fixture.resultConfirmed = false;
    fixture.walkoverWinner = undefined;
    fixture.tieBreak = undefined;
    fixture.resultFinalizedAt = undefined;
    fixture.resultFinalizedBy = undefined;
    fixture.awardedPointsA = 0;
    fixture.awardedPointsB = 0;
    fixture.resultReviewedAt = new Date().toISOString();
    fixture.resultReviewedBy = actor;
    fixture.resultReviewNote = input.reviewNote.trim();
    const cricketInnings=fixture.scorecard?.cricket?.innings;
    if(cricketInnings?.length){const current=cricketInnings.at(-1);if(current){current.completed=false;current.completionReason=undefined;}}
    return null;
  }
  if (fixture.status !== "live") return "Scoring is available only while the match is live. Reopen a finalized result before correcting it.";

  const card = fixture.scorecard ??= emptyCard(fixture);
  card.playerStats ??= {};
  card.legalBallsA ??= card.legalBalls ?? 0;
  card.legalBallsB ??= 0;
  card.setsA ??= 0; card.setsB ??= 0; card.currentGameA ??= 0; card.currentGameB ??= 0; card.pointsA ??= 0; card.pointsB ??= 0;
  const teamEntries = data.entries.filter((entry) => entry.eventId === fixture.eventId && (entry.sectionId === fixture.sectionA || entry.sectionId === fixture.sectionB));
  const eligiblePlayers = new Set(teamEntries.flatMap((entry) => entry.participantIds));
  if (input.action === "reverse-event") {
    const original = card.events.find((event) => event.id === input.eventId && !event.reversedAt);
    if (!original) return "The match event was not found or was already reversed.";
    if (!input.correctionReason?.trim()) return "Add a short reason for the correction.";
    original.reversedAt = new Date().toISOString();
    card.events.push({ ...original, id: crypto.randomUUID(), kind: "score", points: 0, label: "Correction", detail: input.correctionReason.trim(), reversesEventId: original.id, actor, createdAt: new Date().toISOString() });
    recomputeScore(data, fixture);
    fixture.updatedAt = new Date().toISOString();
    return null;
  }

  let event: Omit<MatchEvent, "id" | "actor" | "createdAt" | "period"> & { period?: string };
  if (input.action === "record-event") {
    const definition = data.events.find((item) => item.id === fixture.eventId);
    const enabled = definition?.scoringConfig?.enabledActions ?? allowedKinds(sportIdForFixture(data, fixture));
    if (!input.event || !enabled.includes(input.event.kind)) return "This scoring action is not available for the fixture's sport.";
    const raw = input.event;
    if (raw.side !== "a" && raw.side !== "b") return "Choose which side scored.";
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);
    // Keep only the fields a scorer may set; reversal and audit fields are the server's to write.
    event = { kind: raw.kind, side: raw.side, points: raw.points, playerId: text(raw.playerId, 80), secondaryPlayerId: text(raw.secondaryPlayerId, 80), label: text(raw.label, 80), detail: text(raw.detail, 200), period: text(raw.period, 40) };
  } else if (["increment-a", "increment-b", "decrement-a", "decrement-b"].includes(input.action)) {
    const side = input.action.endsWith("a") ? "a" : "b";
    event = { kind: "score", side, points: 1, label: "Score +1" };
    if (input.action.startsWith("decrement")) {
      const previous = [...card.events].reverse().find((item) => item.side === side && !item.reversedAt && item.points > 0);
      if (!previous) return "There is no score event to remove.";
      previous.reversedAt = new Date().toISOString();
      card.events.push({ ...previous, id: crypto.randomUUID(), kind: "score", points: 0, label: "Score correction", reversesEventId: previous.id, actor, createdAt: new Date().toISOString() });
      recomputeScore(data, fixture);
      fixture.updatedAt = new Date().toISOString();
      return null;
    }
  } else {
    return "Unknown scoring action.";
  }
  if (!Number.isInteger(event.points) || event.points < 0 || event.points > 100) return "Enter a valid event score.";
  if (event.playerId && !eligiblePlayers.has(event.playerId)) return "Choose a player from the participating teams.";
  const sportId = sportIdForFixture(data, fixture);
  if (event.secondaryPlayerId && !eligiblePlayers.has(event.secondaryPlayerId)) return "Choose a second player from the participating teams.";
  if (event.secondaryPlayerId && cricket.has(sportId)) {
    const bowlingSection = event.side === "a" ? fixture.sectionB : fixture.sectionA;
    const isBowlerOnOtherSide = teamEntries.some((entry) => entry.sectionId === bowlingSection && entry.participantIds.includes(event.secondaryPlayerId!));
    if (!isBowlerOnOtherSide) return "Select the bowler from the opposing section's submitted roster.";
  }
  const definition = data.events.find((item) => item.id === fixture.eventId);
  const isCricket = cricket.has(sportId);
  const legal = isCricket && !(event.kind === "extra" && /wide|no.?ball/i.test(event.detail ?? ""));
  const sideBalls = event.side === "a" ? card.legalBallsA : card.legalBallsB;
  const maxBalls = (definition?.scoringConfig?.oversPerInnings ?? 0) * 6;
  if (isCricket && maxBalls && sideBalls >= maxBalls) return "This innings has reached its configured over limit.";
  const maxWickets = definition?.scoringConfig?.wicketsPerInnings ?? 10;
  if (isCricket && event.kind === "wicket" && (event.side === "a" ? card.wicketsA : card.wicketsB) >= maxWickets) return `This innings cannot exceed ${maxWickets} wickets.`;
  const overBall = isCricket ? `${Math.floor(sideBalls / 6)}.${sideBalls % 6 + (legal ? 1 : 0)}` : undefined;
  const stored: MatchEvent = { ...event, playerName: event.playerId ? data.participants.find((player) => player.id === event.playerId)?.name : undefined, secondaryPlayerName: event.secondaryPlayerId ? data.participants.find((player) => player.id === event.secondaryPlayerId)?.name : undefined, id: crypto.randomUUID(), period: event.period || (isCricket ? `Innings ${event.side === "a" ? 1 : 2}` : event.kind === "set-point" ? `Set ${card.setsA + card.setsB + 1}` : fixture.periodLabel || "Match"), overBall, legalDelivery: isCricket && legal, actor, createdAt: new Date().toISOString() };
  card.events.push(stored);
  if (isCricket && legal) { if (event.side === "a") card.legalBallsA += 1; else card.legalBallsB += 1; }
  if (event.kind === "set-point") {
    if (event.side === "a") card.pointsA += event.points; else card.pointsB += event.points;
    const threshold = definition?.scoringConfig?.pointsToWin ?? 25;
    const aWins = card.pointsA >= threshold && card.pointsA - card.pointsB >= (definition?.scoringConfig?.winBy ?? 2);
    const bWins = card.pointsB >= threshold && card.pointsB - card.pointsA >= (definition?.scoringConfig?.winBy ?? 2);
    if (aWins) { stored.label = "Set won"; card.setsA += 1; card.pointsA = 0; card.pointsB = 0; }
    if (bWins) { stored.label = "Set won"; card.setsB += 1; card.pointsA = 0; card.pointsB = 0; }
  }
  recomputeScore(data, fixture);
  fixture.status = "live";
  fixture.updatedAt = new Date().toISOString();
  return null;
}

function emptyCard(fixture: Fixture): MatchScorecard {
  return { innings: 1, legalBalls: 0, legalBallsA: 0, legalBallsB: 0, wicketsA: 0, wicketsB: 0, baselineScoreA: fixture.scoreA, baselineScoreB: fixture.scoreB, setsA: 0, setsB: 0, currentGameA: 0, currentGameB: 0, pointsA: 0, pointsB: 0, playerStats: {}, events: [] };
}

export function recomputeScore(data: CompetitionData, fixture: Fixture): void {
  const card = fixture.scorecard;
  if (!card) return;
  const active = card.events.filter((event) => !event.reversedAt && !event.reversesEventId);
  fixture.scoreA = card.baselineScoreA + active.filter((event) => event.side === "a").reduce((sum, event) => sum + event.points, 0);
  fixture.scoreB = card.baselineScoreB + active.filter((event) => event.side === "b").reduce((sum, event) => sum + event.points, 0);
  card.wicketsA = active.filter((event) => event.side === "a" && event.kind === "wicket").length;
  card.wicketsB = active.filter((event) => event.side === "b" && event.kind === "wicket").length;
  const deliveries = card.events.filter((event) => event.legalDelivery === true && !event.reversesEventId);
  card.legalBalls = deliveries.length;
  card.legalBallsA = deliveries.filter((event) => event.side === "a").length;
  card.legalBallsB = deliveries.filter((event) => event.side === "b").length;
  card.playerStats = {};
  for (const event of active) {
    if (event.playerId) {
      const batting = card.playerStats[event.playerId] ??= {};
      batting[event.kind] = (batting[event.kind] ?? 0) + 1;
      if (["run", "goal", "basket", "free-throw", "rally-point", "set-point", "frame-point", "score"].includes(event.kind)) batting.points = (batting.points ?? 0) + event.points;
      if (event.kind === "run") batting.runs = (batting.runs ?? 0) + event.points;
      if (event.kind === "wicket") batting.dismissals = (batting.dismissals ?? 0) + 1;
      if (event.kind === "run" && event.points === 4) batting.fours = (batting.fours ?? 0) + 1;
      if (event.kind === "run" && event.points === 6) batting.sixes = (batting.sixes ?? 0) + 1;
    }
    if (event.secondaryPlayerId && cricket.has(sportIdForFixture(data, fixture))) {
      const bowling = card.playerStats[event.secondaryPlayerId] ??= {};
      const isBattingExtra = event.kind === "extra" && /bye|leg.?bye/i.test(event.detail ?? "");
      if (event.kind === "run" || (event.kind === "extra" && !isBattingExtra)) bowling.runsConceded = (bowling.runsConceded ?? 0) + event.points;
      if (event.kind === "wicket" && !/run.?out|retired hurt|obstruct/i.test(event.detail ?? "")) bowling.wickets = (bowling.wickets ?? 0) + 1;
      if (event.kind === "run" || event.kind === "wicket" || (event.kind === "extra" && !/wide|no.?ball/i.test(event.detail ?? ""))) bowling.legalBalls = (bowling.legalBalls ?? 0) + 1;
    }
  }
  const definition = data.events.find((item) => item.id === fixture.eventId);
  const winsNeeded = definition?.scoringConfig?.setsToWin ?? 1;
  const setNames = new Set(active.filter((event) => event.kind === "set-point").map((event) => event.period));
  card.setsA = 0; card.setsB = 0;
  for (const setName of setNames) {
    const points = active.filter((event) => event.kind === "set-point" && event.period === setName);
    const a = points.filter((event) => event.side === "a").reduce((sum, event) => sum + event.points, 0);
    const b = points.filter((event) => event.side === "b").reduce((sum, event) => sum + event.points, 0);
    if (a >= (definition?.scoringConfig?.pointsToWin ?? 25) && a - b >= (definition?.scoringConfig?.winBy ?? 2)) card.setsA += 1;
    if (b >= (definition?.scoringConfig?.pointsToWin ?? 25) && b - a >= (definition?.scoringConfig?.winBy ?? 2)) card.setsB += 1;
  }
  const setPoints = [...active].reverse().find((event) => event.kind === "set-point");
  if (setPoints && card.setsA < winsNeeded && card.setsB < winsNeeded) {
    const current = active.filter((event) => event.kind === "set-point" && event.period === setPoints.period);
    card.pointsA = current.filter((event) => event.side === "a").reduce((sum, event) => sum + event.points, 0);
    card.pointsB = current.filter((event) => event.side === "b").reduce((sum, event) => sum + event.points, 0);
  }
  if (card.setsA >= winsNeeded || card.setsB >= winsNeeded) fixture.periodLabel = "Match point";
}
