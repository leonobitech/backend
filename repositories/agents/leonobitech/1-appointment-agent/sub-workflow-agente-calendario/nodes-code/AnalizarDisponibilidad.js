// ============================================================================
// AVAILABILITY ANALYZER - Calendar Agent v2
// ============================================================================
// INPUT: ParseInput (booking data) + GetTurnosSemana (existing bookings)
// OUTPUT: Available options with assigned worker
// ============================================================================
// MODEL: 2 workers (primary, secondary), continuous active blocks,
// very_complex services with 3 phases (active_start + process + active_end).
// During the process phase the worker is FREE to serve other clients.
// ============================================================================

const bookingsRaw = $('GetTurnosSemana').all();
const bookings = bookingsRaw.length > 0 ? bookingsRaw.map(item => item.json) : [];
const input = $('ParseInput').first().json;

// ============================================================================
// WORKER CONFIGURATION — Multi-tenant via environment variables
// ============================================================================
const WORKERS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
};
const WORKER_DISPLAY = {
  primary: $env.WORKER_PRIMARY_NAME || 'Leraysi',
  secondary: $env.WORKER_SECONDARY_NAME || 'Companera',
};
function getWorkerDisplay(worker) {
  return WORKER_DISPLAY[worker] || worker;
}
function normalizeWorker(raw) {
  if (!raw) return WORKERS.PRIMARY;
  const val = (typeof raw === 'object' ? raw.value : raw) || '';
  const lower = val.toLowerCase().trim();
  if (lower === 'primary') return WORKERS.PRIMARY;
  if (lower === 'secondary') return WORKERS.SECONDARY;
  if (lower === (WORKER_DISPLAY.primary || '').toLowerCase()) return WORKERS.PRIMARY;
  if (lower === (WORKER_DISPLAY.secondary || '').toLowerCase()) return WORKERS.SECONDARY;
  return WORKERS.PRIMARY;
}
const WORKER_LIST = [WORKERS.PRIMARY, WORKERS.SECONDARY];

// ============================================================================
// CONSTANTS
// ============================================================================
const DAY_START = 540;    // 09:00 in minutes from midnight
const DAY_END = 1140;     // 19:00 in minutes from midnight
const STEP = 15;          // Search granularity in minutes

// Standard phases for all very_complex services
const PHASES_VERY_COMPLEX = { active_start: 180, process_time: 300, active_end: 120 };

// Lookup: base_min per service (to calculate committed time in process window)
const SERVICES_BASE_MIN = {
  'Corte mujer': 60,
  'Alisado brasileño': 600, 'Alisado keratina': 600,
  'Mechas completas': 600, 'Tintura completa': 600, 'Balayage': 600,
  'Tintura raíz': 60,
  'Manicura simple': 120, 'Manicura semipermanente': 180, 'Pedicura': 120,
  'Depilación cera piernas': 120, 'Depilación cera axilas': 60, 'Depilación cera bikini': 60,
  'Depilación láser piernas': 120, 'Depilación láser axilas': 60,
};

// very_complex services (do NOT consume process window — they ARE the source)
const SERVICES_VERY_COMPLEX = new Set([
  'Alisado brasileño', 'Alisado keratina', 'Mechas completas',
  'Tintura completa', 'Balayage'
]);

// ============================================================================
// HELPERS
// ============================================================================
function timeToMinutes(timeStr) {
  if (!timeStr) return DAY_START;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
}

function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

// ============================================================================
// STEP 1: BUILD ACTIVE BLOCKS PER WORKER PER DAY
// ============================================================================
const blocksByDayWorker = {};
const processWindowsByDay = {};

function initializeDay(date) {
  if (!blocksByDayWorker[date]) {
    blocksByDayWorker[date] = {};
    for (const w of WORKER_LIST) {
      blocksByDayWorker[date][w] = [];
    }
    processWindowsByDay[date] = [];
  }
}

