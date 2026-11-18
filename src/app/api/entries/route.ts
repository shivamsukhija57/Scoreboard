import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canManageSection, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { Participant, ParticipantGender, SectionId } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

interface EntryInput {
  eventId: string;
  sectionId: SectionId;
  entryNumber?: number;
  participants: Array<{ name: string; studentId: string; gender?: ParticipantGender | "" }>;
  submit: boolean;
}

function validGender(gender: unknown): gender is ParticipantGender {
  return gender === "male" || gender === "female" || gender === "other";
}

export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to manage an entry." }, { status: 401 });
  const body = (await request.json()) as EntryInput;
  const central = isCentralAdmin(access);
  if (!central && !canManageSection(access, body.sectionId)) {
    return NextResponse.json({ error: "You do not administer this section." }, { status: 403 });
  }

  const entryNumber = Math.max(1, Math.floor(Number(body.entryNumber) || 1));
  const result = await updateCompetition(access.email, body.submit ? "entry-submit" : "entry-save", `${body.sectionId} / ${body.eventId} / team ${entryNumber}`, body.eventId, (data) => {
    const event = data.events.find((item) => item.id === body.eventId);
    if (!event) return { error: "Choose a valid event.", status: 404 };
    if (entryNumber > event.entriesPerDivision) return { error: `This event allows ${event.entriesPerDivision} entry per division.`, status: 400 };

    let entry = data.entries.find((item) => item.eventId === body.eventId && item.sectionId === body.sectionId && (item.entryNumber ?? 1) === entryNumber);
    if (entry?.status === "submitted" && !central) return { error: "This entry is locked after submission.", status: 409 };
    const occupiedSlots = data.entries.filter((item) => item.eventId === body.eventId && item.sectionId === body.sectionId && item.id !== entry?.id);
    if (!entry && occupiedSlots.length >= event.entriesPerDivision) return { error: "All entry slots for this event are already in use.", status: 409 };

    const normalized = body.participants
      .map((person) => ({ name: person.name.trim(), studentId: person.studentId.trim(), gender: validGender(person.gender) ? person.gender : undefined }))
      .filter((person) => person.name && person.studentId);

    if (body.submit) {
      if (event.minPlayers === null) return { error: "The event's minimum roster size must be configured before submission.", status: 409 };
      if (normalized.length < event.minPlayers || (event.maxPlayers !== null && normalized.length > event.maxPlayers)) {
        return { error: event.maxPlayers === null ? `This event requires at least ${event.minPlayers} players.` : `This event accepts ${event.minPlayers}–${event.maxPlayers} players.`, status: 400 };
      }
      const ids = normalized.map((person) => person.studentId.toLowerCase());
      if (new Set(ids).size !== ids.length) return { error: "A player can only appear once in an entry.", status: 400 };
      if (event.genderEligibility !== "open" && normalized.some((person) => !person.gender)) return { error: "Select each player's gender so the event eligibility rules can be checked.", status: 400 };
      if (event.genderEligibility === "men" && normalized.some((person) => person.gender !== "male")) return { error: "This event is for men's entries only.", status: 400 };
      if (event.genderEligibility === "women" && normalized.some((person) => person.gender !== "female")) return { error: "This event is for women's entries only.", status: 400 };
      if (event.genderEligibility === "mixed" && (!normalized.some((person) => person.gender === "male") || !normalized.some((person) => person.gender === "female"))) {
        return { error: "This mixed event requires at least one man and one woman.", status: 400 };
      }

      const section = data.sections.find((item) => item.id === body.sectionId);
      const sport = data.sports.find((item) => item.id === event.sportId);
      const otherSubmittedEntries = data.entries.filter((item) => item.status === "submitted" && item.id !== entry?.id);
      for (const person of normalized) {
        const personId = person.studentId.toLowerCase();
        const otherEvents = otherSubmittedEntries.filter((other) => other.participantIds.some((id) => data.participants.find((candidate) => candidate.id === id)?.studentId.toLowerCase() === personId));

        if (sport?.category === "sport" && sport.countsTowardOverallSportsCap) {
          const sportsAlready = new Set(otherEvents.flatMap((other) => {
            const otherSport = data.events.find((candidate) => candidate.id === other.eventId);
            const category = data.sports.find((candidate) => candidate.id === otherSport?.sportId);
            return category?.category === "sport" && category.countsTowardOverallSportsCap ? [category.id] : [];
          }));
          const cap = section?.maxSportsPerPlayer ?? (body.sectionId === "s4" || body.sectionId === "s5" ? 4 : 3);
          if (!sportsAlready.has(sport.id) && sportsAlready.size >= cap) {
            return { error: `${person.name} has reached Section ${section?.code ?? ""}'s ${cap}-sport limit.`, status: 409 };
          }
        }

        if (sport?.category === "sport" && sport.maxFormatsPerPlayer !== null) {
          const formatsAlready = new Set(otherEvents.flatMap((other) => data.events.find((candidate) => candidate.id === other.eventId)?.sportId === sport.id ? [other.eventId] : []));
          if (!formatsAlready.has(event.id) && formatsAlready.size >= sport.maxFormatsPerPlayer) {
            return { error: `${person.name} can enter at most ${sport.maxFormatsPerPlayer} formats in ${sport.name}.`, status: 409 };
          }
        }

        if (sport?.id === "fifa") {
          const fifaEntries = otherSubmittedEntries.filter((other) => data.events.find((candidate) => candidate.id === other.eventId)?.sportId === "fifa");
          const fifaRoster = new Set(fifaEntries.flatMap((other) => other.participantIds.map((id) => data.participants.find((candidate) => candidate.id === id)?.studentId.toLowerCase()).filter((id): id is string => Boolean(id))));
          normalized.forEach((candidate) => fifaRoster.add(candidate.studentId.toLowerCase()));
          if (fifaRoster.size > 4) return { error: "FIFA uses one shared division roster of three players plus one substitute across Singles and Doubles.", status: 409 };
        }

        const existingParticipant = data.participants.find((candidate) => candidate.studentId.toLowerCase() === personId);
        if (existingParticipant && existingParticipant.sectionId !== body.sectionId) return { error: `${person.studentId} is already registered in another section.`, status: 409 };
        if (existingParticipant && existingParticipant.gender && existingParticipant.gender !== person.gender) return { error: `${person.studentId}'s saved gender does not match this entry.`, status: 409 };
      }

      // Table Tennis requires at least four distinct participants of each gender across its three formats,
      // with no more than two players of either gender appearing in two formats.
      if (sport?.id === "table-tennis") {
        const ttEventIds = data.events.filter((candidate) => candidate.sportId === "table-tennis").map((candidate) => candidate.id);
        const submittedTt = otherSubmittedEntries.filter((item) => ttEventIds.includes(item.eventId));
        const wouldCompleteTt = new Set([...submittedTt.map((item) => item.eventId), event.id]).size === ttEventIds.length;
        if (wouldCompleteTt) {
          const ttEntries = [...submittedTt.filter((item) => item.eventId !== event.id), { eventId: event.id, participantIds: [] as string[] }];
          const participation = new Map<string, { gender?: ParticipantGender; formats: Set<string> }>();
          for (const item of ttEntries) {
            const idsForEntry = item.eventId === event.id ? normalized.map((person) => person.studentId.toLowerCase()) : item.participantIds.map((id) => data.participants.find((person) => person.id === id)?.studentId.toLowerCase()).filter((id): id is string => Boolean(id));
            for (const id of idsForEntry) {
              const person = normalized.find((candidate) => candidate.studentId.toLowerCase() === id) ?? data.participants.find((candidate) => candidate.studentId.toLowerCase() === id);
              const itemState = participation.get(id) ?? { gender: person?.gender, formats: new Set<string>() };
              itemState.formats.add(item.eventId);
              participation.set(id, itemState);
            }
          }
          for (const gender of ["male", "female"] as const) {
            const players = [...participation.values()].filter((item) => item.gender === gender);
            if (players.length < 4) return { error: `Table Tennis requires at least four different ${gender === "male" ? "men" : "women"} across that gender's singles/doubles and mixed formats.`, status: 409 };
            if (players.filter((item) => item.formats.size === 2).length > 2) return { error: `No more than two ${gender === "male" ? "men" : "women"} may play in two Table Tennis formats.`, status: 409 };
          }
        }
      }

      // Badminton has one division squad shared by five formats. The rulebook permits
      // up to four active players plus two substitutes of each gender across the squad.
      if (sport?.id === "badminton") {
        const badmintonEventIds = data.events.filter((candidate) => candidate.sportId === "badminton").map((candidate) => candidate.id);
        const submittedBadminton = otherSubmittedEntries.filter((item) => badmintonEventIds.includes(item.eventId));
        const wouldCompleteBadminton = new Set([...submittedBadminton.map((item) => item.eventId), event.id]).size === badmintonEventIds.length;
        const roster = new Map<string, ParticipantGender | undefined>();
        for (const item of submittedBadminton) {
          for (const participantId of item.participantIds) {
            const person = data.participants.find((candidate) => candidate.id === participantId);
            if (person) roster.set(person.studentId.toLowerCase(), person.gender);
          }
        }
        for (const person of normalized) roster.set(person.studentId.toLowerCase(), person.gender);
        for (const gender of ["male", "female"] as const) {
          const count = [...roster.values()].filter((value) => value === gender).length;
          if (count > 6) return { error: `The Badminton division squad allows up to four ${gender === "male" ? "men" : "women"} plus two substitutes (six total).`, status: 409 };
          if (wouldCompleteBadminton && count < 2) return { error: `The Badminton division squad requires at least two ${gender === "male" ? "men" : "women"} across all five formats.`, status: 409 };
        }
      }

      if (sport?.id === "pickleball") {
        const pickleballEventIds = data.events.filter((candidate) => candidate.sportId === "pickleball").map((candidate) => candidate.id);
        const submittedEntries = otherSubmittedEntries.filter((item) => pickleballEventIds.includes(item.eventId));
        const wouldComplete = new Set([...submittedEntries.map((item) => item.eventId), event.id]).size === pickleballEventIds.length;
        const roster = new Map<string, ParticipantGender | undefined>();
        for (const item of submittedEntries) for (const participantId of item.participantIds) {
          const person = data.participants.find((candidate) => candidate.id === participantId);
          if (person) roster.set(person.studentId.toLowerCase(), person.gender);
        }
        for (const person of normalized) roster.set(person.studentId.toLowerCase(), person.gender);
        for (const gender of ["male", "female"] as const) {
          const count = [...roster.values()].filter((value) => value === gender).length;
          if (count > 4) return { error: `Pickleball's shared division squad allows three ${gender === "male" ? "men" : "women"} plus one reserve.`, status: 409 };
          if (wouldComplete && count < 3) return { error: `Pickleball requires three different ${gender === "male" ? "men" : "women"} across its three doubles formats.`, status: 409 };
        }
      }

      if (event.entriesPerDivision > 1 && ["pool", "carrom", "foosball", "chess"].includes(sport?.id ?? "")) {
        const otherTeams = data.entries.filter((item) => item.eventId === event.id && item.sectionId === body.sectionId && item.id !== entry?.id);
        const alreadyAssignedIds = new Set(otherTeams.flatMap((item) => item.participantIds.map((id) => data.participants.find((person) => person.id === id)?.studentId.toLowerCase()).filter((id): id is string => Boolean(id))));
        const overlap = normalized.find((person) => alreadyAssignedIds.has(person.studentId.toLowerCase()));
        if (overlap) return { error: `${overlap.name} is already listed in another team for this event.`, status: 409 };
      }
    }

    const participantIds: string[] = [];
    for (const person of normalized) {
      let saved = data.participants.find((candidate) => candidate.studentId.toLowerCase() === person.studentId.toLowerCase());
      if (!saved) {
        saved = { id: randomUUID(), name: person.name, studentId: person.studentId, sectionId: body.sectionId, ...(person.gender ? { gender: person.gender } : {}) } satisfies Participant;
        data.participants.push(saved);
      } else {
        saved.name = person.name;
        if (person.gender) saved.gender = person.gender;
      }
      participantIds.push(saved.id);
    }

    if (!entry) {
      entry = { id: randomUUID(), eventId: body.eventId, sectionId: body.sectionId, entryNumber, participantIds, status: "draft", updatedAt: new Date().toISOString() };
      data.entries.push(entry);
    } else {
      entry.participantIds = participantIds;
      entry.updatedAt = new Date().toISOString();
    }
    if (body.submit) entry.status = "submitted";
    if (central && entry.status === "submitted") entry.updatedAt = new Date().toISOString();
    return { entry };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
