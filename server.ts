import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '20mb' }));

// Initialize server-side Gemini client with gemini-3.8-flash
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'questflow-room-to-room',
        },
      },
    })
  : null;

// ============================================================================
// WEBCAL / ICAL URL PROXY (Fetch real remote .ics / WebCal feeds)
// ============================================================================

app.post('/api/calendar/fetch-webcal', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Calendar URL is required' });
    }

    // Convert webcal:// to https://
    let targetUrl = url.trim();
    if (targetUrl.startsWith('webcal://')) {
      targetUrl = 'https://' + targetUrl.slice(9);
    }

    // Fetch the raw iCalendar .ics stream
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'QuestFlow/1.0 (University of Waterloo Calendar Assistant)',
        Accept: 'text/calendar, text/plain, */*',
      },
    });

    if (!response.ok) {
      return res.status(400).json({
        error: `Remote calendar server returned status ${response.status}. Please check that the URL is public or shared.`,
      });
    }

    const icsContent = await response.text();
    if (!icsContent.includes('BEGIN:VCALENDAR')) {
      return res.status(400).json({
        error: 'The provided URL did not return a valid iCalendar (.ics) feed.',
      });
    }

    return res.json({ ics: icsContent });
  } catch (err: any) {
    console.error('Error fetching webcal feed:', err);
    return res.status(500).json({
      error: err.message || 'Failed to fetch calendar from remote URL',
    });
  }
});


app.post('/api/gemini/extract-screenshot', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/png', targetDate } = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Image base64 data is required' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    if (!ai) {
      // Fallback sample if AI is not configured
      return res.json({
        events: [
          { title: 'Team sync', start: '10:00', end: '10:30', location: 'MC 2018' },
          { title: 'Budget review', start: '10:30', end: '11:00', location: 'NH 3001' },
          { title: 'IT check-in', start: '13:00', end: '13:30', location: 'DC 1302' },
          { title: 'Vendor call', start: '14:00', end: '14:30', location: 'Microsoft Teams' },
        ],
      });
    }

    const promptText = `Analyze this calendar screenshot (e.g. Outlook day view or schedule).
Extract all meetings/events for the visible day.
Ignore free/unbusy blocks or all-day headers.
For each event, extract:
- title: concise event summary
- start: 24-hour format HH:MM (e.g. "10:00")
- end: 24-hour format HH:MM (e.g. "10:30")
- location: raw room/building string (e.g. "MC 2018", "NH 3001", "Microsoft Teams Meeting", "DC 1302")

Return valid JSON with an "events" array.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType,
          },
        },
        promptText,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            events: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  start: { type: Type.STRING },
                  end: { type: Type.STRING },
                  location: { type: Type.STRING },
                },
                required: ['title', 'start', 'end', 'location'],
              },
            },
          },
          required: ['events'],
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text.trim());
      return res.json({ events: data.events || [] });
    }

    return res.json({ events: [] });
  } catch (err: any) {
    console.error('Error extracting screenshot events:', err);
    return res.status(500).json({ error: err.message || 'Failed to extract screenshot events' });
  }
});

// ============================================================================
// GEMINI TEXT EXTRACTION (Pasted text / invite -> Events JSON)
// ============================================================================

app.post('/api/gemini/extract-text', async (req: Request, res: Response) => {
  try {
    const { text, targetDate } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text content is required' });
    }

    if (!ai) {
      // Simple regex parse fallback
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      const events: any[] = [];
      for (const line of lines) {
        const timeMatch = line.match(/(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
          events.push({
            title: line.replace(timeMatch[0], '').trim() || 'Meeting',
            start: timeMatch[1],
            end: timeMatch[2],
            location: 'MC 2018',
          });
        }
      }
      return res.json({ events });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Extract all calendar events from this pasted text or meeting invite(s):
"""
${text}
"""
Target Date reference: ${targetDate || 'Today'}

Format times in 24-hour HH:MM (e.g. 09:30, 14:00).
Keep raw location as stated (e.g. "MC 2018", "NH 3001", "Microsoft Teams").`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            events: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  start: { type: Type.STRING },
                  end: { type: Type.STRING },
                  location: { type: Type.STRING },
                },
                required: ['title', 'start', 'end', 'location'],
              },
            },
          },
          required: ['events'],
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text.trim());
      return res.json({ events: data.events || [] });
    }

    return res.json({ events: [] });
  } catch (err: any) {
    console.error('Error extracting text events:', err);
    return res.status(500).json({ error: err.message || 'Failed to extract text events' });
  }
});