bookings.forEach(booking => {
  const date = booking.date?.split('T')[0];
  if (!date) return;

  const state = booking.state?.value || booking.state || '';
  if (state === 'cancelled' || state === 'expired') return;

  if (state === 'pending_payment' && booking.expires_at) {
    const expiresAt = new Date(booking.expires_at);
    if (expiresAt < new Date()) return;
  }

  initializeDay(date);

  const worker = normalizeWorker(booking.worker);
  const startTime = timeToMinutes(booking.time || '09:00');
  const duration = Number(booking.duration_min) || 60;
  const complexity = booking.max_complexity?.value || booking.max_complexity || 'medium';

  const bookingId = booking.odoo_booking_id || booking.id || null;

  if (complexity === 'very_complex') {
    const ai = PHASES_VERY_COMPLEX.active_start;
    const pr = PHASES_VERY_COMPLEX.process_time;
    const af = PHASES_VERY_COMPLEX.active_end;

    blocksByDayWorker[date][worker].push(
      { start: startTime, end: startTime + ai, booking_id: bookingId },
      { start: startTime + ai + pr, end: startTime + ai + pr + af, booking_id: bookingId }
    );

    processWindowsByDay[date].push({
      worker,
      start: startTime + ai,
      end: startTime + ai + pr,
      booking_id: bookingId
    });

    let subServices = [];
    if (booking.service_detail && booking.service_detail.includes('+')) {
      subServices = booking.service_detail.split('+').map(s => s.trim());
    } else if (Array.isArray(booking.service) && booking.service.length > 1) {
      subServices = booking.service.map(s => s?.value || s);
    }

    if (subServices.length > 1) {
      let committedTime = 0;
      for (const srv of subServices) {
        if (!SERVICES_VERY_COMPLEX.has(srv)) {
          committedTime += (SERVICES_BASE_MIN[srv] || 60);
        }
      }
      if (committedTime > 0) {
        const processStart = startTime + ai;
        blocksByDayWorker[date][worker].push({
          start: processStart,
          end: Math.min(processStart + committedTime, processStart + pr),
          booking_id: bookingId
        });
      }
    }
  } else {
    blocksByDayWorker[date][worker].push({
      start: startTime,
      end: startTime + duration,
      booking_id: bookingId
    });
  }
});

// ============================================================================
// STEP 2: GENERATE SEARCH DAYS
// ============================================================================
const now = new Date();
const nowArgentina = new Date(now.getTime() - 3 * 60 * 60 * 1000);

const availableDays = [];
for (let i = 1; i <= 30; i++) {
  const date = new Date(now);
  date.setDate(now.getDate() + i);
  const dateStr = date.toISOString().split('T')[0];
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) continue;
  availableDays.push({
    date: dateStr,
    day_name: dayNames[dayOfWeek],
    dateObj: date
  });
}

// ============================================================================
// STEP 3: NEW SERVICE PARAMETERS
// ============================================================================
const newDuration = input.estimated_duration || 60;
const newComplexity = input.max_complexity || 'medium';
const isVeryComplex = newComplexity === 'very_complex' && input.active_start != null;

const newActiveStart = input.active_start || 0;
const newProcessTime = input.process_time || 0;
const newActiveEnd = input.active_end || 0;

const requestedDateRaw = input.requested_date || '';
const requestedDate = requestedDateRaw.includes('T')
  ? requestedDateRaw.split('T')[0]
  : requestedDateRaw.split(' ')[0];
const requestedTimeMin = input.requested_time ? timeToMinutes(input.requested_time) : null;
const timePreference = input.time_preference || null;

// ============================================================================
// STEP 4: BLOCK CALCULATION FUNCTIONS
// ============================================================================
function newServiceActiveBlocks(startTime) {
  if (isVeryComplex) {
    return [
      { start: startTime, end: startTime + newActiveStart },
      { start: startTime + newActiveStart + newProcessTime, end: startTime + newActiveStart + newProcessTime + newActiveEnd }
    ];
  }
  return [{ start: startTime, end: startTime + newDuration }];
}

function withinWorkingHours(blocks) {
  return blocks.every(b => b.start >= DAY_START && b.end <= DAY_END);
}

function noConflicts(newBlocks, existingBlocks) {
  for (const newB of newBlocks) {
    for (const existing of existingBlocks) {
      if (overlaps(newB.start, newB.end, existing.start, existing.end)) {
        return false;
      }
    }
  }
  return true;
}

// ============================================================================
// STEP 4b: EXTRACT EXISTING BOOKING DATA
// ============================================================================
let existingService = null;
let existingBookingId = null;
let existingPrice = null;
let existingDuration = null;
let existingComplexity = null;
let existingDeposit = null;
let existingWorker = null;
let existingTime = null;

