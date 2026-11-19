import { randomUUID } from "node:crypto";
import type { CompetitionData, CricketDelivery, Fixture, MatchEvent, MatchEventKind, MatchScoreInput, MatchScorecard } from "./domain";

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
  const maxBalls = (event?.scoringConfig?.oversPerInnings ?? 8) * 6;
  if (balls >= maxBalls) return "This innings has reached its over limit.";
  if (payload.wicket && payload.wicket.kind !== "retired-hurt" && innings.deliveries.filter((item) => item.wicket && item.wicket.kind !== "retired-hurt" && !item.reversedAt).length >= (event?.scoringConfig?.wicketsPerInnings ?? 10)) return "This innings has reached its wicket limit.";
  // Cricket notation is zero-based for the over: 0.1 is the first legal ball.
  const delivery: CricketDelivery = { ...payload, id: randomUUID(), over: Math.floor(balls / 6), ball: balls % 6 + (legal ? 1 : 0), legal, createdAt: new Date().toISOString(), actor };
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
  const firstInningsRuns = cricket.innings.find((item) => item.number === 1)?.deliveries.filter((item) => !item.reversedAt).reduce((sum, item) => sum + item.batRuns + item.extraRuns + (item.extraType === "wide" || item.extraType === "no-ball" ? 1 : 0), 0);
  const targetReached = innings.number === 2 && firstInningsRuns !== undefined && currentRuns > firstInningsRuns;
  if (targetReached || completedBalls >= maxBalls || wickets >= (event?.scoringConfig?.wicketsPerInnings ?? 10)) { innings.completed = true; innings.completionReason = targetReached ? "Target reached" : completedBalls >= maxBalls ? "Overs completed" : "All out"; }
  fixture.periodLabel = `Innings ${innings.number}`;
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
  if (cricket.innings.length >= 2) return "Both innings have already been recorded.";
  const { battingSide, strikerId, nonStrikerId, bowlerId } = input.cricketInnings;
  if (strikerId === nonStrikerId) return "Choose two different opening batters.";
  const previousInnings = cricket.innings.at(-1);
  if (previousInnings && battingSide === previousInnings.battingSide) return "The second innings must be played by the other section.";
  const battingRoster = data.entries.filter((entry) => entry.eventId === fixture.eventId && entry.sectionId === (battingSide === "a" ? fixture.sectionA : fixture.sectionB)).flatMap((entry) => entry.participantIds);
  const bowlingRoster = data.entries.filter((entry) => entry.eventId === fixture.eventId && entry.sectionId === (battingSide === "a" ? fixture.sectionB : fixture.sectionA)).flatMap((entry) => entry.participantIds);
  if (!battingRoster.includes(strikerId) || !battingRoster.includes(nonStrikerId) || !bowlingRoster.includes(bowlerId)) return "Opening players must belong to the submitted team rosters.";
  cricket.innings.push({ number: cricket.innings.length + 1, battingSide, strikerId, nonStrikerId, openingStrikerId:strikerId, openingNonStrikerId:nonStrikerId, bowlerId, deliveries: [] });
  fixture.periodLabel = `Innings ${cricket.innings.length}`;
  fixture.clockLabel = "0.0 ov";
  return null;
}

export function endCricketInnings(fixture: Fixture): string | null {
  const innings = fixture.scorecard?.cricket?.innings.at(-1);
  if (!innings || innings.completed) return "There is no active innings to end.";
  innings.completed = true;
  innings.completionReason = "Declared by scorer";
  if (innings.number === 2) fixture.periodLabel = "Match complete";
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
  const definitionMaxOvers = definition?.scoringConfig?.oversPerInnings ?? 8;
  const active=innings.deliveries.filter(d=>!d.reversedAt);
  const activeBalls=active.filter(d=>d.legal).length;
  const activeWickets=active.filter(d=>d.wicket&&d.wicket.kind!=="retired-hurt").length;
  const firstRuns=fixture.scorecard?.cricket?.innings.find(item=>item.number===1)?.deliveries.filter(d=>!d.reversedAt).reduce((sum,d)=>sum+deliveryTotal(d),0) ?? 0;
  const inningsRuns=active.reduce((sum,d)=>sum+deliveryTotal(d),0);
  const reachedTarget=innings.number===2&&inningsRuns>firstRuns;
  innings.completed=activeBalls>=definitionMaxOvers*6||activeWickets>=(definition?.scoringConfig?.wicketsPerInnings??10)||reachedTarget||innings.completionReason==="Declared by scorer";
  innings.completionReason=innings.completed?(reachedTarget?"Target reached":activeBalls>=definitionMaxOvers*6?"Overs completed":activeWickets>=(definition?.scoringConfig?.wicketsPerInnings??10)?"All out":"Declared by scorer"):undefined;
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
  fixture.periodLabel=`Innings ${innings.number}`;
  fixture.clockLabel=`${Math.floor(activeBalls/6)}.${activeBalls%6} ov · ${inningsRuns}/${activeWickets}`;
  fixture.updatedAt = new Date().toISOString();
  return null;
}