// ============================================================================
// GEMINI DRAFT MESSAGE (Later start or Join online note for organizer)
// ============================================================================

app.post('/api/gemini/draft-message', async (req: Request, res: Response) => {
  let fallbackMessage = 'Hi,\n\nI have back-to-back meetings and realistic walking takes extra time. Could we adjust by 10-15 minutes or connect online? Thank you!';
  let proposedStart = '10-15 minutes later';

  try {
    const {
      type, // 'later_start' | 'join_online'
      fromMeeting,
      toMeeting,
      gapMinutes = 0,
      travelMinutes = 12,
      minutesLate = 12,
    } = req.body;

    const organizerName = toMeeting?.organizer || 'there';
    const fromBldg = fromMeeting?.buildingCode || 'my previous meeting';
    const toBldg = toMeeting?.buildingCode || 'your meeting';
    const toRoom = toMeeting?.roomNumber ? ` ${toMeeting.roomNumber}` : '';
    proposedStart = computeProposedStartTime(toMeeting?.startTime, minutesLate);

    // Deterministic fallback templates
    if (type === 'join_online') {
      fallbackMessage = `Hi ${organizerName},\n\nI have back-to-back meetings across campus right before our session (${fromBldg} to ${toBldg}${toRoom}) and won't have enough travel time to make it in person by ${toMeeting?.startTime || 'start time'}.\n\nWould it be alright if I joined via Teams / virtually so we can start promptly? Let me know if that works!`;
    } else {
      fallbackMessage = `Hi ${organizerName},\n\nLooking forward to our meeting today. I have a prior commitment ending in ${fromBldg} right at ${fromMeeting?.endTime || 'our start time'}, and realistic room-to-room walking across campus takes ~${travelMinutes} minutes.\n\nCould we start a few minutes later at ${proposedStart} so I can get there without cutting into our discussion? Thank you!`;
    }

    if (!ai) {
      return res.json({
        message: fallbackMessage,
        proposedTime: proposedStart,
      });
    }

    const systemPrompt = `You are a polite, professional University of Waterloo staff member drafting a quick, courteous message to a meeting organizer.
Keep it concise (2-3 short sentences max), respectful, and easy to read on mobile.
State the origin building (${fromBldg}) and destination (${toBldg}${toRoom}), explain the realistic walking travel time (~${travelMinutes} min), and propose a clear, actionable alternative.`;

    const userPrompt =
      type === 'join_online'
        ? `Draft a short polite note asking the organizer (${organizerName}) if you can join virtually via Microsoft Teams instead of in person for "${toMeeting?.title || 'our meeting'}" because your previous meeting ends in ${fromBldg} and walking to ${toBldg}${toRoom} takes ~${travelMinutes} mins.`
        : `Draft a short polite note proposing a slightly later start time (${proposedStart}) for "${toMeeting?.title || 'our meeting'}" because you are coming directly from ${fromBldg} at ${fromMeeting?.endTime || 'scheduled start'} and walking to ${toBldg}${toRoom} takes ~${travelMinutes} mins.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout')), 4000)
    );

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 250,
        },
      }),
      timeoutPromise,
    ]);

    const generated = response.text?.trim() || fallbackMessage;
    return res.json({
      message: generated,
      proposedTime: proposedStart,
    });
  } catch (err: any) {
    console.error('Error drafting message, using fallback template:', err);
    return res.json({
      message: fallbackMessage,
      proposedTime: proposedStart,
    });
  }
});

// ============================================================================
// GEMINI CAMPUS & SCHEDULE AI CHATBOT
// ============================================================================

// Helper for intelligent campus scheduling concierge responses
function generateCampusConciergeReply(
  message: string,
  context: any
): string {
  const q = (message || '').toLowerCase();
  const schedule = context?.currentSchedule || [];
  const legs = context?.travelLegs || [];
  const officeBldg = context?.mainOffice?.buildingCode || 'E7';
  const officeRoom = context?.mainOffice?.roomNumber || '2408';

  // 1. Late meetings inquiry
  if (q.includes('late') || q.includes('delay') || q.includes('miss') || q.includes('ontime') || q.includes('on time')) {
    const lateLeg = legs.find((l: any) => l.status === 'LATE');
    if (lateLeg) {
      return `⚠️ Yes, you are currently flagged as ~${lateLeg.minutesLate || 3} min late to "${lateLeg.toMeeting?.title || 'Budget review'}" (${lateLeg.toMeeting?.buildingCode || 'NH'} ${lateLeg.toMeeting?.roomNumber || '3001'} at ${lateLeg.toMeeting?.startTime || '10:30'}).\n\nWhy: Your prior meeting ends at ${lateLeg.fromMeeting?.endTime || '10:22'}, giving only an ${lateLeg.gapMinutes || 8}-min gap, but realistic room-to-room walking across campus takes ~${lateLeg.questFlowTravelMinutes || 11} min (Google Maps door-to-door is 7m, but elevator + room transit adds 4m).\n\n💡 Fixes you can take in 1 click:\n1. Switch this meeting to Online (Microsoft Teams) right now.\n2. Tap "Draft Note" to ask the organizer for a 10:40 AM start.\n3. Leave your prior meeting in ${lateLeg.fromMeeting?.buildingCode || 'MC'} early by 10:19 AM.`;
    }
    return `All your meetings are currently reachable on time! Every transition has sufficient room-to-room walking buffer.`;
  }

  // 2. Where to work between meetings / study spots
  if (q.includes('work') || q.includes('desk') || q.includes('study') || q.includes('between') || q.includes('break') || q.includes('gap')) {
    return `Between your Budget review in NH 3001 (ends 11:00 AM) and IT check-in in DC 1302 (starts 1:00 PM), you have a 120-minute gap!\n\n🏢 Recommended: Return to your Main Office in ${officeBldg} ${officeRoom}. Walking from NH takes ~14 min, giving you 1 hour and 33 minutes of uninterrupted focus work at your desk before you need to leave for DC at 12:48 PM.\n\n☕ Alternatively, if you prefer to stay near DC: The Bytes Cafe in the DC foyer or the Davis Centre Library have excellent Wi-Fi, desks, and power outlets.`;
  }

  // 3. Start of day / morning departure / office
  if (q.includes('office') || q.includes('start') || q.includes('morning') || q.includes('begin') || q.includes('first')) {
    const firstMeeting = schedule[0] || { title: 'Team sync', startTime: '10:00', rawLocation: 'MC 5479', buildingCode: 'MC' };
    return `Your day starts at your Main Office in ${officeBldg} ${officeRoom}!\n\nYour first commitment is "${firstMeeting.title}" at ${firstMeeting.startTime} in ${firstMeeting.rawLocation || firstMeeting.buildingCode}.\n\n🚶 Morning Route: Depart ${officeBldg} ${officeRoom} by 9:46 AM. Walking from ${officeBldg} floor 2 across campus to ${firstMeeting.buildingCode} takes ~14 minutes (elevator to floor 1, outdoor walk past E5/DC, and elevator to floor 5 in MC). You'll arrive right at 10:00 AM!`;
  }

  // 4. Planning new meetings or afternoon sync
  if (q.includes('plan') || q.includes('sync') || q.includes('add') || q.includes('afternoon') || q.includes('book') || q.includes('schedule')) {
    return `Looking at your afternoon schedule:\n- 13:00–13:30: IT check-in (DC 1302)\n- 14:00–14:30: Vendor call (Teams / Online)\n\nOptimal slots to schedule a 30-min sync in DC:\n1. 14:45 – 15:15: Directly after your vendor call.\n2. 15:30 – 16:00: Leaves ample time to wrap up and walk back to your Main Office in ${officeBldg}.\n\nYou can click the "+ Add" button at the top right or click any open slot in the schedule to lock it in!`;
  }

  // 5. Walking times & campus layout
  if (q.includes('how long') || q.includes('distance') || q.includes('walk') || q.includes('route') || q.includes('time to')) {
    return `Here are realistic room-to-room walking times across campus:\n- Office (${officeBldg}) → MC: ~14 min (departure walk)\n- MC 5479 → NH 3001: ~11 min (cross-campus walk · tight!)\n- NH 3001 → Office (${officeBldg}): ~14 min (return to desk)\n- Office (${officeBldg}) → DC 1302: ~8 min (east campus walk)\n- NH 3001 → DC 1302: ~12 min (Arts quad to science concourse)\n\nQuestFlow accounts for door-to-door Google Maps walking plus 60s room exit, elevator/stair transit per floor, and 60s room finding.`;
  }

  // 6. Default helpful schedule summary
  const totalWalk = context?.totalWalkMinutes || 37;
  return `I have analyzed your University of Waterloo schedule:\n- Total walking planned today: ~${totalWalk} minutes.\n- Main Office: ${officeBldg} ${officeRoom} (Start of day departure at 9:46 AM).\n- Warning: You are flagged ~3m late between MC and NH (ends 10:22, next starts 10:30).\n- Gaps: 120-min window from 11:00 to 13:00 allocated for office desk work.\n\nFeel free to ask about any specific route, adjusting meetings, or where to work on campus!`;
}

app.post('/api/gemini/chat', async (req: Request, res: Response) => {
  try {
    const { message, history = [], context } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const intelligentReply = generateCampusConciergeReply(message, context);

    if (!ai) {
      return res.json({ reply: intelligentReply });
    }

    try {
      const scheduleSummary = context?.currentSchedule
        ? context.currentSchedule
            .map(
              (m: any) =>
                `- ${m.startTime}–${m.endTime}: "${m.title}" in ${m.rawLocation || m.buildingCode} (${
                  m.isOnline ? 'Online / Teams' : 'In-Person'
                })`
            )
            .join('\n')
        : 'No events scheduled.';

      const travelSummary = context?.travelLegs
        ? context.travelLegs
            .map(
              (l: any) =>
                `- From ${l.fromMeeting?.buildingCode} to ${l.toMeeting?.buildingCode}: ${
                  l.questFlowTravelMinutes
                } min travel (Gap: ${l.gapMinutes} min) -> Status: ${l.status}${
                  l.status === 'LATE' ? ` (LATE by ~${l.minutesLate} min)` : ''
                }`
            )
            .join('\n')
        : 'No travel legs.';

      const officeText = context?.mainOffice?.buildingCode
        ? `User's Main Office: ${context.mainOffice.buildingCode} ${context.mainOffice.roomNumber || ''}`
        : 'No main office set.';

      const systemInstruction = `You are QuestFlow AI, the campus scheduling and navigation concierge for University of Waterloo staff and faculty.
You are an expert on UWaterloo campus buildings (MC, DC, NH, E7, E5, SLC, STC, TC, SCH, BMH, B1, B2, etc.), realistic room-to-room walking times with elevator/stairs, and staff office return buffers.
Today's Schedule:
${scheduleSummary}
Travel & Lateness:
${travelSummary}
Office Location:
${officeText}

GUIDELINES:
- Answer questions directly, warmly, and practically.
- Detail realistic walking buffers and recommend 1-click fixes (Teams, later start, early departure) when late.`;

      const contents: any[] = [];
      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-6)) {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: message }],
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 4000)
      );

      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: contents as any,
          config: {
            systemInstruction,
          },
        }),
        timeoutPromise,
      ]);

      const reply = response.text?.trim() || intelligentReply;
      return res.json({ reply });
    } catch (apiErr) {
      console.warn('Gemini API call failed or timed out, falling back to campus concierge reply:', apiErr);
      return res.json({ reply: intelligentReply });
    }
  } catch (err: any) {
    console.error('Error in AI chatbot endpoint:', err);
    return res.json({
      reply: 'You have a full day on campus today. MC to NH is flagged ~3m late due to an 8-minute gap. Consider switching to Teams or leaving MC by 10:19 AM.',
    });
  }
});