if (input.booking_scheduled && input.lead_row_id) {
  const clientBooking = bookings.find(b => {
    const stateB = b.state?.value || b.state || '';
    if (stateB === 'cancelled' || stateB === 'expired') return false;

    let bookingClientRowId = null;
    if (Array.isArray(b.client_id) && b.client_id.length > 0) {
      bookingClientRowId = b.client_id[0]?.id;
    } else if (b.client_id && typeof b.client_id === 'object') {
      bookingClientRowId = b.client_id.id || b.client_id.value;
    } else {
      bookingClientRowId = b.client_id;
    }
    return bookingClientRowId && String(bookingClientRowId) === String(input.lead_row_id);
  });

  if (clientBooking) {
    let serviceValue = null;
    if (clientBooking.service_detail) {
      serviceValue = clientBooking.service_detail;
    } else if (Array.isArray(clientBooking.service) && clientBooking.service.length > 0) {
      serviceValue = clientBooking.service.map(s => s?.value || s).join(' + ');
    } else if (clientBooking.service?.value) {
      serviceValue = clientBooking.service.value;
    } else {
      serviceValue = clientBooking.service;
    }
    existingService = serviceValue || null;
    existingBookingId = clientBooking.odoo_booking_id || null;
    existingPrice = clientBooking.price ? Number(clientBooking.price) : null;
    existingDuration = clientBooking.duration_min ? Number(clientBooking.duration_min) : null;
    existingComplexity = clientBooking.max_complexity?.value || clientBooking.max_complexity || null;
    existingDeposit = clientBooking.deposit_amount ? Number(clientBooking.deposit_amount) : null;
    existingWorker = normalizeWorker(clientBooking.worker);
    existingTime = clientBooking.time || null;
  }
}

// ============================================================================
// STEP 5: SEARCH AVAILABLE SLOTS
// ============================================================================
const candidates = [];

let searchDays = [...availableDays];
if (requestedDate) {
  const idxReq = searchDays.findIndex(d => d.date === requestedDate);
  if (idxReq > 0) {
    const [reqDay] = searchDays.splice(idxReq, 1);
    searchDays.unshift(reqDay);
  }
}
searchDays = searchDays.slice(0, 14);

const isReschedule = input.booking_scheduled && existingBookingId && !input.add_to_existing_booking;

for (const day of searchDays) {
  if (candidates.length >= 12) break;

  initializeDay(day.date);
  const dayBlocks = blocksByDayWorker[day.date];

  for (let startMin = DAY_START; startMin < DAY_END; startMin += STEP) {
    const newBlocks = newServiceActiveBlocks(startMin);
    if (!withinWorkingHours(newBlocks)) continue;

    for (const worker of WORKER_LIST) {
      const workerBlocks = isReschedule
        ? dayBlocks[worker].filter(b => b.booking_id !== existingBookingId)
        : dayBlocks[worker];
      if (!noConflicts(newBlocks, workerBlocks)) continue;

      const isRequestedDate = day.date === requestedDate;
      let score = 0;

      if (requestedTimeMin !== null && startMin === requestedTimeMin) score += 10;
      if (isRequestedDate) score += 8;
      if (timePreference === 'manana' && startMin < 12 * 60) score += 5;
      else if (timePreference === 'tarde' && startMin >= 13 * 60) score += 5;
      if (requestedTimeMin !== null && Math.abs(startMin - requestedTimeMin) <= 60) score += 2;

      const dayLoad = (dayBlocks[worker] || []).length;
      score -= dayLoad * 2;

      const endTimeMin = isVeryComplex
        ? startMin + newActiveStart + newProcessTime + newActiveEnd
        : startMin + newDuration;

      candidates.push({
        worker,
        date: day.date,
        start_time: minutesToTime(startMin),
        end_time: minutesToTime(endTimeMin),
        day_name: day.day_name,
        duration_min: isVeryComplex ? (newActiveStart + newProcessTime + newActiveEnd) : newDuration,
        score,
        is_alternative_date: !isRequestedDate,
        in_process: false
      });
    }
  }
}

// ============================================================================
// STEP 6: SPECIAL CASE — ADD SERVICE IN PROCESS WINDOW
// ============================================================================
if (input.add_to_existing_booking && input.booking_date) {
  const bookingDate = input.booking_date.includes('T')
    ? input.booking_date.split('T')[0]
    : input.booking_date.split(' ')[0];

  const windows = processWindowsByDay[bookingDate] || [];

  for (const window of windows) {
    if (isVeryComplex) continue;

    const windowDuration = window.end - window.start;
    if (newDuration > windowDuration) continue;

    const windowWorkerBlocks = (blocksByDayWorker[bookingDate] || {})[window.worker] || [];

    for (let start = window.start; start + newDuration <= window.end; start += STEP) {
      const newBlock = [{ start: start, end: start + newDuration }];

      if (noConflicts(newBlock, windowWorkerBlocks)) {
        candidates.unshift({
          worker: window.worker,
          date: bookingDate,
          start_time: minutesToTime(start),
          end_time: minutesToTime(start + newDuration),
          day_name: dayNames[new Date(bookingDate + 'T12:00:00').getDay()],
          duration_min: newDuration,
          score: 20,
          is_alternative_date: false,
          in_process: true
        });
        break;
      }
    }
  }
}