function deliveryTotal(delivery: CricketDelivery): number {
  return delivery.batRuns + delivery.extraRuns + (delivery.extraType === "wide" || delivery.extraType === "no-ball" ? 1 : 0);
}

function syncCricketFixtureTotals(fixture: Fixture): void {
  const card=fixture.scorecard;
  const innings=card?.cricket?.innings;
  if(!card||!innings)return;
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
  const outcome = fixture.noResult ? "draw" : fixture.scoreA === fixture.scoreB ? "draw" : fixture.scoreA > fixture.scoreB ? "a_win" : "b_win";
  const configured = event.pointsPolicy.pointsByOutcome ?? {};
  const fallback = fixture.stage === "final" ? configured.finalWin ?? configured.win ?? event.pointsPolicy.places[0] ?? 0 : configured.leagueWin ?? configured.leagueTopper ?? configured.win ?? event.pointsPolicy.places[0] ?? 0;
  const lossPoints = fixture.stage === "semifinal" ? configured.semifinalLoss ?? configured.loss ?? 0 : configured.leagueLoss ?? configured.loss ?? 0;
  const winPoints = configured[outcome] ?? configured[outcome.replace("_", "")] ?? (outcome === "draw" ? configured.draw ?? 0 : fallback);
  const drawPoints = configured.draw ?? 0;
  fixture.awardedPointsA = outcome === "a_win" ? winPoints : outcome === "b_win" ? lossPoints : drawPoints;
  fixture.awardedPointsB = outcome === "b_win" ? winPoints : outcome === "a_win" ? lossPoints : drawPoints;
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
  if (input.action === "start") {
    if (fixture.status !== "scheduled") return "Only scheduled matches can be started.";
    fixture.status = "live";
    return null;
  }
  if (input.action === "submit") {
    if (fixture.status !== "live") return "Only live matches can be submitted.";
    if (cricket.has(sportIdForFixture(data, fixture)) && (fixture.scorecard?.cricket?.innings.length !== 2 || !fixture.scorecard.cricket.innings.every((innings) => innings.completed))) return "Complete both cricket innings before submitting the result.";
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
    card.events.push({ ...original, id: randomUUID(), kind: "score", points: 0, label: "Correction", detail: input.correctionReason.trim(), reversesEventId: original.id, actor, createdAt: new Date().toISOString() });
    recomputeScore(data, fixture);
    fixture.updatedAt = new Date().toISOString();
    return null;
  }

  let event: Omit<MatchEvent, "id" | "actor" | "createdAt" | "period"> & { period?: string };
  if (input.action === "record-event") {
    const definition = data.events.find((item) => item.id === fixture.eventId);
    const enabled = definition?.scoringConfig?.enabledActions ?? allowedKinds(sportIdForFixture(data, fixture));
    if (!input.event || !enabled.includes(input.event.kind)) return "This scoring action is not available for the fixture's sport.";
    event = input.event;
  } else {
    const side = input.action.endsWith("a") ? "a" : "b";
    event = { kind: "score", side, points: 1, label: "Score +1" };
    if (input.action.startsWith("decrement")) {
      const previous = [...card.events].reverse().find((item) => item.side === side && !item.reversedAt && item.points > 0);
      if (!previous) return "There is no score event to remove.";
      previous.reversedAt = new Date().toISOString();
      card.events.push({ ...previous, id: randomUUID(), kind: "score", points: 0, label: "Score correction", reversesEventId: previous.id, actor, createdAt: new Date().toISOString() });
      recomputeScore(data, fixture);
      fixture.updatedAt = new Date().toISOString();
      return null;
    }
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
  const stored: MatchEvent = { ...event, playerName: event.playerId ? data.participants.find((player) => player.id === event.playerId)?.name : undefined, secondaryPlayerName: event.secondaryPlayerId ? data.participants.find((player) => player.id === event.secondaryPlayerId)?.name : undefined, id: randomUUID(), period: event.period || (isCricket ? `Innings ${event.side === "a" ? 1 : 2}` : event.kind === "set-point" ? `Set ${card.setsA + card.setsB + 1}` : fixture.periodLabel || "Match"), overBall, legalDelivery: isCricket && legal, actor, createdAt: new Date().toISOString() };
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