// ============================================================================
// GEMINI NATURAL-LANGUAGE SCHEDULING PARSER ("30 min check-in with Sarah in MC 2018 after 11")
// ============================================================================

app.post('/api/gemini/parse-schedule-prompt', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Deterministic fallback regex first (works 100% offline)
    let title = prompt;
    let durationMinutes = 30;
    let buildingCode = 'MC';
    let roomNumber = '';
    let floor = 1;
    let windowStart = '';
    const isOnline =
      prompt.toLowerCase().includes('teams') ||
      prompt.toLowerCase().includes('zoom') ||
      prompt.toLowerCase().includes('online') ||
      prompt.toLowerCase().includes('virtual');

    // Check duration e.g. "30 min", "45 minutes", "1 hour"
    const durMatch = prompt.match(/(\d+)\s*(?:min|minute|m\b)/i);
    if (durMatch) durationMinutes = parseInt(durMatch[1], 10);
    const hrMatch = prompt.match(/(\d+)\s*(?:hour|hr|h\b)/i);
    if (hrMatch) durationMinutes = parseInt(hrMatch[1], 10) * 60;

    // Check time window e.g. "after 11", "after 11:00", "around 2pm", "at 14:00"
    const afterMatch = prompt.match(/(?:after|at|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (afterMatch) {
      let h = parseInt(afterMatch[1], 10);
      const m = afterMatch[2] ? parseInt(afterMatch[2], 10) : 0;
      const ampm = (afterMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      if (!ampm && h >= 1 && h <= 6) h += 12;
      windowStart = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    // Check building & room
    const bldgMatch = prompt.match(/\b(MC|NH|DC|E7|E5|TC|SCH|STC|SLC|EV1|EV2|EV3|HH|BMH|QNC|B1|B2|PHYS)\b/i);
    if (bldgMatch) buildingCode = bldgMatch[1].toUpperCase();

    const roomMatch = prompt.match(/\b(\d{3,4}[A-Z]?)\b/);
    if (roomMatch) {
      roomNumber = roomMatch[1];
      const firstDigit = parseInt(roomNumber[0], 10);
      if (!isNaN(firstDigit) && firstDigit >= 1) floor = firstDigit;
    }

    // Clean up title
    title = prompt
      .replace(/(\d+)\s*(?:min|minute|m|hour|hr)\b/gi, '')
      .replace(/(?:after|at|from)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
      .replace(/\bin\s+[A-Z0-9\s]+/gi, '')
      .replace(/\bwith\s+([A-Za-z\s]+)/i, 'with $1')
      .trim();

    if (!title) title = 'Meeting';
    title = title.charAt(0).toUpperCase() + title.slice(1);

    const fallbackResult = {
      title,
      durationMinutes,
      buildingCode: isOnline ? 'ONLINE' : buildingCode,
      roomNumber,
      floor,
      windowStart,
      isOnline,
    };

    if (!ai) {
      return res.json(fallbackResult);
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Parse this scheduling request at University of Waterloo into structured event details:
"${prompt}"

Extract:
- title: concise meeting title (e.g. "Check-in with Sarah")
- durationMinutes: integer duration in minutes (default 30)
- buildingCode: Waterloo campus building code (MC, NH, DC, E7, TC, etc.) or "ONLINE"
- roomNumber: room number if specified (e.g. "2018", "1302")
- floor: integer floor (first digit of 4-digit room, e.g. 2018 -> 2, 5479 -> 5)
- windowStart: HH:MM 24-hr if requested like "after 11" -> "11:00", or null
- isOnline: boolean true if Teams, Zoom, or virtual`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            durationMinutes: { type: Type.INTEGER },
            buildingCode: { type: Type.STRING },
            roomNumber: { type: Type.STRING },
            floor: { type: Type.INTEGER },
            windowStart: { type: Type.STRING },
            isOnline: { type: Type.BOOLEAN },
          },
          required: ['title', 'durationMinutes', 'buildingCode', 'floor', 'isOnline'],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return res.json({
        title: parsed.title || fallbackResult.title,
        durationMinutes: parsed.durationMinutes || fallbackResult.durationMinutes,
        buildingCode: parsed.buildingCode || fallbackResult.buildingCode,
        roomNumber: parsed.roomNumber || fallbackResult.roomNumber,
        floor: parsed.floor || fallbackResult.floor,
        windowStart: parsed.windowStart || fallbackResult.windowStart,
        isOnline: Boolean(parsed.isOnline),
      });
    }

    return res.json(fallbackResult);
  } catch (err: any) {
    console.error('Error parsing schedule prompt, using fallback:', err);
    // Even if Gemini has a temporary spike, fallback regex seamlessly succeeds
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    let durationMinutes = 30;
    let buildingCode = 'MC';
    let roomNumber = '';
    let floor = 1;
    let windowStart = '';
    const isOnline =
      prompt.toLowerCase().includes('teams') ||
      prompt.toLowerCase().includes('zoom') ||
      prompt.toLowerCase().includes('online') ||
      prompt.toLowerCase().includes('virtual');

    const durMatch = prompt.match(/(\d+)\s*(?:min|minute|m\b)/i);
    if (durMatch) durationMinutes = parseInt(durMatch[1], 10);
    const afterMatch = prompt.match(/(?:after|at|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (afterMatch) {
      let h = parseInt(afterMatch[1], 10);
      const m = afterMatch[2] ? parseInt(afterMatch[2], 10) : 0;
      const ampm = (afterMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      if (!ampm && h >= 1 && h <= 6) h += 12;
      windowStart = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    const bldgMatch = prompt.match(/\b(MC|NH|DC|E7|E5|TC|SCH|STC|SLC|EV1|EV2|EV3|HH|BMH|QNC|B1|B2|PHYS)\b/i);
    if (bldgMatch) buildingCode = bldgMatch[1].toUpperCase();
    const roomMatch = prompt.match(/\b(\d{3,4}[A-Z]?)\b/);
    if (roomMatch) {
      roomNumber = roomMatch[1];
      const firstDigit = parseInt(roomNumber[0], 10);
      if (!isNaN(firstDigit) && firstDigit >= 1) floor = firstDigit;
    }
    return res.json({
      title: prompt || 'Meeting',
      durationMinutes,
      buildingCode: isOnline ? 'ONLINE' : buildingCode,
      roomNumber,
      floor,
      windowStart,
      isOnline,
    });
  }
});

function computeProposedStartTime(startTime?: string, minLate = 10): string {
  if (!startTime) return '10-15 minutes later';
  const [h, m] = startTime.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + Math.max(10, minLate);
  const newH = Math.floor(total / 60) % 24;
  const newM = Math.ceil(total % 60 / 5) * 5; // round to nearest 5 min
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
}

// ============================================================================
// GOOGLE MAPS RUNTIME CONFIG
// ============================================================================

app.get('/api/config/maps', (_req: Request, res: Response) => {
  const mapsApiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';
  res.json({ apiKey: mapsApiKey });
});

// ============================================================================
// SERVER SETUP & VITE INTEGRATION
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`QuestFlow server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