// ============================================================================
// STEP 6b: ADD SERVICE WITH AVAILABILITY VALIDATION
// ============================================================================
if (input.add_to_existing_booking && existingBookingId) {
  candidates.length = 0;

  const currentWorker = existingWorker || WORKERS.PRIMARY;
  const existDuration = existingDuration || 60;
  const bookingDateExisting = input.booking_date
    ? (input.booking_date.includes('T') ? input.booking_date.split('T')[0] : input.booking_date.split(' ')[0])
    : requestedDate;
  const originalTimeMin = existingTime ? timeToMinutes(existingTime) : (requestedTimeMin || DAY_START);

  function blocksWithoutCurrent(blocksArr) {
    return blocksArr.filter(b => b.booking_id == null || String(b.booking_id) !== String(existingBookingId));
  }

  const addServiceSearchDays = [];
  const existingDay = availableDays.find(d => d.date === bookingDateExisting);
  if (existingDay) {
    addServiceSearchDays.push(existingDay);
  } else if (bookingDateExisting) {
    const dateObj = new Date(bookingDateExisting + 'T12:00:00');
    if (dateObj.getDay() !== 0) {
      addServiceSearchDays.push({
        date: bookingDateExisting,
        day_name: dayNames[dateObj.getDay()],
        dateObj
      });
    }
  }
  for (const day of availableDays) {
    if (day.date !== bookingDateExisting) {
      addServiceSearchDays.push(day);
    }
    if (addServiceSearchDays.length >= 14) break;
  }

  if (isVeryComplex) {
    // ── STRATEGY B: very_complex at 9:00 + existing in process window ──
    const windowStart = DAY_START + PHASES_VERY_COMPLEX.active_start;
    const windowEnd = windowStart + PHASES_VERY_COMPLEX.process_time;

    if (existDuration <= PHASES_VERY_COMPLEX.process_time) {
      for (const day of addServiceSearchDays) {
        if (candidates.length >= 6) break;
        initializeDay(day.date);
        const dayBlocks = blocksByDayWorker[day.date];
        const isSameDay = day.date === bookingDateExisting;

        const orderedWorkers = [currentWorker, ...WORKER_LIST.filter(w => w !== currentWorker)];

        for (const worker of orderedWorkers) {
          const vcBlocks = [
            { start: DAY_START, end: DAY_START + PHASES_VERY_COMPLEX.active_start },
            { start: DAY_START + PHASES_VERY_COMPLEX.active_start + PHASES_VERY_COMPLEX.process_time,
              end: DAY_START + PHASES_VERY_COMPLEX.active_start + PHASES_VERY_COMPLEX.process_time + PHASES_VERY_COMPLEX.active_end }
          ];

          const workerBlocks = isSameDay
            ? blocksWithoutCurrent(dayBlocks[worker] || [])
            : (dayBlocks[worker] || []);

          if (!noConflicts(vcBlocks, workerBlocks)) continue;

          let existingServiceInProcess = null;
          for (let s = windowStart; s + existDuration <= windowEnd; s += STEP) {
            const block = [{ start: s, end: s + existDuration }];
            if (noConflicts(block, workerBlocks)) {
              existingServiceInProcess = s;
              break;
            }
          }

          if (existingServiceInProcess === null) continue;

          candidates.push({
            worker,
            date: day.date,
            start_time: minutesToTime(DAY_START),
            end_time: minutesToTime(DAY_END),
            day_name: day.day_name,
            duration_min: PHASES_VERY_COMPLEX.active_start + PHASES_VERY_COMPLEX.process_time + PHASES_VERY_COMPLEX.active_end,
            score: (isSameDay ? 18 : 0) + (worker === currentWorker ? 5 : 0),
            is_alternative_date: !isSameDay,
            in_process: false,
            is_add_service: true,
            original_time: existingTime || minutesToTime(originalTimeMin),
            service_relocated: true,
            service_in_process: true,
            existing_service_time: minutesToTime(existingServiceInProcess)
          });
        }
      }
    }
  } else if (existingComplexity === 'very_complex') {
    // ── STRATEGY C: existing is very_complex, new in process window ──
    const windowStartC = DAY_START + PHASES_VERY_COMPLEX.active_start;
    const windowEndC = windowStartC + PHASES_VERY_COMPLEX.process_time;

    for (const day of addServiceSearchDays) {
      if (candidates.length >= 6) break;
      initializeDay(day.date);
      const dayBlocks = blocksByDayWorker[day.date];
      const isSameDay = day.date === bookingDateExisting;

      if (isSameDay) {
        const orderedWorkersC = [currentWorker, ...WORKER_LIST.filter(w => w !== currentWorker)];
        for (const worker of orderedWorkersC) {
          const workerBlocks = dayBlocks[worker] || [];

          for (let start = windowStartC; start + newDuration <= windowEndC; start += STEP) {
            const newBlock = [{ start, end: start + newDuration }];
            if (noConflicts(newBlock, workerBlocks)) {
              const isSameWorker = worker === currentWorker;
              candidates.push({
                worker,
                date: day.date,
                start_time: isSameWorker ? minutesToTime(DAY_START) : minutesToTime(start),
                end_time: isSameWorker ? minutesToTime(DAY_END) : minutesToTime(start + newDuration),
                day_name: day.day_name,
                duration_min: isSameWorker ? 600 : newDuration,
                score: 20 + (isSameWorker ? 5 : 0),
                is_alternative_date: false,
                in_process: isSameWorker,
                is_add_service: true,
                is_additional_booking: !isSameWorker,
                original_booking_worker: isSameWorker ? null : currentWorker,
                original_time: existingTime || minutesToTime(originalTimeMin),
                service_relocated: false,
                service_in_process: isSameWorker,
                existing_service_time: minutesToTime(start)
              });
              break;
            }
          }
        }
      } else {
        const orderedWorkersAlt = [currentWorker, ...WORKER_LIST.filter(w => w !== currentWorker)];
        for (const worker of orderedWorkersAlt) {
          const workerBlocks = dayBlocks[worker] || [];
          for (let s = DAY_START; s + newDuration <= DAY_END; s += STEP) {
            if (noConflicts([{ start: s, end: s + newDuration }], workerBlocks)) {
              candidates.push({
                worker,
                date: day.date,
                start_time: minutesToTime(s),
                end_time: minutesToTime(s + newDuration),
                day_name: day.day_name,
                duration_min: newDuration,
                score: (worker === currentWorker ? 3 : 0),
                is_alternative_date: true,
                in_process: false,
                is_add_service: true,
                is_additional_booking: true,
                original_booking_worker: currentWorker,
                original_time: existingTime || minutesToTime(originalTimeMin),
                service_relocated: false,
                service_in_process: false,
                existing_service_time: null
              });
              break;
            }
          }
          if (candidates.some(c => c.date === day.date)) break;
        }
      }
    }
  } else {
    // ── STRATEGY A: same worker (combined) or additional booking (other) ──
    const combinedDuration = existDuration + newDuration;
    const existingEndMin = originalTimeMin + existDuration;

    for (const day of addServiceSearchDays) {
      if (candidates.length >= 12) break;
      initializeDay(day.date);
      const dayBlocks = blocksByDayWorker[day.date];
      const isSameDay = day.date === bookingDateExisting;

      const orderedWorkers = [currentWorker, ...WORKER_LIST.filter(w => w !== currentWorker)];

      for (const worker of orderedWorkers) {
        const isSameWorker = worker === currentWorker;
        const searchDuration = isSameWorker ? combinedDuration : newDuration;

        const workerBlocks = (isSameDay && isSameWorker)
          ? blocksWithoutCurrent(dayBlocks[worker] || [])
          : (dayBlocks[worker] || []);

        for (let startMin = DAY_START; startMin + searchDuration <= DAY_END; startMin += STEP) {
          const block = [{ start: startMin, end: startMin + searchDuration }];

          if (!withinWorkingHours(block)) continue;
          if (!noConflicts(block, workerBlocks)) continue;

          if (!isSameWorker && isSameDay) {
            const origStart = originalTimeMin;
            const origEnd = originalTimeMin + existDuration;
            if (overlaps(startMin, startMin + searchDuration, origStart, origEnd)) continue;
          }

          let score = 0;
          if (isSameDay) score += 20;

          if (isSameWorker) {
            if (startMin === originalTimeMin) score += 20;
            else if (isSameDay && Math.abs(startMin - originalTimeMin) <= 60) score += 5;
            score += 3;
          } else {
            if (isSameDay && startMin === existingEndMin) score += 20;
            else if (isSameDay && Math.abs(startMin - existingEndMin) <= 60) score += 5;
          }

          const dayLoad = (dayBlocks[worker] || []).length;
          score -= dayLoad * 2;

          candidates.push({
            worker,
            date: day.date,
            start_time: minutesToTime(startMin),
            end_time: minutesToTime(startMin + searchDuration),
            day_name: day.day_name,
            duration_min: searchDuration,
            score,
            is_alternative_date: !isSameDay,
            in_process: false,
            is_add_service: true,
            is_additional_booking: !isSameWorker,
            original_booking_worker: isSameWorker ? null : currentWorker,
            original_time: existingTime || minutesToTime(originalTimeMin),
            service_relocated: isSameWorker ? (startMin !== originalTimeMin) : false,
            service_in_process: false
          });
        }
      }
    }
  }
}

// ============================================================================
// STEP 7: DEDUPLICATE AND SELECT TOP 3
// ============================================================================
const seen = new Map();
const uniqueCandidates = [];
for (const c of candidates) {
  const key = `${c.date}-${c.start_time}`;
  if (!seen.has(key)) {
    seen.set(key, uniqueCandidates.length);
    uniqueCandidates.push(c);
  } else {
    const idx = seen.get(key);
    if (c.score > uniqueCandidates[idx].score) {
      uniqueCandidates[idx] = c;
    }
  }
}

uniqueCandidates.sort((a, b) => b.score - a.score);

const selected = [];
for (const c of uniqueCandidates) {
  const tooClose = selected.some(e =>
    e.date === c.date &&
    e.worker === c.worker &&
    Math.abs(timeToMinutes(e.start_time) - timeToMinutes(c.start_time)) < 60
  );
  if (!tooClose) selected.push(c);
  if (selected.length >= 3) break;
}

const options = selected.map((s, i) => {
  const dateObj = new Date(s.date + 'T12:00:00');
  return {
    option: i + 1,
    worker: s.worker,
    date: s.date,
    start_time: s.start_time,
    end_time: s.end_time,
    day_name: s.day_name,
    human_date: `${s.day_name.toLowerCase()} ${dateObj.getDate()} de ${months[dateObj.getMonth()]}`,
    duration_min: s.duration_min,
    is_alternative_date: s.is_alternative_date,
    in_process: s.in_process,
    ...(s.is_add_service ? {
      is_add_service: true,
      is_additional_booking: s.is_additional_booking || false,
      original_booking_worker: s.original_booking_worker || null,
      original_time: s.original_time,
      service_relocated: s.service_relocated,
      service_in_process: s.service_in_process,
      existing_service_time: s.existing_service_time
    } : {})
  };
});

// ============================================================================
// STEP 8: DETERMINE AVAILABILITY
// ============================================================================
const available = options.length > 0;
let unavailableReason = null;

if (!available) {
  unavailableReason = `No availability for ${input.service_detail || 'the requested service'} in the coming days. Both workers have full schedules.`;
}

// ============================================================================
// STEP 9: SUMMARY FOR BUILDAGENTPROMPT
// ============================================================================
const summary = options.length > 0
  ? options.map(o => `Option ${o.option}: ${o.human_date} ${o.start_time}-${o.end_time} (Worker ${getWorkerDisplay(o.worker)})`).join('\n')
  : 'No availability in the coming days';

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    ...input,

    available,
    options,
    unavailable_message: unavailableReason,
    recommended_slots: options,

    date_available: options.some(o => !o.is_alternative_date),
    requested_date: requestedDateRaw,
    unavailable_reason: unavailableReason,
    availability_summary: summary,

    alternatives: options.filter(o => o.is_alternative_date).map(o => ({
      date: o.date,
      day_name: o.day_name
    })),

    existing_service: existingService,
    existing_booking_id: existingBookingId,
    existing_booking_price: existingPrice,
    existing_duration: existingDuration,
    existing_complexity: existingComplexity,
    existing_deposit: existingDeposit,
    existing_worker: existingWorker,
    existing_time: existingTime,

    action: input.action || null,
    existing_bookings_count: bookings.length
  }
}];
